import { average } from "@/lib/utils";
import type {
  MatchConfidence,
  MatchFactorKey,
  MatchRecord,
  MatchType,
  MatchTypeConfig,
  Membership,
  Organization,
  Post,
  Profile,
  Space,
  SpaceIntent,
  SpaceMembership,
} from "@/lib/domain";
import { stableDefaultMatchTypeConfigs } from "@/lib/match-config";
import { canonicalLegacyBio, distinctLegacyProfileText } from "@/lib/profile-bio";
import { buildLocalEmbedding, LOCAL_EMBEDDING_MODEL } from "@/server/embeddings";
import { isApprovedMentor } from "@/server/permissions";

export const MATCHING_ALGORITHM_VERSION = "hybrid-v4";
export const SPACE_INTENT_EMBEDDING_WEIGHT = 0.6;

const MATCH_SCORE_MIN = 1;
const MATCH_SCORE_MAX = 100;
const factorKeys: MatchFactorKey[] = [
  "semantic",
  "skills",
  "venture",
  "availability",
  "work_style",
  "location",
];

interface FactorAssessment {
  score: number;
  quality: number;
}

interface MatchingScoreContext {
  populationSize: number;
  documentFrequencies: Map<string, number>;
}

interface MatchAssessment {
  breakdown: Record<MatchFactorKey, number>;
  confidence: MatchConfidence;
  eligible: boolean;
  explainableFactors: ReadonlySet<MatchFactorKey>;
  score: number;
}

const memberMatchReasonLabels = {
  semantic: "their experience aligns with what you are looking for",
  skills: "their capabilities complement the needs you shared",
  venture: "you are working in relevant problem areas",
  availability: "your availability and commitment look compatible",
  work_style: "your ways of working look compatible",
  location: "the location or time-zone fit looks practical",
} as const;

export interface SpaceMatchingMember {
  membership: Membership;
  profile: Profile;
  spaceMembership: SpaceMembership;
  intent: SpaceIntent;
}

const tagAliases: Record<string, string> = {
  "co founder": "cofounder",
  "co-founder": "cofounder",
  "biz dev": "business development",
  bd: "business development",
  "go to market": "gtm",
  "go-to-market": "gtm",
  "machine learning": "ml",
  "artificial intelligence": "ai",
  "asia pacific": "apac",
  "asia-pacific": "apac",
  sea: "southeast asia",
  teammate: "collaborator",
  collaborators: "collaborator",
  adviser: "advisor",
};

const genericMatchTokens = new Set([
  "advisor",
  "co",
  "cofounder",
  "collaborator",
  "founder",
  "match",
  "mentor",
  "mentoring",
  "participant",
  "participants",
  "teammate",
]);

const stopWords = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function normalized(value: string) {
  const key = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return tagAliases[key] ?? key;
}

function normalizedSet(values: string[]) {
  return new Set(values.map(normalized).filter(Boolean));
}

function uniqueValues(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalized(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function meaningfulTokens(value: string, ignoreMatchLabels = false) {
  const tokens = normalized(value).match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    tokens.filter(
      (token) =>
        !stopWords.has(token) && (!ignoreMatchLabels || !genericMatchTokens.has(token)),
    ),
  );
}

function tagSimilarity(left: string, right: string, ignoreMatchLabels = false) {
  const normalizedLeft = normalized(left);
  const normalizedRight = normalized(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) {
    return ignoreMatchLabels && !meaningfulTokens(left, true).size ? 0 : 1;
  }

  const leftTokens = meaningfulTokens(left, ignoreMatchLabels);
  const rightTokens = meaningfulTokens(right, ignoreMatchLabels);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  if (!intersection) return 0;
  const requirementCoverage = intersection / leftTokens.size;
  const jaccard = intersection / new Set([...leftTokens, ...rightTokens]).size;
  return Math.min(1, requirementCoverage * 0.7 + jaccard * 0.3);
}

function rarityWeight(value: string, context?: MatchingScoreContext) {
  if (!context?.populationSize) return 1;
  const frequency = context.documentFrequencies.get(normalized(value)) ?? 0;
  return Math.max(
    1,
    Math.min(3, Math.log((context.populationSize + 1) / (frequency + 1)) + 1),
  );
}

function directionalListAssessment(
  requirements: string[],
  capabilities: string[],
  options: { context?: MatchingScoreContext; ignoreMatchLabels?: boolean } = {},
): FactorAssessment {
  const preparedRequirements = uniqueValues(requirements).filter(
    (value) => !options.ignoreMatchLabels || meaningfulTokens(value, true).size,
  );
  const preparedCapabilities = uniqueValues(capabilities).filter(
    (value) => !options.ignoreMatchLabels || meaningfulTokens(value, true).size,
  );
  if (!preparedRequirements.length || !preparedCapabilities.length) {
    return { score: 0, quality: 0 };
  }

  let matchedWeight = 0;
  let totalWeight = 0;
  for (const requirement of preparedRequirements) {
    const weight = rarityWeight(requirement, options.context);
    const bestMatch = Math.max(
      0,
      ...preparedCapabilities.map((capability) =>
        tagSimilarity(requirement, capability, options.ignoreMatchLabels),
      ),
    );
    matchedWeight += weight * bestMatch;
    totalWeight += weight;
  }
  return {
    score: totalWeight ? matchedWeight / totalWeight : 0,
    quality: Math.min(
      1,
      Math.sqrt(preparedRequirements.length * preparedCapabilities.length) / 2,
    ),
  };
}

function symmetricListAssessment(
  left: string[],
  right: string[],
  context?: MatchingScoreContext,
): FactorAssessment {
  const forward = directionalListAssessment(left, right, { context });
  const reverse = directionalListAssessment(right, left, { context });
  if (!forward.quality || !reverse.quality) return { score: 0, quality: 0 };
  return {
    score: average([forward.score, reverse.score]),
    quality: Math.min(forward.quality, reverse.quality),
  };
}

function closenessScore(left: number, right: number, max: number) {
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(right) ||
    left < 1 ||
    right < 1 ||
    max <= 0
  ) {
    return 0;
  }
  return Math.max(0, 1 - Math.abs(left - right) / max);
}

function knownText(value: string) {
  const key = normalized(value);
  return Boolean(key && !["none", "not sure", "unknown"].includes(key));
}

function textAssessment(left: string, right: string): FactorAssessment {
  if (!knownText(left) || !knownText(right)) return { score: 0, quality: 0 };
  return { score: tagSimilarity(left, right), quality: 1 };
}

function numericAssessment(left: number, right: number, max = 4): FactorAssessment {
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(right) ||
    left < 1 ||
    right < 1 ||
    left > max + 1 ||
    right > max + 1
  ) {
    return { score: 0, quality: 0 };
  }
  return { score: closenessScore(left, right, max), quality: 1 };
}

function combineAssessments(assessments: FactorAssessment[]): FactorAssessment {
  const quality = assessments.reduce((sum, item) => sum + item.quality, 0);
  if (!quality || !assessments.length) return { score: 0, quality: 0 };
  return {
    score:
      assessments.reduce((sum, item) => sum + item.score * item.quality, 0) / quality,
    quality: Math.min(1, quality / assessments.length),
  };
}

function stageScore(left: string, right: string) {
  const stageOrder = [
    "exploring",
    "idea",
    "pre-mvp",
    "mvp",
    "early traction",
    "scaling",
  ];
  const leftIndex = stageOrder.indexOf(normalized(left));
  const rightIndex = stageOrder.indexOf(normalized(right));
  if (leftIndex === -1 || rightIndex === -1) {
    return 0;
  }
  return Math.max(0, 1 - Math.abs(leftIndex - rightIndex) / (stageOrder.length - 1));
}

function timeCommitmentScore(left: string, right: string) {
  const normalizedLeft = normalized(left);
  const normalizedRight = normalized(right);
  if (!knownText(left) || !knownText(right)) {
    return 0;
  }
  if (normalizedLeft === normalizedRight) {
    return 1;
  }
  const serious = new Set(["full time", "part time serious"]);
  return serious.has(normalizedLeft) && serious.has(normalizedRight) ? 0.7 : 0.3;
}

function timeCommitmentAssessment(left: string, right: string): FactorAssessment {
  if (!knownText(left) || !knownText(right)) return { score: 0, quality: 0 };
  return { score: timeCommitmentScore(left, right), quality: 1 };
}

function hasSevereTimeCommitmentConflict(left: string, right: string) {
  const pair = new Set([normalized(left), normalized(right)]);
  if (pair.size !== 2) return false;

  return (
    pair.has("mentor only") ||
    (pair.has("full time") && pair.has("exploratory"))
  );
}

const cadencePerMonth: Record<string, number> = {
  monthly: 1,
  biweekly: 2,
  "twice monthly": 2,
  weekly: 4,
  "twice weekly": 8,
};

function cadenceAssessment(left: string, right: string): FactorAssessment {
  const leftCadence = cadencePerMonth[normalized(left)];
  const rightCadence = cadencePerMonth[normalized(right)];
  if (!leftCadence || !rightCadence) return textAssessment(left, right);
  const distance = Math.abs(Math.log2(leftCadence) - Math.log2(rightCadence));
  return { score: Math.max(0, 1 - distance / 3), quality: 1 };
}

const availabilityStartOrder: Record<string, number> = {
  immediately: 0,
  now: 0,
  "after approval": 1,
  "within 2 weeks": 1,
  "within a month": 2,
  later: 3,
};

function availabilityStartAssessment(left: string, right: string): FactorAssessment {
  const leftStart = availabilityStartOrder[normalized(left)];
  const rightStart = availabilityStartOrder[normalized(right)];
  if (leftStart === undefined || rightStart === undefined) return textAssessment(left, right);
  return { score: Math.max(0, 1 - Math.abs(leftStart - rightStart) / 3), quality: 1 };
}

export function cosineSimilarity(left: number[] = [], right: number[] = []) {
  if (!left.length || left.length !== right.length) {
    return 0;
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function normalizedSemanticScore(left: number[] = [], right: number[] = []) {
  const cosine = cosineSimilarity(left, right);
  const points = [
    [0.15, 0],
    [0.35, 0.35],
    [0.55, 0.65],
    [0.75, 0.9],
    [0.9, 1],
  ] as const;
  if (cosine <= points[0][0]) return 0;
  for (let index = 1; index < points.length; index += 1) {
    const [rightCosine, rightScore] = points[index];
    const [leftCosine, leftScore] = points[index - 1];
    if (cosine <= rightCosine) {
      const progress = (cosine - leftCosine) / (rightCosine - leftCosine);
      return leftScore + (rightScore - leftScore) * progress;
    }
  }
  return 1;
}

function embeddingAssessment(source: Profile, target: Profile): FactorAssessment {
  if (
    !source.seekingEmbedding?.length ||
    !target.offeringEmbedding?.length ||
    source.seekingEmbedding.length !== target.offeringEmbedding.length ||
    !source.embeddingModel ||
    source.embeddingModel !== target.embeddingModel
  ) {
    return { score: 0, quality: 0 };
  }
  return {
    score: normalizedSemanticScore(source.seekingEmbedding, target.offeringEmbedding),
    quality: source.embeddingModel === LOCAL_EMBEDDING_MODEL ? 0.65 : 1,
  };
}

export function blendEmbeddings(primary: number[], secondary?: number[], secondaryWeight = 0.2) {
  if (!secondary?.length || primary.length !== secondary.length) {
    return primary;
  }
  const vector = primary.map(
    (value, index) => value * (1 - secondaryWeight) + secondary[index] * secondaryWeight,
  );
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0));
  return magnitude ? vector.map((value) => value / magnitude) : vector;
}

function recentIntentText(posts: Post[], now: Date) {
  const cutoff = now.getTime() - 90 * 24 * 60 * 60 * 1000;
  return posts
    .filter(
      (post) =>
        post.status === "active" &&
        !post.hidden &&
        ["ask", "opportunity", "looking_for_cofounder", "looking_for_mentor"].includes(
          post.type,
        ) &&
        new Date(post.createdAt).getTime() >= cutoff,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 5)
    .map((post) =>
      [post.type, post.title, post.body.slice(0, 500), post.tags.join(", "), post.relatedRolesNeeded.join(", ")]
        .filter(Boolean)
        .join(": "),
    )
    .join("\n");
}

export function buildMatchingEmbeddingTexts(
  profile: Profile,
  posts: Post[] = [],
  now = new Date(),
) {
  const additionalProjectContext = distinctLegacyProfileText(
    profile.currentFocus,
    profile.startupOneLiner,
  );
  const canonicalBio = profile.bio || canonicalLegacyBio(profile.shortBio, profile.longBio);
  const shortBioStem = profile.shortBio.replace(/…$/, "").trim();
  const distinctLegacyShortBio = distinctLegacyProfileText(canonicalBio, shortBioStem);
  const seekingProfileText = [
    `Current context: ${profile.headline}. ${profile.currentFocus}. ${profile.problemInterest}`,
    additionalProjectContext ? `Project context: ${additionalProjectContext}` : "",
    `Ideal match: ${profile.idealMatchDescription}`,
    `Roles needed: ${profile.desiredRoles.join(", ")}`,
    `Help needed: ${profile.helpNeededTags.join(", ")}`,
    `Venture: ${profile.stage}; ${profile.industryTags.join(", ")}; ${profile.problemSpaceTags.join(", ")}`,
    `Constraints: ${profile.timeCommitment}; ${profile.remotePreference}; ${profile.preferredGeographies.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
  const offeringText = [
    `Profile: ${profile.headline}. ${distinctLegacyShortBio}. ${canonicalBio}`,
    `Skills: ${profile.skillTags.join(", ")}`,
    `Strengths: ${profile.topStrengths.join(", ")}; ${profile.canContribute.join(", ")}`,
    `Experience: ${profile.technicalExperience}; ${profile.notableWins}`,
    `Mentoring: ${profile.mentorExpertiseTags.join(", ")}; ${profile.mentorFunctionalStrengths.join(", ")}; ${profile.mentorOffers.join(", ")}; ${profile.mentorStageExperience.join(", ")}; ${profile.mentorshipPreferences}`,
    `Venture context: ${profile.stage}; ${profile.industryTags.join(", ")}; ${profile.problemSpaceTags.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
  return {
    seekingProfileText,
    offeringText,
    recentIntentText: recentIntentText(posts, now),
  };
}

/**
 * Keeps reusable profile semantics separate from activity that is private to a
 * single space. The profile text belongs on Profile; only the two space intent
 * strings belong on SpaceIntent.
 */
export function buildSpaceIntentEmbeddingTexts(
  profile: Profile,
  intent: SpaceIntent,
  posts: Post[] = [],
  now = new Date(),
) {
  const profileTexts = buildMatchingEmbeddingTexts(profile, [], now);
  const recentActivity = recentIntentText(posts, now);
  const seekingText = [
    intent.currentGoal ? `Current goal: ${intent.currentGoal}` : "",
    intent.lookingFor.length
      ? `Looking for in this space: ${intent.lookingFor.join(", ")}`
      : "",
    recentActivity ? `Recent intent in this space:\n${recentActivity}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
  const offeringText = [
    intent.offers.length
      ? `Can offer in this space: ${intent.offers.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  return {
    profileSeekingText: profileTexts.seekingProfileText,
    profileOfferingText: profileTexts.offeringText,
    seekingText,
    offeringText,
    recentIntentText: recentActivity,
  };
}

export function buildEmbeddingText(profile: Profile) {
  return buildMatchingEmbeddingTexts(profile).seekingProfileText;
}

export function buildEmbedding(text: string) {
  return buildLocalEmbedding(text);
}

function scoreBand(score: number): MatchRecord["scoreBand"] {
  if (score >= 80) return "high";
  if (score >= 65) return "good";
  return "emerging";
}

function needs(profile: Profile) {
  return uniqueValues([...profile.desiredRoles, ...profile.helpNeededTags]);
}

function offers(profile: Profile) {
  return uniqueValues([
    ...profile.skillTags,
    ...profile.topStrengths,
    ...profile.canContribute,
    ...profile.mentorExpertiseTags,
    ...profile.mentorFunctionalStrengths,
    ...profile.mentorOffers,
  ]);
}

function pairAssessment(
  forward: FactorAssessment,
  reverse: FactorAssessment,
  config: MatchTypeConfig,
): FactorAssessment {
  if (config.direction !== "mutual") {
    return forward;
  }
  if (!forward.quality || !reverse.quality) {
    return { score: 0, quality: 0 };
  }
  if (forward.score <= 0 || reverse.score <= 0) {
    return { score: 0, quality: Math.min(forward.quality, reverse.quality) };
  }
  return {
    score: (2 * forward.score * reverse.score) / (forward.score + reverse.score),
    quality: Math.min(forward.quality, reverse.quality),
  };
}

function forwardVentureStageAssessment(
  seeker: Profile,
  provider: Profile,
  config: MatchTypeConfig,
): FactorAssessment {
  if (!knownText(seeker.stage)) return { score: 0, quality: 0 };
  if (config.slug !== "mentor_match") {
    if (!knownText(provider.stage)) return { score: 0, quality: 0 };
    return { score: stageScore(seeker.stage, provider.stage), quality: 1 };
  }
  const stages = provider.mentorStageExperience.filter(knownText);
  if (!stages.length) return { score: 0, quality: 0 };
  return {
    score: Math.max(0, ...stages.map((stage) => stageScore(seeker.stage, stage))),
    quality: Math.min(1, stages.length / 2),
  };
}

function coreAlignment(
  semantic: FactorAssessment,
  skills: FactorAssessment,
  config: MatchTypeConfig,
): FactorAssessment {
  const configuredSemanticWeight = Math.max(0, config.weights.semantic);
  const configuredSkillsWeight = Math.max(0, config.weights.skills);
  const configuredWeight = configuredSemanticWeight + configuredSkillsWeight;
  const semanticWeight = semantic.quality * configuredSemanticWeight;
  const skillsWeight = skills.quality * configuredSkillsWeight;
  const observedWeight = semanticWeight + skillsWeight;
  if (!configuredWeight || !observedWeight) return { score: 0, quality: 0 };
  return {
    score:
      (semantic.score * semanticWeight + skills.score * skillsWeight) / observedWeight,
    quality: Math.min(1, observedWeight / configuredWeight),
  };
}

function ventureListAssessment(
  source: string[],
  target: string[],
  config: MatchTypeConfig,
  context?: MatchingScoreContext,
) {
  return config.direction === "mutual"
    ? symmetricListAssessment(source, target, context)
    : directionalListAssessment(source, target, { context });
}

function remotePreferenceAssessment(left: string, right: string): FactorAssessment {
  if (!knownText(left) || !knownText(right)) return { score: 0, quality: 0 };
  const normalizedLeft = normalized(left);
  const normalizedRight = normalized(right);
  if (normalizedLeft === normalizedRight) return { score: 1, quality: 1 };
  const flexible = new Set(["hybrid", "remote"]);
  return {
    score: flexible.has(normalizedLeft) && flexible.has(normalizedRight) ? 0.8 : 0.35,
    quality: 1,
  };
}

function factorScores(
  source: Profile,
  target: Profile,
  config: MatchTypeConfig,
  context?: MatchingScoreContext,
) {
  const forwardSemantic = embeddingAssessment(source, target);
  const reverseSemantic = embeddingAssessment(target, source);
  const forwardSkills = directionalListAssessment(needs(source), offers(target), {
    context,
    ignoreMatchLabels: true,
  });
  const reverseSkills = directionalListAssessment(needs(target), offers(source), {
    context,
    ignoreMatchLabels: true,
  });
  const semantic = pairAssessment(forwardSemantic, reverseSemantic, config);
  const skills = pairAssessment(forwardSkills, reverseSkills, config);
  const venture = combineAssessments([
    ventureListAssessment(source.industryTags, target.industryTags, config, context),
    ventureListAssessment(source.problemSpaceTags, target.problemSpaceTags, config, context),
    ventureListAssessment(source.businessModelTags, target.businessModelTags, config, context),
    forwardVentureStageAssessment(source, target, config),
  ]);
  const targetCadence =
    config.slug === "mentor_match" && knownText(target.mentorAvailability)
      ? target.mentorAvailability
      : target.meetingFrequencyPreference;
  const commitment = timeCommitmentAssessment(source.timeCommitment, target.timeCommitment);
  const cadence = cadenceAssessment(source.meetingFrequencyPreference, targetCadence);
  const start = availabilityStartAssessment(source.availabilityStart, target.availabilityStart);
  const mentorCapacity: FactorAssessment =
    config.slug === "mentor_match" &&
    typeof target.maxMentees === "number" &&
    Number.isFinite(target.maxMentees) &&
    target.maxMentees > 0
      ? {
          score: Math.min(1, Math.max(0, target.maxMentees) / 3),
          quality: 0.2,
        }
      : { score: 0, quality: 0 };
  const availability = combineAssessments([
    commitment,
    cadence,
    start,
    mentorCapacity,
  ]);
  const hasKnownCadencePair = Boolean(
    cadencePerMonth[normalized(source.meetingFrequencyPreference)] &&
      cadencePerMonth[normalized(targetCadence)],
  );
  const hasKnownStartPair = Boolean(
    availabilityStartOrder[normalized(source.availabilityStart)] !== undefined &&
      availabilityStartOrder[normalized(target.availabilityStart)] !== undefined,
  );
  const severeAvailabilityConflict =
    (commitment.quality === 1 &&
      hasSevereTimeCommitmentConflict(source.timeCommitment, target.timeCommitment)) ||
    (hasKnownCadencePair && cadence.score <= 0.3) ||
    (hasKnownStartPair && start.score <= 0.3);
  const workStyle = combineAssessments([
    textAssessment(source.workStyle, target.workStyle),
    textAssessment(source.decisionStyle, target.decisionStyle),
    textAssessment(source.communicationStyle, target.communicationStyle),
    textAssessment(source.conflictStyle, target.conflictStyle),
    textAssessment(source.speedPreference, target.speedPreference),
    textAssessment(source.commitmentHorizon, target.commitmentHorizon),
    textAssessment(source.missionVsMarketOrientation, target.missionVsMarketOrientation),
    numericAssessment(source.ambitionLevel, target.ambitionLevel),
    numericAssessment(source.riskTolerance, target.riskTolerance),
    numericAssessment(source.structureVsChaos, target.structureVsChaos),
  ]);
  const location = combineAssessments([
    symmetricListAssessment(
      [source.timezone, source.country, ...source.preferredGeographies],
      [target.timezone, target.country, ...target.preferredGeographies],
      context,
    ),
    remotePreferenceAssessment(source.remotePreference, target.remotePreference),
  ]);

  return {
    factors: {
      semantic,
      skills,
      venture,
      availability,
      work_style: workStyle,
      location,
    } satisfies Record<MatchFactorKey, FactorAssessment>,
    forwardCore: coreAlignment(forwardSemantic, forwardSkills, config),
    reverseCore: coreAlignment(reverseSemantic, reverseSkills, config),
    severeAvailabilityConflict,
  };
}

function buildMatchingScoreContext(profiles: Profile[]): MatchingScoreContext {
  const documentFrequencies = new Map<string, number>();
  for (const profile of profiles) {
    const profileTags = normalizedSet([
      ...needs(profile),
      ...offers(profile),
      ...profile.industryTags,
      ...profile.problemSpaceTags,
      ...profile.businessModelTags,
    ]);
    for (const tag of profileTags) {
      documentFrequencies.set(tag, (documentFrequencies.get(tag) ?? 0) + 1);
    }
  }
  return { populationSize: profiles.length, documentFrequencies };
}

const scoreCalibration = [
  [0, 1],
  [0.25, 25],
  [0.35, 40],
  [0.5, 60],
  [0.65, 75],
  [0.78, 86],
  [0.9, 95],
  [1, 100],
] as const;

function calibratedFitScore(fit: number) {
  const boundedFit = Math.max(0, Math.min(1, fit));
  for (let index = 1; index < scoreCalibration.length; index += 1) {
    const [rightFit, rightScore] = scoreCalibration[index];
    const [leftFit, leftScore] = scoreCalibration[index - 1];
    if (boundedFit <= rightFit) {
      const progress = (boundedFit - leftFit) / (rightFit - leftFit);
      return leftScore + (rightScore - leftScore) * progress;
    }
  }
  return MATCH_SCORE_MAX;
}

function confidenceForCoverage(coverage: number): MatchConfidence {
  if (coverage >= 0.8) return "high";
  if (coverage >= 0.55) return "medium";
  return "low";
}

function assessMatch(
  source: Profile,
  target: Profile,
  config: MatchTypeConfig,
  context?: MatchingScoreContext,
): MatchAssessment {
  const { factors, forwardCore, reverseCore, severeAvailabilityConflict } = factorScores(
    source,
    target,
    config,
    context,
  );
  const totalConfiguredWeight = factorKeys.reduce(
    (sum, key) => sum + Math.max(0, config.weights[key]),
    0,
  );
  const observedWeight = factorKeys.reduce(
    (sum, key) => sum + Math.max(0, config.weights[key]) * factors[key].quality,
    0,
  );
  const unscaledBreakdown = Object.fromEntries(
    factorKeys.map((key) => [
      key,
      observedWeight
        ? (Math.max(0, config.weights[key]) * factors[key].quality * factors[key].score * 100) /
          observedWeight
        : 0,
    ]),
  ) as Record<MatchFactorKey, number>;
  const fit =
    Object.values(unscaledBreakdown).reduce((sum, value) => sum + value, 0) / 100;
  const coverage = totalConfiguredWeight ? observedWeight / totalConfiguredWeight : 0;
  const adjustedFit = 0.35 + coverage * (fit - 0.35);
  const confidence = confidenceForCoverage(coverage);
  const activeFactors = factorKeys.filter((key) => config.weights[key] > 0);
  const evidenceCount = activeFactors.filter(
    (key) => factors[key].quality > 0 && factors[key].score >= 0.15,
  ).length;
  const strongEvidenceCount = activeFactors.filter(
    (key) => factors[key].quality >= 0.35 && factors[key].score >= 0.65,
  ).length;
  const requiredEvidenceCount = Math.min(2, activeFactors.length);
  const requiresCoreEvidence = config.weights.semantic > 0 || config.weights.skills > 0;
  const minimumCore =
    !requiresCoreEvidence
      ? 1
      : config.direction === "mutual"
      ? Math.min(forwardCore.score, reverseCore.score)
      : forwardCore.score;
  const hasCoreEvidence =
    !requiresCoreEvidence ||
    (forwardCore.quality > 0 &&
      (config.direction !== "mutual" || reverseCore.quality > 0));
  const eligible =
    Boolean(observedWeight) &&
    hasCoreEvidence &&
    minimumCore >= 0.2 &&
    evidenceCount >= requiredEvidenceCount;

  let scoreCap = MATCH_SCORE_MAX;
  if (coverage < 0.5) scoreCap = Math.min(scoreCap, 69);
  else if (coverage < 0.65) scoreCap = Math.min(scoreCap, 79);
  else if (coverage < 0.8) scoreCap = Math.min(scoreCap, 89);

  if (minimumCore < 0.35) scoreCap = Math.min(scoreCap, 59);
  else if (minimumCore < 0.5) scoreCap = Math.min(scoreCap, 74);
  else if (minimumCore < 0.65) scoreCap = Math.min(scoreCap, 84);
  else if (minimumCore < 0.75) scoreCap = Math.min(scoreCap, 89);

  const requiredStrongEvidence = Math.min(2, activeFactors.length);
  if (strongEvidenceCount < requiredStrongEvidence) scoreCap = Math.min(scoreCap, 79);
  if (strongEvidenceCount < Math.min(3, activeFactors.length)) {
    scoreCap = Math.min(scoreCap, 89);
  }
  if (config.direction === "mutual" && severeAvailabilityConflict) {
    scoreCap = Math.min(scoreCap, 59);
  }

  const score = eligible
    ? Math.max(
        MATCH_SCORE_MIN,
        Math.min(MATCH_SCORE_MAX, scoreCap, Math.round(calibratedFitScore(adjustedFit))),
      )
    : MATCH_SCORE_MIN;
  const unscaledTotal = Object.values(unscaledBreakdown).reduce(
    (sum, value) => sum + value,
    0,
  );
  const breakdown = Object.fromEntries(
    factorKeys.map((key) => [
      key,
      unscaledTotal ? (unscaledBreakdown[key] * score) / unscaledTotal : 0,
    ]),
  ) as Record<MatchFactorKey, number>;

  const explanationThresholds: Record<MatchFactorKey, number> = {
    semantic: 0.45,
    skills: 0.5,
    venture: 0.5,
    availability: 0.6,
    work_style: 0.6,
    location: 0.6,
  };
  const explainableFactors = new Set(
    factorKeys.filter(
      (key) =>
        factors[key].quality >= 0.25 &&
        factors[key].score >= explanationThresholds[key] &&
        !(key === "availability" && severeAvailabilityConflict),
    ),
  );

  return { breakdown, confidence, eligible, explainableFactors, score };
}

function topOverlapTags(left: Profile, right: Profile) {
  const candidates = uniqueValues([
    ...left.industryTags,
    ...left.problemSpaceTags,
    ...needs(left),
  ]).filter((item) => meaningfulTokens(item, true).size);
  const rightPool = uniqueValues([
    ...right.industryTags,
    ...right.problemSpaceTags,
    ...offers(right),
  ]);
  return candidates
    .map((item) => ({
      item,
      score: Math.max(0, ...rightPool.map((candidate) => tagSimilarity(item, candidate, true))),
    }))
    .filter(({ score }) => score >= 0.65)
    .sort((leftItem, rightItem) => rightItem.score - leftItem.score)
    .slice(0, 4)
    .map(({ item }) => item);
}

function topDirectionalEvidence(requirements: string[], capabilities: string[]) {
  const preparedRequirements = uniqueValues(requirements).filter(
    (value) => meaningfulTokens(value, true).size,
  );
  const preparedCapabilities = uniqueValues(capabilities).filter(
    (value) => meaningfulTokens(value, true).size,
  );

  return preparedRequirements
    .map((requirement) => {
      const candidates = preparedCapabilities
        .map((capability) => ({
          capability,
          score: tagSimilarity(requirement, capability, true),
        }))
        .sort((left, right) => right.score - left.score);
      return {
        requirement,
        capability: candidates[0]?.capability ?? "",
        score: candidates[0]?.score ?? 0,
      };
    })
    .filter(({ score }) => score >= 0.65)
    .sort((left, right) => right.score - left.score)
    .slice(0, 1);
}

function fallbackConfig(matchType: MatchType) {
  return (
    stableDefaultMatchTypeConfigs("fallback").find((config) => config.slug === matchType) ??
    {
      ...stableDefaultMatchTypeConfigs("fallback")[2],
      slug: matchType,
      name: matchType.replaceAll("_", " "),
    }
  );
}

export function computeMatchBreakdown(
  source: Profile,
  target: Profile,
  configOrType: MatchTypeConfig | MatchType,
) {
  const config = typeof configOrType === "string" ? fallbackConfig(configOrType) : configOrType;
  return assessMatch(source, target, config).breakdown;
}

export function buildFallbackExplanation(
  source: Profile,
  target: Profile,
  breakdown: Record<string, number>,
  configOrType: MatchTypeConfig | MatchType,
  explainableFactors?: ReadonlySet<MatchFactorKey>,
) {
  const config = typeof configOrType === "string" ? fallbackConfig(configOrType) : configOrType;
  const strongestReasons = Object.entries(breakdown)
    .filter(
      ([key, value]) =>
        value >= 2 &&
        key in memberMatchReasonLabels &&
        (!explainableFactors || explainableFactors.has(key as MatchFactorKey)),
    )
    .sort(([, left], [, right]) => right - left)
    .slice(0, 2)
    .map(
      ([key]) =>
        memberMatchReasonLabels[key as keyof typeof memberMatchReasonLabels],
    );
  const overlaps = topOverlapTags(source, target);
  const forwardEvidence = topDirectionalEvidence(needs(source), offers(target)).map(
    ({ capability, requirement }) =>
      `${target.preferredName} offers ${capability}, matching your need for ${requirement}`,
  );
  const reverseEvidence =
    config.direction === "mutual"
      ? topDirectionalEvidence(needs(target), offers(source)).map(
          ({ capability, requirement }) =>
            `you offer ${capability}, matching their need for ${requirement}`,
        )
      : [];
  const concreteEvidence = [...forwardEvidence, ...reverseEvidence];
  const lead =
    config.direction === "mutual"
      ? `You and ${target.preferredName} may be able to help each other`
      : `${target.preferredName}'s experience may fit what you are looking for`;
  const evidence = strongestReasons.length
    ? `${lead}: ${strongestReasons.join("; ")}.`
    : `${lead}.`;
  const concrete = concreteEvidence.length ? ` ${concreteEvidence.join(". ")}.` : "";
  return overlaps.length
    ? `${evidence}${concrete} Relevant signals include ${overlaps.slice(0, 3).join(", ")}.`
    : `${evidence}${concrete}`;
}

function participates(profile: Profile, target: Profile, config: MatchTypeConfig) {
  if (
    !profile.seekingMatchTypes.includes(config.slug) ||
    !target.offeringMatchTypes.includes(config.slug)
  ) {
    return false;
  }
  return config.direction !== "mutual" ||
    (target.seekingMatchTypes.includes(config.slug) &&
      profile.offeringMatchTypes.includes(config.slug));
}

function mentorProviderIsEligible(
  config: MatchTypeConfig,
  membership: Membership,
) {
  if (config.slug !== "mentor_match") return true;
  return isApprovedMentor(membership);
}

export function spaceAllowsMatching(space: Space) {
  return (
    space.matchingEnabled &&
    (space.lifecycle === "upcoming" ||
      space.lifecycle === "active" ||
      space.lifecycle === "ended")
  );
}

export function isSpaceMatchingMemberEligible(
  space: Space,
  record: SpaceMatchingMember,
) {
  return Boolean(
    spaceAllowsMatching(space) &&
      record.membership.orgId === space.orgId &&
      record.membership.accountStatus === "connected" &&
      record.spaceMembership.orgId === space.orgId &&
      record.spaceMembership.spaceId === space.id &&
      record.spaceMembership.membershipId === record.membership.id &&
      record.spaceMembership.accessStatus === "active" &&
      record.profile.membershipId === record.membership.id &&
      record.profile.onboardingComplete &&
      record.intent.orgId === space.orgId &&
      record.intent.spaceId === space.id &&
      record.intent.membershipId === record.membership.id &&
      record.intent.matchingOptIn &&
      record.intent.intentComplete,
  );
}

function profileWithSpaceIntent(profile: Profile, intent: SpaceIntent): Profile {
  const canBlendIntentEmbeddings = Boolean(
    profile.embeddingModel &&
      profile.embeddingModel === intent.embeddingModel &&
      profile.seekingEmbedding?.length &&
      profile.offeringEmbedding?.length,
  );
  return {
    ...profile,
    currentFocus: intent.currentGoal || profile.currentFocus,
    idealMatchDescription: [intent.currentGoal, profile.idealMatchDescription]
      .filter(Boolean)
      .join("\n"),
    desiredRoles: uniqueValues([...intent.lookingFor, ...profile.desiredRoles]),
    helpNeededTags: uniqueValues([...intent.lookingFor, ...profile.helpNeededTags]),
    skillTags: uniqueValues([...intent.offers, ...profile.skillTags]),
    canContribute: uniqueValues([...intent.offers, ...profile.canContribute]),
    seekingEmbeddingText: [intent.seekingText, profile.seekingEmbeddingText]
      .filter(Boolean)
      .join("\n"),
    offeringEmbeddingText: [intent.offeringText, profile.offeringEmbeddingText]
      .filter(Boolean)
      .join("\n"),
    seekingEmbedding:
      canBlendIntentEmbeddings && intent.seekingText
        ? blendEmbeddings(
            profile.seekingEmbedding ?? [],
            intent.seekingEmbedding,
            SPACE_INTENT_EMBEDDING_WEIGHT,
          )
        : profile.seekingEmbedding,
    offeringEmbedding:
      canBlendIntentEmbeddings && intent.offeringText
        ? blendEmbeddings(
            profile.offeringEmbedding ?? [],
            intent.offeringEmbedding,
            SPACE_INTENT_EMBEDDING_WEIGHT,
          )
        : profile.offeringEmbedding,
  };
}

function confidenceRank(confidence: MatchConfidence) {
  if (confidence === "high") return 2;
  if (confidence === "medium") return 1;
  return 0;
}

function stableMatchTieBreak(match: MatchRecord) {
  const value = [
    match.algorithmVersion,
    match.spaceId ?? "global",
    match.sourceProfileId,
    match.targetProfileId,
    match.matchType,
  ].join("|");
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function compareMatchQuality(left: MatchRecord, right: MatchRecord) {
  const leftEvidence = Object.values(left.scoreBreakdown).filter((value) => value > 0).length;
  const rightEvidence = Object.values(right.scoreBreakdown).filter((value) => value > 0).length;
  return (
    right.score - left.score ||
    confidenceRank(right.confidence) - confidenceRank(left.confidence) ||
    rightEvidence - leftEvidence ||
    stableMatchTieBreak(left) - stableMatchTieBreak(right) ||
    left.targetProfileId.localeCompare(right.targetProfileId)
  );
}

function buildMatchRecord(
  organization: Organization,
  source: Profile,
  target: Profile,
  config: MatchTypeConfig,
  options: {
    runId?: string;
    scoreContext?: MatchingScoreContext;
    spaceId?: string;
  } = {},
): MatchRecord | null {
  const assessment = assessMatch(source, target, config, options.scoreContext);
  if (!assessment.eligible) return null;
  const { breakdown, confidence, explainableFactors, score } = assessment;
  const now = new Date().toISOString();
  const scope = options.spaceId ? `${options.spaceId}_` : "";
  return {
    id: `match_${scope}${source.id}_${target.id}_${config.slug}`,
    orgId: organization.id,
    ...(options.spaceId ? { spaceId: options.spaceId } : {}),
    sourceProfileId: source.id,
    targetProfileId: target.id,
    matchType: config.slug,
    score,
    scoreBreakdown: breakdown,
    explanationText: buildFallbackExplanation(
      source,
      target,
      breakdown,
      config,
      explainableFactors,
    ),
    overlapTags: topOverlapTags(source, target),
    scoreBand: scoreBand(score),
    confidence,
    algorithmVersion: MATCHING_ALGORITHM_VERSION,
    ...(options.runId ? { runId: options.runId } : {}),
    surfacedAt: now,
    dismissedBySource: false,
    hiddenByAdmin: false,
    createdAt: now,
    updatedAt: now,
  } satisfies MatchRecord;
}

export function computeMatch(
  organization: Organization,
  sourceMembership: Membership,
  source: Profile,
  targetMembership: Membership,
  target: Profile,
  configOrType: MatchTypeConfig | MatchType,
  runId?: string,
  scoreContext?: MatchingScoreContext,
): MatchRecord | null {
  const config = typeof configOrType === "string" ? fallbackConfig(configOrType) : configOrType;
  if (
    source.id === target.id ||
    sourceMembership.status !== "approved" ||
    targetMembership.status !== "approved" ||
    !source.onboardingComplete ||
    !target.onboardingComplete ||
    !source.profileVisibleInMatching ||
    !target.profileVisibleInMatching ||
    !target.introOptIn ||
    !config.active ||
    !mentorProviderIsEligible(config, targetMembership) ||
    !participates(source, target, config)
  ) {
    return null;
  }

  return buildMatchRecord(organization, source, target, config, { runId, scoreContext });
}

export function computeSpaceMatch(
  organization: Organization,
  space: Space,
  sourceRecord: SpaceMatchingMember,
  targetRecord: SpaceMatchingMember,
  configOrType: MatchTypeConfig | MatchType,
  runId?: string,
  scoreContext?: MatchingScoreContext,
): MatchRecord | null {
  const config = typeof configOrType === "string" ? fallbackConfig(configOrType) : configOrType;
  if (
    sourceRecord.profile.id === targetRecord.profile.id ||
    !isSpaceMatchingMemberEligible(space, sourceRecord) ||
    !isSpaceMatchingMemberEligible(space, targetRecord) ||
    !targetRecord.profile.introOptIn ||
    !config.active ||
    !mentorProviderIsEligible(config, targetRecord.membership) ||
    !participates(sourceRecord.profile, targetRecord.profile, config)
  ) {
    return null;
  }

  return buildMatchRecord(
    organization,
    profileWithSpaceIntent(sourceRecord.profile, sourceRecord.intent),
    profileWithSpaceIntent(targetRecord.profile, targetRecord.intent),
    config,
    { runId, scoreContext, spaceId: space.id },
  );
}

interface RecomputeMatchesForProfilesOptions {
  profileIds?: string[];
  limit?: number | null;
  runId?: string;
}

export function recomputeMatchesForProfiles(
  organization: Organization,
  memberships: Membership[],
  profiles: Profile[],
  configsOrOptions: MatchTypeConfig[] | RecomputeMatchesForProfilesOptions =
    stableDefaultMatchTypeConfigs(organization.id),
  maybeOptions: RecomputeMatchesForProfilesOptions = {},
) {
  const configs = Array.isArray(configsOrOptions)
    ? configsOrOptions
    : stableDefaultMatchTypeConfigs(organization.id);
  const options = Array.isArray(configsOrOptions) ? maybeOptions : configsOrOptions;
  const membershipById = new Map(
    memberships
      .filter((membership) => membership.status === "approved")
      .map((membership) => [membership.id, membership]),
  );
  const eligibleProfiles = profiles.filter(
    (profile) =>
      membershipById.has(profile.membershipId) &&
      profile.onboardingComplete &&
      profile.profileVisibleInMatching,
  );
  const scoreContext = buildMatchingScoreContext(eligibleProfiles);
  const scopedProfileIds = new Set(options.profileIds ?? []);
  const limitPerSourceAndType = options.limit === null ? undefined : options.limit ?? 12;
  const matches: MatchRecord[] = [];

  for (const source of eligibleProfiles) {
    const sourceMembership = membershipById.get(source.membershipId);
    if (!sourceMembership) continue;

    for (const config of configs.filter((candidate) => candidate.active)) {
      const candidates: MatchRecord[] = [];
      for (const target of eligibleProfiles) {
        const targetMembership = membershipById.get(target.membershipId);
        if (!targetMembership) continue;
        const match = computeMatch(
          organization,
          sourceMembership,
          source,
          targetMembership,
          target,
          config,
          options.runId,
          scoreContext,
        );
        if (match && match.score >= config.minimumScore) {
          candidates.push(match);
        }
      }
      candidates.sort(compareMatchQuality);
      const selected = limitPerSourceAndType
        ? candidates.slice(0, limitPerSourceAndType)
        : candidates;
      matches.push(
        ...selected.filter(
          (match) =>
            !scopedProfileIds.size ||
            scopedProfileIds.has(match.sourceProfileId) ||
            scopedProfileIds.has(match.targetProfileId),
        ),
      );
    }
  }
  return matches.sort(
    (left, right) =>
      left.sourceProfileId.localeCompare(right.sourceProfileId) ||
      compareMatchQuality(left, right),
  );
}

export function recomputeMatchesForSpaceMembers(
  organization: Organization,
  space: Space,
  records: SpaceMatchingMember[],
  configsOrOptions: MatchTypeConfig[] | RecomputeMatchesForProfilesOptions =
    stableDefaultMatchTypeConfigs(organization.id),
  maybeOptions: RecomputeMatchesForProfilesOptions = {},
) {
  if (space.orgId !== organization.id || !spaceAllowsMatching(space)) {
    return [];
  }

  const configs = Array.isArray(configsOrOptions)
    ? configsOrOptions
    : stableDefaultMatchTypeConfigs(organization.id);
  const options = Array.isArray(configsOrOptions) ? maybeOptions : configsOrOptions;
  const eligibleRecords = records.filter((record) =>
    isSpaceMatchingMemberEligible(space, record),
  );
  const scoreContext = buildMatchingScoreContext(
    eligibleRecords.map((record) =>
      profileWithSpaceIntent(record.profile, record.intent),
    ),
  );
  const scopedProfileIds = new Set(options.profileIds ?? []);
  const limitPerSourceAndType = options.limit === null ? undefined : options.limit ?? 12;
  const matches: MatchRecord[] = [];

  for (const source of eligibleRecords) {
    for (const config of configs.filter((candidate) => candidate.active)) {
      const candidates = eligibleRecords
        .map((target) =>
          computeSpaceMatch(
            organization,
            space,
            source,
            target,
            config,
            options.runId,
            scoreContext,
          ),
        )
        .filter((match): match is MatchRecord => Boolean(match && match.score >= config.minimumScore))
        .sort(compareMatchQuality);
      const selected = limitPerSourceAndType
        ? candidates.slice(0, limitPerSourceAndType)
        : candidates;
      matches.push(
        ...selected.filter(
          (match) =>
            !scopedProfileIds.size ||
            scopedProfileIds.has(match.sourceProfileId) ||
            scopedProfileIds.has(match.targetProfileId),
        ),
      );
    }
  }

  return matches.sort(
    (left, right) =>
      left.sourceProfileId.localeCompare(right.sourceProfileId) ||
      compareMatchQuality(left, right),
  );
}

import { average } from "@/lib/utils";
import type {
  MatchConfidence,
  MatchRecord,
  MatchType,
  MatchTypeConfig,
  Membership,
  Organization,
  Post,
  Profile,
} from "@/lib/domain";
import {
  matchFactorLabels,
  stableDefaultMatchTypeConfigs,
} from "@/lib/match-config";
import { buildLocalEmbedding } from "@/server/embeddings";

export const MATCHING_ALGORITHM_VERSION = "hybrid-v2";

const tagAliases: Record<string, string> = {
  "co founder": "cofounder",
  "co-founder": "cofounder",
  "biz dev": "business development",
  bd: "business development",
  "go to market": "gtm",
  "go-to-market": "gtm",
  "machine learning": "ml",
  "artificial intelligence": "ai",
  teammate: "collaborator",
  collaborators: "collaborator",
  adviser: "advisor",
};

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

function overlapScore(left: string[], right: string[]) {
  const leftSet = normalizedSet(left);
  const rightSet = normalizedSet(right);
  if (!leftSet.size || !rightSet.size) {
    return 0;
  }
  const overlap = [...leftSet].filter((item) => rightSet.has(item)).length;
  return overlap / Math.min(leftSet.size, rightSet.size);
}

function closenessScore(left: number, right: number, max: number) {
  if (!Number.isFinite(left) || !Number.isFinite(right) || max <= 0) {
    return 0;
  }
  return Math.max(0, 1 - Math.abs(left - right) / max);
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
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }
  if (normalizedLeft === normalizedRight) {
    return 1;
  }
  const serious = new Set(["full time", "part time serious"]);
  return serious.has(normalizedLeft) && serious.has(normalizedRight) ? 0.7 : 0.3;
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
  return Math.max(0, Math.min(1, (cosine - 0.1) / 0.7));
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
  const seekingProfileText = [
    `Current context: ${profile.headline}. ${profile.startupOneLiner}. ${profile.startupDescription}`,
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
    `Profile: ${profile.headline}. ${profile.shortBio}. ${profile.longBio}`,
    `Skills: ${profile.skillTags.join(", ")}`,
    `Strengths: ${profile.topStrengths.join(", ")}; ${profile.canContribute.join(", ")}`,
    `Experience: ${profile.priorProjects}; ${profile.notableWins}`,
    `Mentoring: ${profile.mentorExpertiseTags.join(", ")}; ${profile.mentorFunctionalStrengths.join(", ")}; ${profile.mentorOffers.join(", ")}`,
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

export function buildEmbeddingText(profile: Profile) {
  return buildMatchingEmbeddingTexts(profile).seekingProfileText;
}

export function buildEmbedding(text: string) {
  return buildLocalEmbedding(text);
}

function scoreBand(score: number): MatchRecord["scoreBand"] {
  if (score >= 75) return "high";
  if (score >= 60) return "good";
  return "emerging";
}

function needs(profile: Profile) {
  return [...profile.desiredRoles, ...profile.helpNeededTags];
}

function offers(profile: Profile) {
  return [
    ...profile.skillTags,
    ...profile.topStrengths,
    ...profile.canContribute,
    ...profile.mentorExpertiseTags,
    ...profile.mentorFunctionalStrengths,
    ...profile.mentorOffers,
  ];
}

function pairScore(forward: number, reverse: number, config: MatchTypeConfig) {
  if (config.direction !== "mutual") {
    return forward;
  }
  if (forward <= 0 || reverse <= 0) {
    return 0;
  }
  return (2 * forward * reverse) / (forward + reverse);
}

function factorScores(source: Profile, target: Profile, config: MatchTypeConfig) {
  const forwardSemantic = Math.max(
    normalizedSemanticScore(source.seekingEmbedding, target.offeringEmbedding),
    overlapScore(needs(source), offers(target)),
  );
  const reverseSemantic = Math.max(
    normalizedSemanticScore(target.seekingEmbedding, source.offeringEmbedding),
    overlapScore(needs(target), offers(source)),
  );
  const skills = pairScore(
    overlapScore(needs(source), offers(target)),
    overlapScore(needs(target), offers(source)),
    config,
  );
  const venture = pairScore(
    average([
      overlapScore(source.industryTags, target.industryTags),
      overlapScore(source.problemSpaceTags, target.problemSpaceTags),
      overlapScore(source.businessModelTags, target.businessModelTags),
      stageScore(source.stage, target.stage),
    ]),
    average([
      overlapScore(target.industryTags, source.industryTags),
      overlapScore(target.problemSpaceTags, source.problemSpaceTags),
      overlapScore(target.businessModelTags, source.businessModelTags),
      stageScore(target.stage, source.stage),
    ]),
    config,
  );
  const availability = average([
    timeCommitmentScore(source.timeCommitment, target.timeCommitment),
    overlapScore(
      [source.meetingFrequencyPreference, source.availabilityStart],
      [target.meetingFrequencyPreference, target.mentorAvailability, target.availabilityStart],
    ),
  ]);
  const workStyle = average([
    overlapScore([source.workStyle], [target.workStyle]),
    overlapScore([source.decisionStyle], [target.decisionStyle]),
    overlapScore([source.communicationStyle], [target.communicationStyle]),
    closenessScore(source.ambitionLevel, target.ambitionLevel, 4),
    closenessScore(source.riskTolerance, target.riskTolerance, 4),
    closenessScore(source.structureVsChaos, target.structureVsChaos, 4),
  ]);
  const location = Math.max(
    overlapScore(
      [source.timezone, source.country, ...source.preferredGeographies],
      [target.timezone, target.country, ...target.preferredGeographies],
    ),
    normalized(source.remotePreference) === "remote" &&
      normalized(target.remotePreference) === "remote"
      ? 0.7
      : 0,
  );
  return {
    semantic: pairScore(forwardSemantic, reverseSemantic, config),
    skills,
    venture,
    availability,
    work_style: workStyle,
    location,
  };
}

function profileSignalCoverage(profile: Profile) {
  const groups = [
    profile.seekingMatchTypes.length > 0,
    needs(profile).length > 0,
    offers(profile).length > 0,
    Boolean(profile.startupDescription || profile.longBio),
    Boolean(profile.timeCommitment && profile.meetingFrequencyPreference),
    Boolean(profile.workStyle && profile.decisionStyle),
    Boolean(profile.timezone || profile.country || profile.remotePreference),
    Boolean(profile.seekingEmbedding?.length && profile.offeringEmbedding?.length),
  ];
  return groups.filter(Boolean).length / groups.length;
}

function matchConfidence(source: Profile, target: Profile): MatchConfidence {
  const coverage = average([profileSignalCoverage(source), profileSignalCoverage(target)]);
  if (coverage >= 0.8) return "high";
  if (coverage >= 0.55) return "medium";
  return "low";
}

function topOverlapTags(left: Profile, right: Profile) {
  const rightPool = normalizedSet([
    ...right.industryTags,
    ...right.problemSpaceTags,
    ...offers(right),
  ]);
  return [...new Set([...left.industryTags, ...left.problemSpaceTags, ...needs(left)])]
    .filter((item) => rightPool.has(normalized(item)))
    .slice(0, 4);
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
  const scores = factorScores(source, target, config);
  return Object.fromEntries(
    Object.entries(scores).map(([key, value]) => [
      key,
      value * config.weights[key as keyof typeof config.weights],
    ]),
  ) as Record<string, number>;
}

export function buildFallbackExplanation(
  source: Profile,
  target: Profile,
  breakdown: Record<string, number>,
  configOrType: MatchTypeConfig | MatchType,
) {
  const config = typeof configOrType === "string" ? fallbackConfig(configOrType) : configOrType;
  const strongestReasons = Object.entries(breakdown)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 3)
    .map(([key]) => matchFactorLabels[key as keyof typeof matchFactorLabels]);
  const overlaps = topOverlapTags(source, target);
  const overlapCopy = overlaps.length ? ` Shared signals include ${overlaps.join(", ")}.` : "";
  return `${config.name} surfaced because ${target.preferredName} aligns with ${source.preferredName} on ${strongestReasons.join(", ")}.${overlapCopy}`;
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

export function computeMatch(
  organization: Organization,
  sourceMembership: Membership,
  source: Profile,
  targetMembership: Membership,
  target: Profile,
  configOrType: MatchTypeConfig | MatchType,
  runId?: string,
) {
  const config = typeof configOrType === "string" ? fallbackConfig(configOrType) : configOrType;
  if (
    source.id === target.id ||
    sourceMembership.status !== "approved" ||
    targetMembership.status !== "approved" ||
    !source.onboardingComplete ||
    !target.onboardingComplete ||
    !source.profileVisibleInMatching ||
    !target.profileVisibleInMatching ||
    !config.active ||
    !participates(source, target, config)
  ) {
    return null;
  }

  const breakdown = computeMatchBreakdown(source, target, config);
  const score = Math.max(
    0,
    Math.min(100, Math.round(Object.values(breakdown).reduce((sum, value) => sum + value, 0))),
  );
  const now = new Date().toISOString();
  return {
    id: `match_${source.id}_${target.id}_${config.slug}`,
    orgId: organization.id,
    sourceProfileId: source.id,
    targetProfileId: target.id,
    matchType: config.slug,
    score,
    scoreBreakdown: breakdown,
    explanationText: buildFallbackExplanation(source, target, breakdown, config),
    overlapTags: topOverlapTags(source, target),
    scoreBand: scoreBand(score),
    confidence: matchConfidence(source, target),
    algorithmVersion: MATCHING_ALGORITHM_VERSION,
    ...(runId ? { runId } : {}),
    surfacedAt: now,
    dismissedBySource: false,
    hiddenByAdmin: false,
    createdAt: now,
    updatedAt: now,
  } satisfies MatchRecord;
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
        );
        if (match && match.score >= config.minimumScore) {
          candidates.push(match);
        }
      }
      candidates.sort(
        (left, right) =>
          right.score - left.score || left.targetProfileId.localeCompare(right.targetProfileId),
      );
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
      right.score - left.score ||
      left.targetProfileId.localeCompare(right.targetProfileId),
  );
}

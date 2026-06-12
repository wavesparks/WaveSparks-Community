import { average } from "@/lib/utils";
import type {
  MatchRecord,
  MatchType,
  Membership,
  Organization,
  Profile,
} from "@/lib/domain";

function overlapScore(left: string[], right: string[]) {
  if (!left.length || !right.length) {
    return 0;
  }

  const leftSet = new Set(left.map((item) => item.toLowerCase()));
  const rightSet = new Set(right.map((item) => item.toLowerCase()));
  const overlap = [...leftSet].filter((item) => rightSet.has(item)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : overlap / union;
}

function closenessScore(left: number, right: number, max: number) {
  const distance = Math.abs(left - right);
  return Math.max(0, 1 - distance / max);
}

function stageScore(left: string, right: string) {
  const stageOrder = [
    "exploring",
    "idea",
    "pre-MVP",
    "MVP",
    "early traction",
    "scaling",
  ];
  const leftIndex = stageOrder.indexOf(left);
  const rightIndex = stageOrder.indexOf(right);
  if (leftIndex === -1 || rightIndex === -1) {
    return 0.5;
  }

  return Math.max(0, 1 - Math.abs(leftIndex - rightIndex) / stageOrder.length);
}

function timeCommitmentScore(left: string, right: string) {
  if (left === right) {
    return 1;
  }

  if (
    (left === "full time" && right === "part time serious") ||
    (left === "part time serious" && right === "full time")
  ) {
    return 0.7;
  }

  return 0.35;
}

function semanticsVector(text: string) {
  const vector = Array.from({ length: 24 }, () => 0);

  for (const [index, character] of [...text.toLowerCase()].entries()) {
    const bucket = index % vector.length;
    vector[bucket] += character.charCodeAt(0) / 255;
  }

  return vector;
}

export function buildEmbeddingText(profile: Profile) {
  return [
    profile.startupOneLiner,
    profile.startupDescription,
    profile.idealMatchDescription,
    profile.helpNeededTags.join(" "),
    profile.topStrengths.join(" "),
    profile.mentorOffers.join(" "),
  ]
    .join(" ")
    .trim();
}

export function buildEmbedding(text: string) {
  return semanticsVector(text);
}

function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || !right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function scoreBand(score: number): MatchRecord["scoreBand"] {
  if (score >= 80) {
    return "high";
  }

  if (score >= 65) {
    return "good";
  }

  return "emerging";
}

function topOverlapTags(left: Profile, right: Profile) {
  const pool = [
    ...left.industryTags,
    ...left.problemSpaceTags,
    ...left.skillTags,
    ...left.helpNeededTags,
  ];

  const rightPool = new Set(
    [...right.industryTags, ...right.problemSpaceTags, ...right.skillTags, ...right.canContribute].map(
      (item) => item.toLowerCase(),
    ),
  );

  return [...new Set(pool.filter((item) => rightPool.has(item.toLowerCase())))].slice(0, 4);
}

export function buildFallbackExplanation(
  source: Profile,
  target: Profile,
  breakdown: Record<string, number>,
  matchType: MatchType,
) {
  const strongestReasons = Object.entries(breakdown)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 3)
    .map(([key]) => key.replaceAll("_", " "));

  if (matchType === "mentor_match") {
    return `Suggested because ${target.preferredName} brings strong ${strongestReasons.join(
      ", ",
    )} alignment for the stage and help themes in ${source.preferredName}'s profile.`;
  }

  return `Suggested because your profiles line up on ${strongestReasons.join(
    ", ",
  )}, with complementary roles and similar commitment for an early founder conversation.`;
}

export function computeMatchBreakdown(
  source: Profile,
  target: Profile,
  matchType: MatchType,
) {
  const semanticSimilarity = cosineSimilarity(
    source.profileEmbedding,
    target.profileEmbedding,
  );
  const featuredModifier = target.featured ? 6 : 0;
  const activityModifier = closenessScore(
    new Date(source.lastActiveAt).getTime(),
    new Date(target.lastActiveAt).getTime(),
    1000 * 60 * 60 * 24 * 45,
  );
  const staleModifier = target.stale ? -5 : 0;

  if (matchType === "mentor_match") {
    const expertiseRelevance = overlapScore(
      source.helpNeededTags.concat(source.industryTags),
      target.mentorExpertiseTags.concat(target.mentorFunctionalStrengths),
    );
    const stageRelevance = overlapScore([source.stage], target.mentorStageExperience);
    const functionalFit = overlapScore(source.desiredRoles, target.mentorFunctionalStrengths);
    const goalsFit = overlapScore(source.lookingForTypes, target.mentorOffers);
    const availabilityFit = overlapScore(
      [source.timeCommitment, source.meetingFrequencyPreference],
      [target.mentorAvailability, target.meetingFrequencyPreference],
    );
    const timezoneFit = overlapScore([source.timezone], [target.timezone]);

    return {
      expertise_relevance: expertiseRelevance * 35,
      stage_relevance: stageRelevance * 20,
      functional_fit: functionalFit * 15,
      goals_fit: goalsFit * 10,
      availability_fit: availabilityFit * 10,
      timezone_fit: timezoneFit * 5,
      semantic_similarity: semanticSimilarity * 5,
      trust_modifiers:
        featuredModifier + activityModifier * 5 + staleModifier + target.profileCompletionPercent / 100,
    } as Record<string, number>;
  }

  const roleComplementarity = overlapScore(
    source.desiredRoles.concat(source.helpNeededTags),
    target.skillTags.concat(target.canContribute),
  );
  const skillComplementarity = overlapScore(
    source.helpNeededTags.concat(source.desiredRoles),
    target.skillTags.concat(target.topStrengths),
  );
  const industryOverlap = overlapScore(
    source.industryTags.concat(source.problemSpaceTags),
    target.industryTags.concat(target.problemSpaceTags),
  );
  const stageFit = stageScore(source.stage, target.stage);
  const timeCommitmentFit = timeCommitmentScore(
    source.timeCommitment,
    target.timeCommitment,
  );
  const workStyleFit = average([
    overlapScore([source.workStyle], [target.workStyle]),
    overlapScore([source.decisionStyle], [target.decisionStyle]),
  ]);
  const ambitionAlignment = average([
    closenessScore(source.ambitionLevel, target.ambitionLevel, 5),
    closenessScore(source.riskTolerance, target.riskTolerance, 5),
    overlapScore([source.commitmentHorizon], [target.commitmentHorizon]),
  ]);
  const timezoneFit = average([
    overlapScore([source.timezone], [target.timezone]),
    overlapScore([source.country], [target.country]),
  ]);

  return {
    role_complementarity: roleComplementarity * 25,
    skill_complementarity: skillComplementarity * 15,
    industry_overlap: industryOverlap * 15,
    stage_fit: stageFit * 10,
    time_commitment_fit: timeCommitmentFit * 10,
    work_style_fit: workStyleFit * 10,
    ambition_alignment: ambitionAlignment * 10,
    location_fit: timezoneFit * 5,
    semantic_similarity: semanticSimilarity * 8,
    trust_modifiers:
      featuredModifier + activityModifier * 5 + staleModifier + target.profileCompletionPercent / 100,
  } as Record<string, number>;
}

export function computeMatch(
  organization: Organization,
  sourceMembership: Membership,
  source: Profile,
  targetMembership: Membership,
  target: Profile,
  matchType: MatchType,
) {
  if (!target.profileVisibleInMatching || targetMembership.status !== "approved") {
    return null;
  }

  const breakdown = computeMatchBreakdown(source, target, matchType);
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        Object.values(breakdown).reduce((sum, value) => sum + value, 0),
      ),
    ),
  );

  return {
    id: `match_${source.id}_${target.id}_${matchType}`,
    orgId: organization.id,
    sourceProfileId: source.id,
    targetProfileId: target.id,
    matchType,
    score,
    scoreBreakdown: breakdown,
    explanationText: buildFallbackExplanation(source, target, breakdown, matchType),
    overlapTags: topOverlapTags(source, target),
    scoreBand: scoreBand(score),
    surfacedAt: new Date().toISOString(),
    dismissedBySource: false,
    hiddenByAdmin: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies MatchRecord;
}

interface RecomputeMatchesForProfilesOptions {
  profileIds?: string[];
  limit?: number | null;
}

export function recomputeMatchesForProfiles(
  organization: Organization,
  memberships: Membership[],
  profiles: Profile[],
  options: RecomputeMatchesForProfilesOptions = {},
) {
  const approvedMemberships = memberships.filter((membership) => membership.status === "approved");
  const approvedProfiles = profiles.filter((profile) => {
    const membership = approvedMemberships.find(
      (candidate) => candidate.id === profile.membershipId,
    );
    return Boolean(membership) && profile.onboardingComplete;
  });
  const scopedProfileIds = new Set(options.profileIds ?? []);

  const matches: MatchRecord[] = [];

  for (const source of approvedProfiles) {
    const sourceMembership = approvedMemberships.find(
      (membership) => membership.id === source.membershipId,
    );

    if (!sourceMembership) {
      continue;
    }

    for (const target of approvedProfiles) {
      if (source.id === target.id) {
        continue;
      }
      if (
        scopedProfileIds.size > 0 &&
        !scopedProfileIds.has(source.id) &&
        !scopedProfileIds.has(target.id)
      ) {
        continue;
      }

      const targetMembership = approvedMemberships.find(
        (membership) => membership.id === target.membershipId,
      );

      if (!targetMembership) {
        continue;
      }

      const mentorLikeTarget =
        targetMembership.archetypes.includes("mentor") || target.mentorOffers.length > 0;
      const wantsMentor =
        sourceMembership.archetypes.includes("mentee") ||
        source.lookingForTypes.includes("mentor");

      const desiredTypes: MatchType[] = ["cofounder_match"];
      if (mentorLikeTarget && wantsMentor) {
        desiredTypes.push("mentor_match");
      }

      for (const matchType of desiredTypes) {
        const match = computeMatch(
          organization,
          sourceMembership,
          source,
          targetMembership,
          target,
          matchType,
        );

        if (match) {
          matches.push(match);
        }
      }
    }
  }

  const sortedMatches = matches.sort((left, right) => right.score - left.score);
  return options.limit === null
    ? sortedMatches
    : sortedMatches.slice(0, options.limit ?? 60);
}

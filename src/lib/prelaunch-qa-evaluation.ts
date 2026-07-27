export const PRELAUNCH_QA_MATCH_TYPES = [
  "mentor_match",
  "cofounder_match",
  "collaborator_match",
] as const;

export type PrelaunchQaMatchType = (typeof PRELAUNCH_QA_MATCH_TYPES)[number];
export type PrelaunchQaMatchDirection = "seeker_provider" | "mutual";

export const PRELAUNCH_QA_THRESHOLDS = {
  expectedSeekers: 50,
  expectedMentors: 10,
  expectedCalibrationSeekers: 35,
  expectedHoldoutSeekers: 15,
  minimumCoverage: 0.9,
  minimumHitAt3: 0.8,
  minimumMrr: 0.6,
  minimumNdcgAt5: 0.75,
  hitK: 3,
  ndcgK: 5,
  matchType: "mentor_match",
  supportedMatchTypes: PRELAUNCH_QA_MATCH_TYPES,
  embeddingModel: "text-embedding-3-large",
} as const;

export type PrelaunchQaSplit = "calibration" | "holdout";
export type PrelaunchQaRelevance = 0 | 1 | 2;

export interface PrelaunchQaParticipant {
  profileId: string;
  intentId: string;
  orgId: string;
  spaceId: string;
  seekingMatchTypes: PrelaunchQaMatchType[];
  offeringMatchTypes: PrelaunchQaMatchType[];
}

export interface PrelaunchQaSeeker extends PrelaunchQaParticipant {
  split: PrelaunchQaSplit;
}

export interface PrelaunchQaRelevanceLabel {
  seekerProfileId: string;
  mentorProfileId: string;
  relevance: PrelaunchQaRelevance;
}

/**
 * A database projection of a persisted match. targetOrgId and targetSpaceId
 * should come from joins through the target membership and Space entitlement;
 * the match row's own orgId/spaceId alone cannot prove target isolation.
 */
export interface PrelaunchQaPersistedMatch {
  id: string;
  orgId: string;
  spaceId: string;
  sourceProfileId: string;
  targetProfileId: string;
  targetOrgId: string;
  targetSpaceId: string;
  matchType: string;
  score: number;
  scoreBreakdown: Record<string, number>;
}

export interface PrelaunchQaEmbeddingEvidence {
  ownerType: "profile" | "intent";
  ownerId: string;
  model: string | null | undefined;
}

export interface PrelaunchQaPersistedRun {
  id: string;
  orgId: string;
  spaceId: string;
  status: "running" | "completed" | "failed";
  metadata: Record<string, unknown>;
  matches: PrelaunchQaPersistedMatch[];
  embeddings: PrelaunchQaEmbeddingEvidence[];
}

export interface PrelaunchQaEvaluationInput {
  orgId: string;
  spaceId: string;
  seekers: PrelaunchQaSeeker[];
  mentors: PrelaunchQaParticipant[];
  labels: PrelaunchQaRelevanceLabel[];
  /** Ordered oldest to newest. */
  runs: [PrelaunchQaPersistedRun, PrelaunchQaPersistedRun];
}

export type PrelaunchQaMismatchCode =
  | "dataset_shape"
  | "participant_scope"
  | "participant_match_types"
  | "label_duplicate"
  | "label_invalid"
  | "label_missing"
  | "label_unknown_pair"
  | "run_scope"
  | "run_duplicate_id"
  | "run_incomplete"
  | "run_degraded"
  | "embedding_missing"
  | "embedding_duplicate"
  | "embedding_model"
  | "embedding_unknown_owner"
  | "match_invalid"
  | "match_unknown_source"
  | "match_unknown_target"
  | "match_ineligible_pair"
  | "match_cross_org"
  | "match_cross_space"
  | "match_non_mentor"
  | "match_duplicate"
  | "determinism_top3"
  | "determinism_score"
  | "determinism_breakdown"
  | "seeker_no_results"
  | "match_type_no_results"
  | "holdout_no_relevant_top3"
  | "holdout_irrelevant_top1";

export interface PrelaunchQaKnownMismatch {
  code: PrelaunchQaMismatchCode;
  message: string;
  runId?: string;
  seekerProfileId?: string;
  targetProfileId?: string;
  matchType?: PrelaunchQaMatchType;
}

export interface PrelaunchQaGate {
  passed: boolean;
  actual: number | string | boolean;
  expected: string;
}

export interface PrelaunchQaMatchTypeEvaluation {
  direction: PrelaunchQaMatchDirection;
  applicable: boolean;
  eligibleSources: number;
  coveredSources: number;
  coverage: number;
  minimumCoverage: number;
  resultCount: number;
  nonEmpty: boolean;
  invalidRows: number;
  ineligiblePairs: number;
  leakage: {
    crossOrg: number;
    crossSpace: number;
    nonMentorTargets: number;
    unknownSources: number;
    unknownTargets: number;
  };
  duplicates: number;
  determinism: {
    top3OrderMismatches: number;
    scoreMismatches: number;
    breakdownMismatches: number;
    passed: boolean;
  };
  passed: boolean;
}

export interface PrelaunchQaEvaluationResult {
  overallPassed: boolean;
  counts: {
    seekers: number;
    mentors: number;
    calibrationSeekers: number;
    holdoutSeekers: number;
    labels: number;
  };
  coverage: {
    coveredSeekers: number;
    totalSeekers: number;
    value: number;
    passed: boolean;
  };
  holdout: {
    seekers: number;
    hitsAt3: number;
    hitAt3: number;
    mrr: number;
    ndcgAt5: number;
  };
  leakage: {
    crossOrg: number;
    crossSpace: number;
    nonMentorTargets: number;
    unknownSources: number;
    unknownTargets: number;
  };
  duplicates: number;
  matchTypes: Record<PrelaunchQaMatchType, PrelaunchQaMatchTypeEvaluation>;
  determinism: {
    top3OrderMismatches: number;
    scoreMismatches: number;
    breakdownMismatches: number;
    passed: boolean;
  };
  embeddingGate: {
    requiredModel: string;
    missing: number;
    duplicates: number;
    wrongModel: number;
    unknownOwners: number;
    passed: boolean;
  };
  latestRunGate: {
    runId: string;
    status: PrelaunchQaPersistedRun["status"];
    embeddingsDegraded: number | null;
    passed: boolean;
  };
  gates: Record<string, PrelaunchQaGate>;
  knownMismatches: PrelaunchQaKnownMismatch[];
}

interface RankedMatch extends PrelaunchQaPersistedMatch {
  relevance: PrelaunchQaRelevance;
}

interface MatchTypeCounters {
  invalidRows: number;
  ineligiblePairs: number;
  crossOrg: number;
  crossSpace: number;
  nonMentorTargets: number;
  unknownSources: number;
  unknownTargets: number;
  duplicates: number;
  top3OrderMismatches: number;
  scoreMismatches: number;
  breakdownMismatches: number;
}

type RankedBySource = Map<string, PrelaunchQaPersistedMatch[]>;
type RankedByType = Map<PrelaunchQaMatchType, RankedBySource>;

const MATCH_DIRECTIONS: Record<PrelaunchQaMatchType, PrelaunchQaMatchDirection> = {
  mentor_match: "seeker_provider",
  cofounder_match: "mutual",
  collaborator_match: "mutual",
};

function isPrelaunchQaMatchType(value: unknown): value is PrelaunchQaMatchType {
  return PRELAUNCH_QA_MATCH_TYPES.some((matchType) => matchType === value);
}

function hasValidParticipantMatchTypes(value: unknown): value is PrelaunchQaMatchType[] {
  return (
    Array.isArray(value) &&
    value.every(isPrelaunchQaMatchType) &&
    new Set(value).size === value.length
  );
}

function participantHasMatchType(
  participant: PrelaunchQaParticipant,
  field: "seekingMatchTypes" | "offeringMatchTypes",
  matchType: PrelaunchQaMatchType,
) {
  return Array.isArray(participant[field]) && participant[field].includes(matchType);
}

function isEligiblePair(
  source: PrelaunchQaParticipant,
  target: PrelaunchQaParticipant,
  matchType: PrelaunchQaMatchType,
  mentorIds: ReadonlySet<string>,
) {
  if (
    source.profileId === target.profileId ||
    !participantHasMatchType(source, "seekingMatchTypes", matchType) ||
    !participantHasMatchType(target, "offeringMatchTypes", matchType)
  ) {
    return false;
  }
  if (matchType === "mentor_match" && !mentorIds.has(target.profileId)) {
    return false;
  }
  return (
    MATCH_DIRECTIONS[matchType] !== "mutual" ||
    (participantHasMatchType(source, "offeringMatchTypes", matchType) &&
      participantHasMatchType(target, "seekingMatchTypes", matchType))
  );
}

function emptyMatchTypeCounters(): MatchTypeCounters {
  return {
    invalidRows: 0,
    ineligiblePairs: 0,
    crossOrg: 0,
    crossSpace: 0,
    nonMentorTargets: 0,
    unknownSources: 0,
    unknownTargets: 0,
    duplicates: 0,
    top3OrderMismatches: 0,
    scoreMismatches: 0,
    breakdownMismatches: 0,
  };
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function average(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function labelKey(seekerProfileId: string, mentorProfileId: string) {
  return `${seekerProfileId}\u0000${mentorProfileId}`;
}

function embeddingKey(ownerType: PrelaunchQaEmbeddingEvidence["ownerType"], ownerId: string) {
  return `${ownerType}\u0000${ownerId}`;
}

function matchKey(match: PrelaunchQaPersistedMatch) {
  return [match.sourceProfileId, match.targetProfileId, match.matchType].join("\u0000");
}

function compareText(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function stableMatchSort(
  left: PrelaunchQaPersistedMatch,
  right: PrelaunchQaPersistedMatch,
) {
  return (
    right.score - left.score ||
    compareText(left.targetProfileId, right.targetProfileId) ||
    compareText(left.id, right.id)
  );
}

function isFiniteBreakdown(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (factor) => typeof factor === "number" && Number.isFinite(factor),
    )
  );
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && deepEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function dcg(relevances: readonly PrelaunchQaRelevance[]) {
  return relevances.reduce<number>(
    (sum, relevance, index) =>
      sum + (2 ** relevance - 1) / Math.log2(index + 2),
    0,
  );
}

function addMismatch(
  mismatches: PrelaunchQaKnownMismatch[],
  mismatch: PrelaunchQaKnownMismatch,
) {
  mismatches.push(mismatch);
}

export function evaluatePrelaunchQa(
  input: PrelaunchQaEvaluationInput,
): PrelaunchQaEvaluationResult {
  const thresholds = PRELAUNCH_QA_THRESHOLDS;
  const mismatches: PrelaunchQaKnownMismatch[] = [];
  const calibrationSeekers = input.seekers.filter((seeker) => seeker.split === "calibration");
  const holdoutSeekers = input.seekers.filter((seeker) => seeker.split === "holdout");
  const seekerIds = new Set(input.seekers.map((seeker) => seeker.profileId));
  const mentorIds = new Set(input.mentors.map((mentor) => mentor.profileId));
  const allParticipants: PrelaunchQaParticipant[] = [...input.seekers, ...input.mentors];
  const participantIds = new Set(allParticipants.map((participant) => participant.profileId));
  const participantById = new Map(
    allParticipants.map((participant) => [participant.profileId, participant]),
  );
  const intentIds = new Set(allParticipants.map((participant) => participant.intentId));
  const expectedEmbeddingOwners = new Set(
    allParticipants.flatMap((participant) => [
      embeddingKey("profile", participant.profileId),
      embeddingKey("intent", participant.intentId),
    ]),
  );

  const counts = {
    seekers: input.seekers.length,
    mentors: input.mentors.length,
    calibrationSeekers: calibrationSeekers.length,
    holdoutSeekers: holdoutSeekers.length,
    labels: input.labels.length,
  };
  const participantIdsUnique = participantIds.size === allParticipants.length;
  const intentIdsUnique = intentIds.size === allParticipants.length;
  const datasetShapePassed =
    counts.seekers === thresholds.expectedSeekers &&
    counts.mentors === thresholds.expectedMentors &&
    counts.calibrationSeekers === thresholds.expectedCalibrationSeekers &&
    counts.holdoutSeekers === thresholds.expectedHoldoutSeekers &&
    participantIdsUnique &&
    intentIdsUnique;
  if (!datasetShapePassed) {
    addMismatch(mismatches, {
      code: "dataset_shape",
      message: `Expected ${thresholds.expectedSeekers} unique seekers (${thresholds.expectedCalibrationSeekers} calibration, ${thresholds.expectedHoldoutSeekers} holdout) and ${thresholds.expectedMentors} unique mentors, with unique profile and intent IDs.`,
    });
  }

  let participantScopeErrors = 0;
  let participantMatchTypeErrors = 0;
  for (const participant of allParticipants) {
    if (participant.orgId !== input.orgId || participant.spaceId !== input.spaceId) {
      participantScopeErrors += 1;
      addMismatch(mismatches, {
        code: "participant_scope",
        message: `${participant.profileId} is outside the QA organization or Space.`,
        targetProfileId: participant.profileId,
      });
    }
    if (
      !hasValidParticipantMatchTypes(participant.seekingMatchTypes) ||
      !hasValidParticipantMatchTypes(participant.offeringMatchTypes)
    ) {
      participantMatchTypeErrors += 1;
      addMismatch(mismatches, {
        code: "participant_match_types",
        message: `${participant.profileId} has unsupported, duplicated, or malformed seeking/offering match types.`,
        targetProfileId: participant.profileId,
      });
    }
  }

  const eligibleSourceIdsByType = new Map<PrelaunchQaMatchType, Set<string>>(
    PRELAUNCH_QA_MATCH_TYPES.map((matchType) => [
      matchType,
      new Set(
        allParticipants
          .filter((source) =>
            allParticipants.some((target) =>
              isEligiblePair(source, target, matchType, mentorIds),
            ),
          )
          .map((participant) => participant.profileId),
      ),
    ]),
  );

  const labelMap = new Map<string, PrelaunchQaRelevance>();
  let labelDuplicates = 0;
  let invalidLabels = 0;
  let unknownLabelPairs = 0;
  for (const label of input.labels) {
    const key = labelKey(label.seekerProfileId, label.mentorProfileId);
    if (labelMap.has(key)) {
      labelDuplicates += 1;
      addMismatch(mismatches, {
        code: "label_duplicate",
        message: `Duplicate relevance label for ${label.seekerProfileId} and ${label.mentorProfileId}.`,
        seekerProfileId: label.seekerProfileId,
        targetProfileId: label.mentorProfileId,
      });
    }
    if (label.relevance !== 0 && label.relevance !== 1 && label.relevance !== 2) {
      invalidLabels += 1;
      addMismatch(mismatches, {
        code: "label_invalid",
        message: `Relevance for ${label.seekerProfileId} and ${label.mentorProfileId} must be 0, 1, or 2.`,
        seekerProfileId: label.seekerProfileId,
        targetProfileId: label.mentorProfileId,
      });
      continue;
    }
    if (!seekerIds.has(label.seekerProfileId) || !mentorIds.has(label.mentorProfileId)) {
      unknownLabelPairs += 1;
      addMismatch(mismatches, {
        code: "label_unknown_pair",
        message: `Label references an unknown seeker or mentor: ${label.seekerProfileId} -> ${label.mentorProfileId}.`,
        seekerProfileId: label.seekerProfileId,
        targetProfileId: label.mentorProfileId,
      });
      continue;
    }
    const previous = labelMap.get(key);
    labelMap.set(key, previous === undefined ? label.relevance : Math.max(previous, label.relevance) as PrelaunchQaRelevance);
  }

  let missingLabels = 0;
  for (const seeker of input.seekers) {
    for (const mentor of input.mentors) {
      const key = labelKey(seeker.profileId, mentor.profileId);
      if (!labelMap.has(key)) {
        missingLabels += 1;
        addMismatch(mismatches, {
          code: "label_missing",
          message: `Missing blind relevance label for ${seeker.profileId} and ${mentor.profileId}.`,
          seekerProfileId: seeker.profileId,
          targetProfileId: mentor.profileId,
        });
      }
    }
  }
  const labelsPassed =
    labelDuplicates === 0 &&
    invalidLabels === 0 &&
    unknownLabelPairs === 0 &&
    missingLabels === 0 &&
    labelMap.size === thresholds.expectedSeekers * thresholds.expectedMentors;

  let crossOrg = 0;
  let crossSpace = 0;
  let nonMentorTargets = 0;
  let unknownSources = 0;
  let unknownTargets = 0;
  let duplicates = 0;
  let invalidMatches = 0;
  let ineligiblePairs = 0;
  let embeddingMissing = 0;
  let embeddingDuplicates = 0;
  let embeddingWrongModel = 0;
  let embeddingUnknownOwners = 0;
  let runScopeErrors = 0;
  const rankedByRun = new Map<string, Map<string, RankedMatch[]>>();
  const rankedByTypeByRun = new Map<string, RankedByType>();
  const matchTypeCounters = new Map<PrelaunchQaMatchType, MatchTypeCounters>(
    PRELAUNCH_QA_MATCH_TYPES.map((matchType) => [matchType, emptyMatchTypeCounters()]),
  );
  const runIdsUnique = new Set(input.runs.map((run) => run.id)).size === input.runs.length;

  if (!runIdsUnique) {
    addMismatch(mismatches, {
      code: "run_duplicate_id",
      message: "The two persisted comparison runs must have distinct IDs.",
    });
  }

  for (const run of input.runs) {
    if (run.orgId !== input.orgId || run.spaceId !== input.spaceId) {
      runScopeErrors += 1;
      addMismatch(mismatches, {
        code: "run_scope",
        message: `Run ${run.id} is outside the QA organization or Space.`,
        runId: run.id,
      });
    }

    const embeddingCounts = new Map<string, number>();
    for (const evidence of run.embeddings) {
      const key = embeddingKey(evidence.ownerType, evidence.ownerId);
      embeddingCounts.set(key, (embeddingCounts.get(key) ?? 0) + 1);
      if (!expectedEmbeddingOwners.has(key)) {
        embeddingUnknownOwners += 1;
        addMismatch(mismatches, {
          code: "embedding_unknown_owner",
          message: `Run ${run.id} includes embedding evidence for unknown owner ${evidence.ownerType}:${evidence.ownerId}.`,
          runId: run.id,
        });
      }
      if (evidence.model !== thresholds.embeddingModel) {
        embeddingWrongModel += 1;
        addMismatch(mismatches, {
          code: "embedding_model",
          message: `Run ${run.id} used ${String(evidence.model)} for ${evidence.ownerType}:${evidence.ownerId}; expected ${thresholds.embeddingModel}.`,
          runId: run.id,
        });
      }
    }
    for (const owner of expectedEmbeddingOwners) {
      const count = embeddingCounts.get(owner) ?? 0;
      if (count === 0) {
        embeddingMissing += 1;
        addMismatch(mismatches, {
          code: "embedding_missing",
          message: `Run ${run.id} is missing embedding evidence for ${owner.replace("\u0000", ":")}.`,
          runId: run.id,
        });
      } else if (count > 1) {
        embeddingDuplicates += count - 1;
        addMismatch(mismatches, {
          code: "embedding_duplicate",
          message: `Run ${run.id} has duplicate embedding evidence for ${owner.replace("\u0000", ":")}.`,
          runId: run.id,
        });
      }
    }

    const seenMatches = new Set<string>();
    const validByType = new Map<PrelaunchQaMatchType, Map<string, PrelaunchQaPersistedMatch[]>>(
      PRELAUNCH_QA_MATCH_TYPES.map((matchType) => [matchType, new Map()]),
    );
    for (const match of run.matches) {
      const supportedMatchType = isPrelaunchQaMatchType(match.matchType)
        ? match.matchType
        : null;
      const counters = supportedMatchType
        ? matchTypeCounters.get(supportedMatchType)!
        : null;
      const duplicateKey = matchKey(match);
      if (seenMatches.has(duplicateKey)) {
        duplicates += 1;
        if (counters) counters.duplicates += 1;
        addMismatch(mismatches, {
          code: "match_duplicate",
          message: `Run ${run.id} has a duplicate (${match.sourceProfileId}, ${match.targetProfileId}, ${match.matchType}) match.`,
          runId: run.id,
          seekerProfileId: match.sourceProfileId,
          targetProfileId: match.targetProfileId,
          ...(supportedMatchType ? { matchType: supportedMatchType } : {}),
        });
      }
      seenMatches.add(duplicateKey);

      const hasValidShape =
        supportedMatchType !== null &&
        Number.isFinite(match.score) &&
        isFiniteBreakdown(match.scoreBreakdown);
      if (!hasValidShape) {
        invalidMatches += 1;
        if (counters) counters.invalidRows += 1;
        addMismatch(mismatches, {
          code: "match_invalid",
          message: `Run ${run.id} has an unsupported type, non-finite score, or invalid score breakdown for ${match.id}.`,
          runId: run.id,
          seekerProfileId: match.sourceProfileId,
          targetProfileId: match.targetProfileId,
          ...(supportedMatchType ? { matchType: supportedMatchType } : {}),
        });
      }
      const source = participantById.get(match.sourceProfileId);
      const target = participantById.get(match.targetProfileId);
      if (!source) {
        unknownSources += 1;
        if (counters) counters.unknownSources += 1;
        addMismatch(mismatches, {
          code: "match_unknown_source",
          message: `Run ${run.id} returned a match for unknown participant ${match.sourceProfileId}.`,
          runId: run.id,
          seekerProfileId: match.sourceProfileId,
          targetProfileId: match.targetProfileId,
          ...(supportedMatchType ? { matchType: supportedMatchType } : {}),
        });
      }
      if (!target) {
        unknownTargets += 1;
        if (counters) counters.unknownTargets += 1;
        addMismatch(mismatches, {
          code: "match_unknown_target",
          message: `Run ${run.id} returned unknown target ${match.targetProfileId}.`,
          runId: run.id,
          seekerProfileId: match.sourceProfileId,
          targetProfileId: match.targetProfileId,
          ...(supportedMatchType ? { matchType: supportedMatchType } : {}),
        });
      }
      const isCrossOrg = match.orgId !== input.orgId || match.targetOrgId !== input.orgId;
      const isCrossSpace =
        match.spaceId !== input.spaceId || match.targetSpaceId !== input.spaceId;
      const isMentor = mentorIds.has(match.targetProfileId);
      if (isCrossOrg) {
        crossOrg += 1;
        if (counters) counters.crossOrg += 1;
        addMismatch(mismatches, {
          code: "match_cross_org",
          message: `Run ${run.id} returned cross-organization target ${match.targetProfileId}.`,
          runId: run.id,
          seekerProfileId: match.sourceProfileId,
          targetProfileId: match.targetProfileId,
          ...(supportedMatchType ? { matchType: supportedMatchType } : {}),
        });
      }
      if (isCrossSpace) {
        crossSpace += 1;
        if (counters) counters.crossSpace += 1;
        addMismatch(mismatches, {
          code: "match_cross_space",
          message: `Run ${run.id} returned cross-Space target ${match.targetProfileId}.`,
          runId: run.id,
          seekerProfileId: match.sourceProfileId,
          targetProfileId: match.targetProfileId,
          ...(supportedMatchType ? { matchType: supportedMatchType } : {}),
        });
      }
      if (supportedMatchType === thresholds.matchType && !isMentor) {
        nonMentorTargets += 1;
        counters!.nonMentorTargets += 1;
        addMismatch(mismatches, {
          code: "match_non_mentor",
          message: `Run ${run.id} returned non-mentor target ${match.targetProfileId}.`,
          runId: run.id,
          seekerProfileId: match.sourceProfileId,
          targetProfileId: match.targetProfileId,
          matchType: supportedMatchType,
        });
      }

      const pairEligible = Boolean(
        supportedMatchType &&
          source &&
          target &&
          isEligiblePair(source, target, supportedMatchType, mentorIds),
      );
      if (supportedMatchType && source && target && !pairEligible) {
        ineligiblePairs += 1;
        counters!.ineligiblePairs += 1;
        addMismatch(mismatches, {
          code: "match_ineligible_pair",
          message: `Run ${run.id} returned an ineligible ${supportedMatchType} pair ${match.sourceProfileId} -> ${match.targetProfileId}.`,
          runId: run.id,
          seekerProfileId: match.sourceProfileId,
          targetProfileId: match.targetProfileId,
          matchType: supportedMatchType,
        });
      }

      if (
        supportedMatchType &&
        source &&
        target &&
        pairEligible &&
        hasValidShape &&
        !isCrossOrg &&
        !isCrossSpace
      ) {
        const validBySource = validByType.get(supportedMatchType)!;
        const candidates = validBySource.get(match.sourceProfileId) ?? [];
        candidates.push(match);
        validBySource.set(match.sourceProfileId, candidates);
      }
    }

    const rankedByType = new Map<PrelaunchQaMatchType, RankedBySource>();
    for (const matchType of PRELAUNCH_QA_MATCH_TYPES) {
      const rankedBySource = new Map<string, PrelaunchQaPersistedMatch[]>();
      const candidatesBySource = validByType.get(matchType)!;
      for (const participant of allParticipants) {
        const seenTargets = new Set<string>();
        const matches = [...(candidatesBySource.get(participant.profileId) ?? [])]
          .sort(stableMatchSort)
          .filter((match) => {
            if (seenTargets.has(match.targetProfileId)) return false;
            seenTargets.add(match.targetProfileId);
            return true;
          });
        rankedBySource.set(participant.profileId, matches);
      }
      rankedByType.set(matchType, rankedBySource);
    }
    rankedByTypeByRun.set(run.id, rankedByType);

    const ranked = new Map<string, RankedMatch[]>();
    for (const seeker of input.seekers) {
      const matches = (
        rankedByType.get(thresholds.matchType)?.get(seeker.profileId) ?? []
      ).map((match) => ({
          ...match,
          relevance: labelMap.get(labelKey(seeker.profileId, match.targetProfileId)) ?? 0,
        }));
      ranked.set(seeker.profileId, matches);
    }
    rankedByRun.set(run.id, ranked);
  }

  const latestRun = input.runs[1];
  const latestRanked = rankedByRun.get(latestRun.id) ?? new Map<string, RankedMatch[]>();
  const coveredSeekers = input.seekers.filter(
    (seeker) => (latestRanked.get(seeker.profileId)?.length ?? 0) > 0,
  ).length;
  const coverageValue = ratio(coveredSeekers, input.seekers.length);
  for (const seeker of input.seekers) {
    if (!(latestRanked.get(seeker.profileId)?.length ?? 0)) {
      addMismatch(mismatches, {
        code: "seeker_no_results",
        message: `${seeker.profileId} has no valid mentor results in latest run ${latestRun.id}.`,
        runId: latestRun.id,
        seekerProfileId: seeker.profileId,
      });
    }
  }

  const reciprocalRanks: number[] = [];
  const ndcgValues: number[] = [];
  let hitsAt3 = 0;
  for (const seeker of holdoutSeekers) {
    const ranked = latestRanked.get(seeker.profileId) ?? [];
    const top3 = ranked.slice(0, thresholds.hitK);
    const firstRelevantIndex = ranked.findIndex((match) => match.relevance > 0);
    const hit = top3.some((match) => match.relevance > 0);
    if (hit) hitsAt3 += 1;
    reciprocalRanks.push(firstRelevantIndex >= 0 ? 1 / (firstRelevantIndex + 1) : 0);

    const actualRelevances = ranked
      .slice(0, thresholds.ndcgK)
      .map((match) => match.relevance);
    const idealRelevances = input.mentors
      .map(
        (mentor) =>
          labelMap.get(labelKey(seeker.profileId, mentor.profileId)) ?? 0,
      )
      .sort((left, right) => right - left)
      .slice(0, thresholds.ndcgK);
    const idealDcg = dcg(idealRelevances);
    ndcgValues.push(idealDcg > 0 ? dcg(actualRelevances) / idealDcg : 0);

    if (!hit) {
      addMismatch(mismatches, {
        code: "holdout_no_relevant_top3",
        message: `${seeker.profileId} has no relevance > 0 mentor in Top 3.`,
        runId: latestRun.id,
        seekerProfileId: seeker.profileId,
      });
    }
    if (top3[0]?.relevance === 0) {
      addMismatch(mismatches, {
        code: "holdout_irrelevant_top1",
        message: `${seeker.profileId}'s Top 1 mentor has relevance 0.`,
        runId: latestRun.id,
        seekerProfileId: seeker.profileId,
        targetProfileId: top3[0].targetProfileId,
      });
    }
  }

  const hitAt3 = ratio(hitsAt3, holdoutSeekers.length);
  const mrr = average(reciprocalRanks);
  const ndcgAt5 = average(ndcgValues);

  const firstRankedByType =
    rankedByTypeByRun.get(input.runs[0].id) ?? new Map<PrelaunchQaMatchType, RankedBySource>();
  const secondRankedByType =
    rankedByTypeByRun.get(latestRun.id) ?? new Map<PrelaunchQaMatchType, RankedBySource>();
  let top3OrderMismatches = 0;
  let scoreMismatches = 0;
  let breakdownMismatches = 0;
  for (const matchType of PRELAUNCH_QA_MATCH_TYPES) {
    const counters = matchTypeCounters.get(matchType)!;
    const firstRanked =
      firstRankedByType.get(matchType) ?? new Map<string, PrelaunchQaPersistedMatch[]>();
    const secondRanked =
      secondRankedByType.get(matchType) ?? new Map<string, PrelaunchQaPersistedMatch[]>();
    for (const sourceProfileId of eligibleSourceIdsByType.get(matchType) ?? []) {
      const firstTop3 = (firstRanked.get(sourceProfileId) ?? []).slice(0, thresholds.hitK);
      const secondTop3 = (secondRanked.get(sourceProfileId) ?? []).slice(0, thresholds.hitK);
      const firstTargets = firstTop3.map((match) => match.targetProfileId);
      const secondTargets = secondTop3.map((match) => match.targetProfileId);
      if (!deepEqual(firstTargets, secondTargets)) {
        top3OrderMismatches += 1;
        counters.top3OrderMismatches += 1;
        addMismatch(mismatches, {
          code: "determinism_top3",
          message: `${sourceProfileId} has different ${matchType} Top 3 target order across the two runs.`,
          seekerProfileId: sourceProfileId,
          matchType,
        });
        continue;
      }
      for (let index = 0; index < firstTop3.length; index += 1) {
        const first = firstTop3[index];
        const second = secondTop3[index];
        if (!second) continue;
        if (!Object.is(first.score, second.score)) {
          scoreMismatches += 1;
          counters.scoreMismatches += 1;
          addMismatch(mismatches, {
            code: "determinism_score",
            message: `${sourceProfileId} -> ${first.targetProfileId} changed ${matchType} score across runs.`,
            seekerProfileId: sourceProfileId,
            targetProfileId: first.targetProfileId,
            matchType,
          });
        }
        if (!deepEqual(first.scoreBreakdown, second.scoreBreakdown)) {
          breakdownMismatches += 1;
          counters.breakdownMismatches += 1;
          addMismatch(mismatches, {
            code: "determinism_breakdown",
            message: `${sourceProfileId} -> ${first.targetProfileId} changed ${matchType} score breakdown across runs.`,
            seekerProfileId: sourceProfileId,
            targetProfileId: first.targetProfileId,
            matchType,
          });
        }
      }
    }
  }

  const matchTypes = {} as Record<
    PrelaunchQaMatchType,
    PrelaunchQaMatchTypeEvaluation
  >;
  let matchTypeCoverageFailures = 0;
  for (const matchType of PRELAUNCH_QA_MATCH_TYPES) {
    const direction = MATCH_DIRECTIONS[matchType];
    const eligibleSourceIds = eligibleSourceIdsByType.get(matchType) ?? new Set<string>();
    const latestBySource =
      secondRankedByType.get(matchType) ??
      new Map<string, PrelaunchQaPersistedMatch[]>();
    const coveredSources = [...eligibleSourceIds].filter(
      (sourceProfileId) => (latestBySource.get(sourceProfileId)?.length ?? 0) > 0,
    ).length;
    const resultCount = [...latestBySource.values()].reduce(
      (total, matches) => total + matches.length,
      0,
    );
    const applicable = eligibleSourceIds.size > 0;
    const coverage = ratio(coveredSources, eligibleSourceIds.size);
    const minimumCoverage = thresholds.minimumCoverage;
    const coveragePassed = applicable
      ? resultCount > 0 && coverage >= minimumCoverage
      : resultCount === 0;
    if (!coveragePassed) matchTypeCoverageFailures += 1;
    if (matchType !== thresholds.matchType && applicable) {
      for (const sourceProfileId of eligibleSourceIds) {
        if (!(latestBySource.get(sourceProfileId)?.length ?? 0)) {
          addMismatch(mismatches, {
            code: "match_type_no_results",
            message: `${sourceProfileId} has no valid ${matchType} results in latest run ${latestRun.id}.`,
            runId: latestRun.id,
            seekerProfileId: sourceProfileId,
            matchType,
          });
        }
      }
    }
    const counters = matchTypeCounters.get(matchType)!;
    const deterministic =
      counters.top3OrderMismatches === 0 &&
      counters.scoreMismatches === 0 &&
      counters.breakdownMismatches === 0;
    const leakage = {
      crossOrg: counters.crossOrg,
      crossSpace: counters.crossSpace,
      nonMentorTargets: counters.nonMentorTargets,
      unknownSources: counters.unknownSources,
      unknownTargets: counters.unknownTargets,
    };
    matchTypes[matchType] = {
      direction,
      applicable,
      eligibleSources: eligibleSourceIds.size,
      coveredSources,
      coverage,
      minimumCoverage,
      resultCount,
      nonEmpty: resultCount > 0,
      invalidRows: counters.invalidRows,
      ineligiblePairs: counters.ineligiblePairs,
      leakage,
      duplicates: counters.duplicates,
      determinism: {
        top3OrderMismatches: counters.top3OrderMismatches,
        scoreMismatches: counters.scoreMismatches,
        breakdownMismatches: counters.breakdownMismatches,
        passed: deterministic,
      },
      passed:
        coveragePassed &&
        counters.invalidRows === 0 &&
        counters.ineligiblePairs === 0 &&
        Object.values(leakage).every((value) => value === 0) &&
        counters.duplicates === 0 &&
        deterministic,
    };
  }

  const degradedRaw = latestRun.metadata.embeddingsDegraded;
  const embeddingsDegraded =
    typeof degradedRaw === "number" && Number.isFinite(degradedRaw) ? degradedRaw : null;
  if (latestRun.status !== "completed") {
    addMismatch(mismatches, {
      code: "run_incomplete",
      message: `Latest run ${latestRun.id} status is ${latestRun.status}; expected completed.`,
      runId: latestRun.id,
    });
  }
  if (embeddingsDegraded !== 0) {
    addMismatch(mismatches, {
      code: "run_degraded",
      message: `Latest run ${latestRun.id} embeddingsDegraded is ${String(embeddingsDegraded)}; expected 0.`,
      runId: latestRun.id,
    });
  }

  const embeddingPassed =
    embeddingMissing === 0 &&
    embeddingDuplicates === 0 &&
    embeddingWrongModel === 0 &&
    embeddingUnknownOwners === 0;
  const determinismPassed =
    top3OrderMismatches === 0 && scoreMismatches === 0 && breakdownMismatches === 0;
  const latestRunPassed =
    latestRun.orgId === input.orgId &&
    latestRun.spaceId === input.spaceId &&
    latestRun.status === "completed" &&
    embeddingsDegraded === 0;

  const gates: Record<string, PrelaunchQaGate> = {
    datasetShape: {
      passed: datasetShapePassed,
      actual: `${counts.seekers}/${counts.mentors}/${counts.calibrationSeekers}/${counts.holdoutSeekers}`,
      expected: "50 seekers, 10 mentors, 35 calibration, 15 holdout, all profile and intent IDs unique",
    },
    participantScope: {
      passed: participantScopeErrors === 0,
      actual: participantScopeErrors,
      expected: "0 participants outside the QA organization or Space",
    },
    participantMatchTypes: {
      passed: participantMatchTypeErrors === 0,
      actual: participantMatchTypeErrors,
      expected: "supported, unique seeking/offering match types on every participant",
    },
    runScope: {
      passed: runScopeErrors === 0 && runIdsUnique,
      actual: runScopeErrors + (runIdsUnique ? 0 : 1),
      expected: "2 distinct persisted runs in the QA organization and Space",
    },
    blindLabels: {
      passed: labelsPassed,
      actual: labelMap.size,
      expected: "exactly one valid 0/1/2 label for every one of the 500 seeker-mentor pairs",
    },
    coverage: {
      passed: coverageValue >= thresholds.minimumCoverage,
      actual: coverageValue,
      expected: `>= ${thresholds.minimumCoverage}`,
    },
    matchTypeCoverage: {
      passed: matchTypeCoverageFailures === 0,
      actual: matchTypeCoverageFailures,
      expected: `coverage >= ${thresholds.minimumCoverage} for every applicable match type; no results for inapplicable types`,
    },
    holdoutHitAt3: {
      passed: hitAt3 >= thresholds.minimumHitAt3,
      actual: hitAt3,
      expected: `>= ${thresholds.minimumHitAt3}`,
    },
    holdoutMrr: {
      passed: mrr >= thresholds.minimumMrr,
      actual: mrr,
      expected: `>= ${thresholds.minimumMrr}`,
    },
    holdoutNdcgAt5: {
      passed: ndcgAt5 >= thresholds.minimumNdcgAt5,
      actual: ndcgAt5,
      expected: `>= ${thresholds.minimumNdcgAt5}`,
    },
    targetIsolation: {
      passed:
        crossOrg === 0 &&
        crossSpace === 0 &&
        nonMentorTargets === 0 &&
        unknownSources === 0 &&
        unknownTargets === 0,
      actual:
        crossOrg + crossSpace + nonMentorTargets + unknownSources + unknownTargets,
      expected: "0 cross-org, cross-Space, non-mentor, unknown-source, or unknown-target results",
    },
    eligiblePairs: {
      passed: ineligiblePairs === 0,
      actual: ineligiblePairs,
      expected: "0 rows whose source/target eligibility flags violate the match-type direction",
    },
    duplicateMatches: {
      passed: duplicates === 0,
      actual: duplicates,
      expected: "0 duplicate (source, target, type) rows in either run",
    },
    persistedMatchShape: {
      passed: invalidMatches === 0,
      actual: invalidMatches,
      expected: `only ${PRELAUNCH_QA_MATCH_TYPES.join(", ")} rows with finite scores and breakdown factors`,
    },
    deterministicTop3: {
      passed: determinismPassed,
      actual: top3OrderMismatches + scoreMismatches + breakdownMismatches,
      expected: "identical Top 3 order, scores, and deep score breakdowns across both runs",
    },
    embeddingModel: {
      passed: embeddingPassed,
      actual:
        embeddingMissing +
        embeddingDuplicates +
        embeddingWrongModel +
        embeddingUnknownOwners,
      expected: `complete unique profile/intent evidence using ${thresholds.embeddingModel} in both runs`,
    },
    latestRun: {
      passed: latestRunPassed,
      actual: `${latestRun.status}/${String(embeddingsDegraded)}`,
      expected: "completed with embeddingsDegraded=0 in the QA organization and Space",
    },
  };

  return {
    overallPassed: Object.values(gates).every((gate) => gate.passed),
    counts,
    coverage: {
      coveredSeekers,
      totalSeekers: input.seekers.length,
      value: coverageValue,
      passed: gates.coverage.passed,
    },
    holdout: {
      seekers: holdoutSeekers.length,
      hitsAt3,
      hitAt3,
      mrr,
      ndcgAt5,
    },
    leakage: { crossOrg, crossSpace, nonMentorTargets, unknownSources, unknownTargets },
    duplicates,
    matchTypes,
    determinism: {
      top3OrderMismatches,
      scoreMismatches,
      breakdownMismatches,
      passed: determinismPassed,
    },
    embeddingGate: {
      requiredModel: thresholds.embeddingModel,
      missing: embeddingMissing,
      duplicates: embeddingDuplicates,
      wrongModel: embeddingWrongModel,
      unknownOwners: embeddingUnknownOwners,
      passed: embeddingPassed,
    },
    latestRunGate: {
      runId: latestRun.id,
      status: latestRun.status,
      embeddingsDegraded,
      passed: latestRunPassed,
    },
    gates,
    knownMismatches: mismatches,
  };
}

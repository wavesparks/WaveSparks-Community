import { describe, expect, it } from "vitest";

import {
  evaluatePrelaunchQa,
  PRELAUNCH_QA_THRESHOLDS,
  type PrelaunchQaEvaluationInput,
  type PrelaunchQaMatchType,
  type PrelaunchQaParticipant,
  type PrelaunchQaPersistedMatch,
  type PrelaunchQaPersistedRun,
  type PrelaunchQaRelevanceLabel,
  type PrelaunchQaSeeker,
} from "@/lib/prelaunch-qa-evaluation";

const orgId = "org_prelaunch_qa";
const spaceId = "space_prelaunch_qa";

function padded(index: number) {
  return String(index).padStart(2, "0");
}

function buildSeekers(): PrelaunchQaSeeker[] {
  return Array.from({ length: 50 }, (_, index) => ({
    profileId: `seeker_${padded(index)}`,
    intentId: `intent_seeker_${padded(index)}`,
    orgId,
    spaceId,
    seekingMatchTypes: ["mentor_match"],
    offeringMatchTypes: [],
    split: index < 35 ? "calibration" : "holdout",
  }));
}

function buildMentors(): PrelaunchQaParticipant[] {
  return Array.from({ length: 10 }, (_, index) => ({
    profileId: `mentor_${padded(index)}`,
    intentId: `intent_mentor_${padded(index)}`,
    orgId,
    spaceId,
    seekingMatchTypes: [],
    offeringMatchTypes: ["mentor_match"],
  }));
}

function buildLabels(
  seekers: readonly PrelaunchQaSeeker[],
  mentors: readonly PrelaunchQaParticipant[],
): PrelaunchQaRelevanceLabel[] {
  return seekers.flatMap((seeker, seekerIndex) => {
    const primary = seekerIndex % mentors.length;
    const secondary = (seekerIndex + 1) % mentors.length;
    return mentors.map((mentor, mentorIndex) => ({
      seekerProfileId: seeker.profileId,
      mentorProfileId: mentor.profileId,
      relevance: mentorIndex === primary ? 2 : mentorIndex === secondary ? 1 : 0,
    }));
  });
}

function buildMatches(
  runId: string,
  seekers: readonly PrelaunchQaSeeker[],
  mentors: readonly PrelaunchQaParticipant[],
): PrelaunchQaPersistedMatch[] {
  return seekers.flatMap((seeker, seekerIndex) => {
    const primary = seekerIndex % mentors.length;
    const secondary = (seekerIndex + 1) % mentors.length;
    const rankedMentorIndexes = [
      primary,
      secondary,
      ...mentors.map((_, index) => index).filter((index) => index !== primary && index !== secondary),
    ];
    return rankedMentorIndexes.map((mentorIndex, rank) => {
      const mentor = mentors[mentorIndex];
      const score = 100 - rank;
      return {
        id: `${runId}_${seeker.profileId}_${mentor.profileId}`,
        orgId,
        spaceId,
        sourceProfileId: seeker.profileId,
        targetProfileId: mentor.profileId,
        targetOrgId: orgId,
        targetSpaceId: spaceId,
        matchType: "mentor_match",
        score,
        scoreBreakdown: {
          semantic: score * 0.6,
          skills: score * 0.4,
        },
      };
    });
  });
}

function buildRun(
  id: string,
  seekers: readonly PrelaunchQaSeeker[],
  mentors: readonly PrelaunchQaParticipant[],
  reverseMatches = false,
): PrelaunchQaPersistedRun {
  const participants = [...seekers, ...mentors];
  const matches = buildMatches(id, seekers, mentors);
  return {
    id,
    orgId,
    spaceId,
    status: "completed",
    metadata: { embeddingsDegraded: 0 },
    matches: reverseMatches ? matches.reverse() : matches,
    embeddings: participants.flatMap((participant) => [
      {
        ownerType: "profile" as const,
        ownerId: participant.profileId,
        model: "text-embedding-3-large",
      },
      {
        ownerType: "intent" as const,
        ownerId: participant.intentId,
        model: "text-embedding-3-large",
      },
    ]),
  };
}

function buildInput(): PrelaunchQaEvaluationInput {
  const seekers = buildSeekers();
  const mentors = buildMentors();
  return {
    orgId,
    spaceId,
    seekers,
    mentors,
    labels: buildLabels(seekers, mentors),
    runs: [
      buildRun("run_1", seekers, mentors),
      buildRun("run_2", seekers, mentors, true),
    ],
  };
}

function enableMutualMatches(
  input: PrelaunchQaEvaluationInput,
  matchType: Extract<PrelaunchQaMatchType, "cofounder_match" | "collaborator_match">,
  sourceIndexes: readonly [number, number],
) {
  const participants = sourceIndexes.map((index) => input.seekers[index]);
  for (const participant of participants) {
    participant.seekingMatchTypes.push(matchType);
    participant.offeringMatchTypes.push(matchType);
  }
  for (const run of input.runs) {
    participants.forEach((source, index) => {
      const target = participants[index === 0 ? 1 : 0];
      run.matches.push({
        id: `${run.id}_${matchType}_${source.profileId}`,
        orgId,
        spaceId,
        sourceProfileId: source.profileId,
        targetProfileId: target.profileId,
        targetOrgId: orgId,
        targetSpaceId: spaceId,
        matchType,
        score: 88 - index,
        scoreBreakdown: { semantic: 70, intent: 18 - index },
      });
    });
  }
}

function removeSeekerMatches(
  input: PrelaunchQaEvaluationInput,
  seekerIds: ReadonlySet<string>,
) {
  for (const run of input.runs) {
    run.matches = run.matches.filter((match) => !seekerIds.has(match.sourceProfileId));
  }
}

function matchesFor(
  input: PrelaunchQaEvaluationInput,
  runIndex: 0 | 1,
  seekerId: string,
) {
  return input.runs[runIndex].matches.filter(
    (match) => match.sourceProfileId === seekerId,
  ) as PrelaunchQaPersistedMatch[];
}

function rankedMatchesFor(
  input: PrelaunchQaEvaluationInput,
  runIndex: 0 | 1,
  seekerId: string,
) {
  return matchesFor(input, runIndex, seekerId).sort(
    (left, right) =>
      right.score - left.score ||
      (left.targetProfileId < right.targetProfileId ? -1 : 1),
  );
}

describe("prelaunch QA matching evaluation", () => {
  it("is pure and repeatable for the same persisted input", () => {
    const input = buildInput();
    const before = structuredClone(input);

    const first = evaluatePrelaunchQa(input);
    const second = evaluatePrelaunchQa(input);

    expect(input).toEqual(before);
    expect(second).toEqual(first);
  });

  it("passes a complete, isolated, provider-backed and deterministic Top 3 benchmark", () => {
    const result = evaluatePrelaunchQa(buildInput());

    expect(result.overallPassed).toBe(true);
    expect(result.counts).toEqual({
      seekers: 50,
      mentors: 10,
      calibrationSeekers: 35,
      holdoutSeekers: 15,
      labels: 500,
    });
    expect(result.coverage).toMatchObject({
      coveredSeekers: 50,
      totalSeekers: 50,
      value: 1,
      passed: true,
    });
    expect(result.holdout).toEqual({
      seekers: 15,
      hitsAt3: 15,
      hitAt3: 1,
      mrr: 1,
      ndcgAt5: 1,
    });
    expect(result.leakage).toEqual({
      crossOrg: 0,
      crossSpace: 0,
      nonMentorTargets: 0,
      unknownSources: 0,
      unknownTargets: 0,
    });
    expect(result.matchTypes).toMatchObject({
      mentor_match: {
        applicable: true,
        eligibleSources: 50,
        coveredSources: 50,
        coverage: 1,
        nonEmpty: true,
        passed: true,
      },
      cofounder_match: {
        applicable: false,
        eligibleSources: 0,
        resultCount: 0,
        passed: true,
      },
      collaborator_match: {
        applicable: false,
        eligibleSources: 0,
        resultCount: 0,
        passed: true,
      },
    });
    expect(result.determinism.passed).toBe(true);
    expect(result.embeddingGate).toMatchObject({
      missing: 0,
      duplicates: 0,
      wrongModel: 0,
      unknownOwners: 0,
      passed: true,
    });
    expect(result.knownMismatches).toEqual([]);
  });

  it("evaluates eligible cofounder and collaborator results without changing mentor accuracy", () => {
    const input = buildInput();
    enableMutualMatches(input, "cofounder_match", [0, 1]);
    enableMutualMatches(input, "collaborator_match", [2, 3]);

    const result = evaluatePrelaunchQa(input);

    expect(result.overallPassed).toBe(true);
    expect(result.coverage.value).toBe(1);
    expect(result.holdout).toMatchObject({ hitAt3: 1, mrr: 1, ndcgAt5: 1 });
    expect(result.matchTypes.cofounder_match).toMatchObject({
      direction: "mutual",
      applicable: true,
      eligibleSources: 2,
      coveredSources: 2,
      coverage: 1,
      resultCount: 2,
      ineligiblePairs: 0,
      duplicates: 0,
      passed: true,
    });
    expect(result.matchTypes.collaborator_match).toMatchObject({
      direction: "mutual",
      applicable: true,
      eligibleSources: 2,
      coveredSources: 2,
      coverage: 1,
      resultCount: 2,
      passed: true,
    });
    expect(result.determinism.passed).toBe(true);
  });

  it("fails per-type gates for ineligible, duplicated, leaking, or nondeterministic rows", () => {
    const input = buildInput();
    enableMutualMatches(input, "cofounder_match", [0, 1]);
    enableMutualMatches(input, "collaborator_match", [2, 3]);

    input.seekers[4].seekingMatchTypes.push("cofounder_match");
    const ineligible = {
      ...input.runs[1].matches.find(
        (match) => match.matchType === "cofounder_match",
      )!,
      id: "ineligible_cofounder",
      sourceProfileId: input.seekers[4].profileId,
      targetProfileId: input.seekers[0].profileId,
    };
    input.runs[1].matches.push(ineligible, { ...ineligible, id: "duplicate_cofounder" });

    const leaking = input.runs[1].matches.find(
      (match) => match.matchType === "collaborator_match",
    )!;
    leaking.targetOrgId = "org_elsewhere";

    const nondeterministic = input.runs[1].matches.find(
      (match) =>
        match.matchType === "collaborator_match" &&
        match.sourceProfileId === input.seekers[3].profileId,
    )!;
    nondeterministic.score = 12;

    const result = evaluatePrelaunchQa(input);

    expect(result.overallPassed).toBe(false);
    expect(result.matchTypes.cofounder_match).toMatchObject({
      ineligiblePairs: 2,
      duplicates: 1,
      passed: false,
    });
    expect(result.matchTypes.collaborator_match.leakage.crossOrg).toBe(1);
    expect(result.matchTypes.collaborator_match.determinism.passed).toBe(false);
    expect(result.gates.eligiblePairs.passed).toBe(false);
    expect(result.gates.targetIsolation.passed).toBe(false);
    expect(result.gates.duplicateMatches.passed).toBe(false);
    expect(result.gates.deterministicTop3.passed).toBe(false);
  });

  it("treats the strict coverage and holdout metric thresholds as inclusive", () => {
    const coverageBoundary = buildInput();
    removeSeekerMatches(
      coverageBoundary,
      new Set(coverageBoundary.seekers.slice(0, 5).map((seeker) => seeker.profileId)),
    );
    const coverageResult = evaluatePrelaunchQa(coverageBoundary);

    expect(coverageResult.coverage.value).toBe(PRELAUNCH_QA_THRESHOLDS.minimumCoverage);
    expect(coverageResult.gates.coverage.passed).toBe(true);
    expect(coverageResult.overallPassed).toBe(true);

    const hitBoundary = buildInput();
    removeSeekerMatches(
      hitBoundary,
      new Set(hitBoundary.seekers.slice(47).map((seeker) => seeker.profileId)),
    );
    const hitResult = evaluatePrelaunchQa(hitBoundary);

    expect(hitResult.holdout).toMatchObject({
      hitsAt3: 12,
      hitAt3: 0.8,
      mrr: 0.8,
      ndcgAt5: 0.8,
    });
    expect(hitResult.gates.holdoutHitAt3.passed).toBe(true);
    expect(hitResult.gates.holdoutMrr.passed).toBe(true);
    expect(hitResult.gates.holdoutNdcgAt5.passed).toBe(true);
    expect(hitResult.overallPassed).toBe(true);
    expect(
      hitResult.knownMismatches.filter(
        (mismatch) => mismatch.code === "holdout_no_relevant_top3",
      ),
    ).toHaveLength(3);

    const typeCoverageBoundary = buildInput();
    for (const indexes of [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
      [8, 9],
    ] as const) {
      enableMutualMatches(typeCoverageBoundary, "cofounder_match", indexes);
    }
    for (const run of typeCoverageBoundary.runs) {
      run.matches = run.matches.filter(
        (match) =>
          match.matchType !== "cofounder_match" ||
          match.sourceProfileId !== typeCoverageBoundary.seekers[0].profileId,
      );
    }
    const typeCoverageResult = evaluatePrelaunchQa(typeCoverageBoundary);

    expect(typeCoverageResult.matchTypes.cofounder_match).toMatchObject({
      eligibleSources: 10,
      coveredSources: 9,
      coverage: PRELAUNCH_QA_THRESHOLDS.minimumCoverage,
      passed: true,
    });
    expect(typeCoverageResult.gates.matchTypeCoverage.passed).toBe(true);
    expect(typeCoverageResult.overallPassed).toBe(true);
  });

  it("uses relevance > 0 for Hit/MRR and graded 2^rel-1 gain for NDCG", () => {
    const input = buildInput();
    for (const seeker of input.seekers.filter((candidate) => candidate.split === "holdout")) {
      for (const runIndex of [0, 1] as const) {
        const matches = matchesFor(input, runIndex, seeker.profileId);
        const relevant = matches.filter((match) => {
          const label = input.labels.find(
            (candidate) =>
              candidate.seekerProfileId === seeker.profileId &&
              candidate.mentorProfileId === match.targetProfileId,
          );
          return (label?.relevance ?? 0) > 0;
        });
        const irrelevant = matches.filter((match) => !relevant.includes(match));
        const gradeTwo = relevant.find((match) =>
          input.labels.some(
            (label) =>
              label.seekerProfileId === seeker.profileId &&
              label.mentorProfileId === match.targetProfileId &&
              label.relevance === 2,
          ),
        )!;
        const gradeOne = relevant.find((match) => match !== gradeTwo)!;
        const desiredOrder = [irrelevant[0], gradeOne, irrelevant[1], irrelevant[2], gradeTwo];
        desiredOrder.forEach((match, index) => {
          match.score = 100 - index;
          match.scoreBreakdown = { semantic: match.score };
        });
        matches
          .filter((match) => !desiredOrder.includes(match))
          .forEach((match, index) => {
            match.score = 50 - index;
            match.scoreBreakdown = { semantic: match.score };
          });
      }
    }

    const result = evaluatePrelaunchQa(input);
    const expectedNdcg =
      (1 / Math.log2(3) + 3 / Math.log2(6)) /
      (3 + 1 / Math.log2(3));

    expect(result.holdout.hitAt3).toBe(1);
    expect(result.holdout.mrr).toBe(0.5);
    expect(result.holdout.ndcgAt5).toBeCloseTo(expectedNdcg, 12);
    expect(result.gates.holdoutMrr.passed).toBe(false);
    expect(result.gates.holdoutNdcgAt5.passed).toBe(false);
    expect(result.overallPassed).toBe(false);
    expect(
      result.knownMismatches.filter(
        (mismatch) => mismatch.code === "holdout_irrelevant_top1",
      ),
    ).toHaveLength(15);
  });

  it("fails closed on leakage, non-mentor targets, duplicates, and changed Top 3 data", () => {
    const input = buildInput();
    const firstSeeker = input.seekers[0].profileId;
    const leaked = rankedMatchesFor(input, 1, firstSeeker)[0];
    leaked.targetProfileId = input.seekers[1].profileId;
    leaked.targetOrgId = "org_elsewhere";
    leaked.targetSpaceId = "space_elsewhere";

    const duplicate = {
      ...rankedMatchesFor(input, 1, input.seekers[2].profileId)[0],
      id: "duplicate",
    };
    input.runs[1].matches = [...input.runs[1].matches, duplicate];

    const changed = rankedMatchesFor(input, 1, input.seekers[3].profileId)[0];
    changed.score = 99.5;
    changed.scoreBreakdown = { ...changed.scoreBreakdown, semantic: 12.345 };

    const reordered = rankedMatchesFor(input, 1, input.seekers[4].profileId).slice(0, 2);
    reordered[0].score = 98;
    reordered[1].score = 101;

    input.runs[1].matches = [
      ...input.runs[1].matches,
      {
        ...rankedMatchesFor(input, 1, firstSeeker)[1],
        id: "unknown_source",
        sourceProfileId: "unknown_seeker",
      },
    ];

    const result = evaluatePrelaunchQa(input);

    expect(result.overallPassed).toBe(false);
    expect(result.leakage).toMatchObject({
      crossOrg: 1,
      crossSpace: 1,
      nonMentorTargets: 1,
      unknownSources: 1,
      unknownTargets: 0,
    });
    expect(result.duplicates).toBe(1);
    expect(result.determinism.top3OrderMismatches).toBeGreaterThanOrEqual(2);
    expect(result.determinism.scoreMismatches).toBeGreaterThanOrEqual(1);
    expect(result.determinism.breakdownMismatches).toBeGreaterThanOrEqual(1);
    expect(result.gates.targetIsolation.passed).toBe(false);
    expect(result.gates.duplicateMatches.passed).toBe(false);
    expect(result.gates.deterministicTop3.passed).toBe(false);
  });

  it("requires complete unique provider embedding evidence and a healthy latest run", () => {
    const input = buildInput();
    input.runs[0].embeddings = input.runs[0].embeddings.slice(1);
    input.runs[1].embeddings = [
      ...input.runs[1].embeddings,
      input.runs[1].embeddings[0],
      {
        ownerType: "profile",
        ownerId: "unknown_profile",
        model: "text-embedding-3-large",
      },
    ];
    input.runs[1].embeddings[0] = {
      ...input.runs[1].embeddings[0],
      model: "local-token-hash-v3",
    };
    input.runs[1].status = "failed";
    input.runs[1].metadata = { embeddingsDegraded: 1 };

    const result = evaluatePrelaunchQa(input);

    expect(result.overallPassed).toBe(false);
    expect(result.embeddingGate).toMatchObject({
      missing: 1,
      duplicates: 1,
      wrongModel: 1,
      unknownOwners: 1,
      passed: false,
    });
    expect(result.latestRunGate).toMatchObject({
      status: "failed",
      embeddingsDegraded: 1,
      passed: false,
    });
  });

  it("requires unique participant intents and two distinct in-scope run IDs", () => {
    const input = buildInput();
    input.seekers[1].intentId = input.seekers[0].intentId;
    input.runs[0].orgId = "org_elsewhere";
    input.runs[1].id = input.runs[0].id;

    const result = evaluatePrelaunchQa(input);

    expect(result.overallPassed).toBe(false);
    expect(result.gates.datasetShape.passed).toBe(false);
    expect(result.gates.runScope).toMatchObject({ passed: false, actual: 2 });
    expect(result.knownMismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "run_scope" }),
        expect.objectContaining({ code: "run_duplicate_id" }),
      ]),
    );
  });

  it("fails invalid match types and malformed score breakdowns without throwing", () => {
    const input = buildInput();
    rankedMatchesFor(input, 1, input.seekers[0].profileId)[0].matchType = "peer_match";
    rankedMatchesFor(input, 1, input.seekers[1].profileId)[0].scoreBreakdown =
      undefined as unknown as Record<string, number>;

    const result = evaluatePrelaunchQa(input);

    expect(result.overallPassed).toBe(false);
    expect(result.gates.persistedMatchShape).toMatchObject({
      passed: false,
      actual: 2,
    });
    expect(
      result.knownMismatches.filter((mismatch) => mismatch.code === "match_invalid"),
    ).toHaveLength(2);
  });

  it("fails invalid dataset and label shapes without producing NaN metrics", () => {
    const input = buildInput();
    input.seekers = input.seekers.slice(1);
    input.labels = [
      ...input.labels.slice(1),
      input.labels[1],
      {
        ...input.labels[2],
        relevance: 3,
      } as unknown as PrelaunchQaRelevanceLabel,
    ];
    input.runs[1].matches = [];

    const result = evaluatePrelaunchQa(input);

    expect(result.overallPassed).toBe(false);
    expect(result.gates.datasetShape.passed).toBe(false);
    expect(result.gates.blindLabels.passed).toBe(false);
    expect(result.coverage.value).toBe(0);
    expect(result.holdout.hitAt3).toBe(0);
    expect(result.holdout.mrr).toBe(0);
    expect(result.holdout.ndcgAt5).toBe(0);
    expect(Number.isNaN(result.holdout.ndcgAt5)).toBe(false);
  });

  it("uses stable target/id tie breaks and deep object equality independent of key order", () => {
    const input = buildInput();
    const seeker = input.seekers[0].profileId;
    for (const runIndex of [0, 1] as const) {
      const topTwo = rankedMatchesFor(input, runIndex, seeker).slice(0, 2);
      topTwo[0].score = 100;
      topTwo[1].score = 100;
    }
    const firstTop = rankedMatchesFor(input, 0, seeker)[0];
    const secondTop = matchesFor(input, 1, seeker).find(
      (match) => match.targetProfileId === firstTop.targetProfileId,
    )!;
    firstTop.scoreBreakdown = { semantic: 60, skills: 40 };
    secondTop.scoreBreakdown = { skills: 40, semantic: 60 };

    const result = evaluatePrelaunchQa(input);

    expect(result.determinism).toEqual({
      top3OrderMismatches: 0,
      scoreMismatches: 0,
      breakdownMismatches: 0,
      passed: true,
    });
    expect(result.overallPassed).toBe(true);
  });
});

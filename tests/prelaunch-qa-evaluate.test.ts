import { chmodSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PrelaunchQaInput } from "../scripts/prelaunch-qa-core";
import {
  assemblePrelaunchQaEvaluationInput,
  capturePrelaunchQaDatabaseSnapshot,
  parsePrelaunchQaLabels,
  readPrelaunchQaLabelsFile,
  type PrelaunchQaDatabaseSnapshot,
  type PrelaunchQaLabels,
} from "../scripts/prelaunch-qa-evaluate";

const orgId = "org_prelaunch_qa";
const spaceId = "spc_prelaunch_qa_test";
const temporaryDirectories: string[] = [];

function position(index: number) {
  return String(index).padStart(2, "0");
}

function qaInput() {
  return {
    version: 1,
    generatedAt: "2026-07-15T00:00:00.000Z",
    people: [
      ...Array.from({ length: 50 }, (_, index) => ({
        kind: "person" as const,
        sourceId: `qa-participant-${position(index + 1)}`,
        fullName: `QA Participant ${position(index + 1)}`,
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        kind: "mentor" as const,
        sourceId: `qa-mentor-${position(index + 1)}`,
        fullName: `QA Mentor ${position(index + 1)}`,
      })),
    ],
  } as unknown as PrelaunchQaInput;
}

function labelsValue(): PrelaunchQaLabels {
  const seekers = qaInput().people.filter((person) => person.kind === "person");
  const mentors = qaInput().people.filter((person) => person.kind === "mentor");
  const consensus = seekers.flatMap((seeker, seekerIndex) =>
    mentors.map((mentor, mentorIndex) => ({
      sourceId: seeker.sourceId,
      mentorSourceId: mentor.sourceId,
      relevance: mentorIndex === seekerIndex % 10 ? 2 : 0,
      roundA: mentorIndex === seekerIndex % 10 ? 2 : 0,
      roundB: mentorIndex === seekerIndex % 10 ? 2 : 0,
    })),
  );
  return {
    version: 1,
    generatedAt: "2026-07-15T00:00:00.000Z",
    embeddingModel: "text-embedding-3-large",
    selection: {
      method: "Deterministic completeness and coverage selection.",
      mentorSourceIds: mentors.map((mentor) => mentor.sourceId),
    },
    split: Object.fromEntries(
      seekers.map((person, index) => [
        person.sourceId,
        index < 35 ? "calibration" : "holdout",
      ]),
    ),
    rounds: {
      A: consensus.map((label) => ({
        sourceId: label.sourceId,
        mentorSourceId: label.mentorSourceId,
        relevance: label.roundA,
        reason: "Independent domain assessment.",
      })),
      B: consensus.map((label) => ({
        sourceId: label.sourceId,
        mentorSourceId: label.mentorSourceId,
        relevance: label.roundB,
        reason: "Independent outcome assessment.",
      })),
    },
    consensus,
  } as PrelaunchQaLabels;
}

function rosterRows() {
  return qaInput().people.map((person) => ({
    profile_id: `profile_${person.sourceId}`,
    full_name: person.fullName,
    profile_embedding_model: "text-embedding-3-large",
    membership_org_id: orgId,
    intent_id: `intent_${person.sourceId}`,
    intent_org_id: orgId,
    intent_space_id: spaceId,
    intent_embedding_model: "text-embedding-3-large",
    seeking_match_types: person.kind === "person" ? ["mentor_match"] : [],
    offering_match_types: person.kind === "mentor" ? ["mentor_match"] : [],
  }));
}

function snapshot(id: string): PrelaunchQaDatabaseSnapshot {
  const participants = qaInput().people.map((person) => ({
    sourceId: person.sourceId,
    fullName: person.fullName,
    kind: person.kind,
    profileId: `profile_${person.sourceId}`,
    intentId: `intent_${person.sourceId}`,
    orgId,
    spaceId,
    seekingMatchTypes: person.kind === "person" ? ["mentor_match" as const] : [],
    offeringMatchTypes: person.kind === "mentor" ? ["mentor_match" as const] : [],
  }));
  return {
    participants,
    run: {
      id,
      orgId,
      spaceId,
      status: "completed",
      metadata: { embeddingsDegraded: 0 },
      matches: [],
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
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (temporaryDirectories.length) {
    rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
  }
});

describe("prelaunch QA database evaluation adapter", () => {
  it("strictly parses the version 1 sourceId split and 500 consensus labels", () => {
    const parsed = parsePrelaunchQaLabels(labelsValue());
    expect(Object.values(parsed.split).filter((split) => split === "calibration")).toHaveLength(35);
    expect(parsed.consensus).toHaveLength(500);

    const invalidRound = structuredClone(labelsValue()) as unknown as {
      rounds: { A: Array<{ relevance: number }> };
    };
    invalidRound.rounds.A[0].relevance = 3;
    expect(() => parsePrelaunchQaLabels(invalidRound)).toThrow(/rounds\.A/);

    const inconsistentRound = structuredClone(labelsValue());
    inconsistentRound.rounds.A[0].relevance =
      inconsistentRound.rounds.A[0].relevance === 2 ? 1 : 2;
    expect(() => parsePrelaunchQaLabels(inconsistentRound)).toThrow(/round A/);
  });

  it("reads only a current-user regular 0600 labels file below /tmp", () => {
    const directory = mkdtempSync("/tmp/wavesparks-labels-test-");
    temporaryDirectories.push(directory);
    const labelsPath = path.join(directory, "labels.json");
    writeFileSync(labelsPath, JSON.stringify(labelsValue()), { mode: 0o600 });
    expect(readPrelaunchQaLabelsFile(labelsPath).consensus).toHaveLength(500);

    chmodSync(labelsPath, 0o644);
    expect(() => readPrelaunchQaLabelsFile(labelsPath)).toThrow(/exactly 0600/);

    const oversizedPath = path.join(directory, "oversized.json");
    writeFileSync(oversizedPath, "{}", { mode: 0o600 });
    truncateSync(oversizedPath, 2 * 1024 * 1024 + 1);
    expect(() => readPrelaunchQaLabelsFile(oversizedPath)).toThrow(/2 MiB/);
  });

  it("captures the latest completed run, all embedding evidence, and joined target scope", async () => {
    const sqlClient = vi
      .fn()
      .mockResolvedValueOnce(rosterRows())
      .mockResolvedValueOnce([
        {
          id: "run_latest",
          org_id: orgId,
          space_id: spaceId,
          status: "completed",
          metadata_json: { embeddingsDegraded: 0 },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "match_1",
          org_id: orgId,
          space_id: spaceId,
          source_profile_id: "profile_qa-participant-01",
          target_profile_id: "profile_qa-mentor-01",
          target_org_id: null,
          target_space_id: null,
          match_type: "mentor_match",
          score: "91",
          score_breakdown_json: { semantic: 91 },
        },
      ]);

    const captured = await capturePrelaunchQaDatabaseSnapshot(
      sqlClient as never,
      qaInput(),
      "run_latest",
    );

    expect(captured.participants).toHaveLength(60);
    expect(captured.participants[0]).toMatchObject({
      seekingMatchTypes: ["mentor_match"],
      offeringMatchTypes: [],
    });
    expect(captured.run).toMatchObject({ id: "run_latest", status: "completed" });
    expect(captured.run.embeddings).toHaveLength(120);
    expect(captured.run.matches[0]).toMatchObject({
      score: 91,
      targetOrgId: "",
      targetSpaceId: "",
    });
    const matchQuery = (sqlClient.mock.calls[2][0] as TemplateStringsArray).join("?");
    expect(matchQuery).toContain("LEFT JOIN memberships");
    expect(matchQuery).toContain("tsm.access_status = 'active'");
    expect(matchQuery).toContain("WHERE ma.run_id =");
    expect(matchQuery).not.toContain("ma.org_id =");
    const runQuery = (sqlClient.mock.calls[1][0] as TemplateStringsArray).join("?");
    expect(runQuery).toContain("WHERE id =");
    expect(runQuery).not.toContain("ORDER BY completed_at");
    const rosterQuery = (sqlClient.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(rosterQuery).toContain("p.seeking_match_types");
    expect(rosterQuery).toContain("p.offering_match_types");
  });

  it("rejects unsupported database eligibility flags before evaluating matches", async () => {
    const rows = rosterRows();
    rows[0].seeking_match_types = ["custom_match"];
    const sqlClient = vi.fn().mockResolvedValueOnce(rows);

    await expect(
      capturePrelaunchQaDatabaseSnapshot(sqlClient as never, qaInput(), "run_latest"),
    ).rejects.toThrow(/unsupported seeking match types/);
  });

  it("assembles stable DB identities, the 35/15 split, labels, and two snapshots", () => {
    const assembled = assemblePrelaunchQaEvaluationInput(
      qaInput(),
      labelsValue(),
      [snapshot("run_1"), snapshot("run_2")],
    );

    expect(assembled).toMatchObject({ orgId, spaceId });
    expect(assembled.seekers).toHaveLength(50);
    expect(assembled.mentors).toHaveLength(10);
    expect(assembled.labels).toHaveLength(500);
    expect(assembled.runs.map((run) => run.id)).toEqual(["run_1", "run_2"]);
    expect(assembled.seekers.filter((seeker) => seeker.split === "calibration")).toHaveLength(35);
    expect(assembled.seekers[0]).toMatchObject({
      seekingMatchTypes: ["mentor_match"],
      offeringMatchTypes: [],
    });
    expect(assembled.mentors[0]).toMatchObject({
      seekingMatchTypes: [],
      offeringMatchTypes: ["mentor_match"],
    });
    expect(assembled.labels[0]).toMatchObject({
      seekerProfileId: "profile_qa-participant-01",
      mentorProfileId: "profile_qa-mentor-01",
      relevance: 2,
    });
  });

  it("rejects eligibility drift between the two persisted-run snapshots", () => {
    const first = snapshot("run_1");
    const second = snapshot("run_2");
    second.participants[0].offeringMatchTypes = ["cofounder_match"];

    expect(() =>
      assemblePrelaunchQaEvaluationInput(qaInput(), labelsValue(), [first, second]),
    ).toThrow(/matching eligibility changed/);
  });
});

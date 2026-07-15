import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import type postgres from "postgres";
import { z } from "zod";

import {
  PRELAUNCH_QA,
  type PrelaunchQaInput,
} from "./prelaunch-qa-core";
import {
  PRELAUNCH_QA_THRESHOLDS,
  type PrelaunchQaEvaluationInput,
  type PrelaunchQaParticipant,
  type PrelaunchQaPersistedMatch,
  type PrelaunchQaPersistedRun,
  type PrelaunchQaRelevanceLabel,
  type PrelaunchQaSeeker,
} from "../src/lib/prelaunch-qa-evaluation";

const relevanceSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const splitSchema = z.enum(["calibration", "holdout"]);
const roundLabelSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(80),
    mentorSourceId: z.string().trim().min(1).max(80),
    relevance: relevanceSchema,
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict();

const labelsSchema = z
  .object({
    version: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    embeddingModel: z.literal(PRELAUNCH_QA_THRESHOLDS.embeddingModel),
    selection: z
      .object({
        method: z.string().trim().min(1).max(500),
        mentorSourceIds: z
          .array(z.string().trim().min(1).max(80))
          .length(PRELAUNCH_QA.expectedMentors),
      })
      .strict(),
    split: z.record(z.string().trim().min(1).max(80), splitSchema),
    rounds: z
      .object({
        A: z
          .array(roundLabelSchema)
          .length(PRELAUNCH_QA.expectedParticipants * PRELAUNCH_QA.expectedMentors),
        B: z
          .array(roundLabelSchema)
          .length(PRELAUNCH_QA.expectedParticipants * PRELAUNCH_QA.expectedMentors),
      })
      .strict(),
    consensus: z
      .array(
        z
          .object({
            sourceId: z.string().trim().min(1).max(80),
            mentorSourceId: z.string().trim().min(1).max(80),
            relevance: relevanceSchema,
            roundA: relevanceSchema,
            roundB: relevanceSchema,
          })
          .strict(),
      )
      .length(PRELAUNCH_QA.expectedParticipants * PRELAUNCH_QA.expectedMentors),
  })
  .strict();

export type PrelaunchQaLabels = z.infer<typeof labelsSchema>;

export interface PrelaunchQaSnapshotParticipant {
  sourceId: string;
  fullName: string;
  kind: "person" | "mentor";
  profileId: string;
  intentId: string;
  orgId: string;
  spaceId: string;
}

export interface PrelaunchQaDatabaseSnapshot {
  participants: PrelaunchQaSnapshotParticipant[];
  run: PrelaunchQaPersistedRun;
}

interface RosterRow {
  profile_id: string;
  full_name: string;
  profile_embedding_model: string | null;
  membership_org_id: string;
  intent_id: string;
  intent_org_id: string;
  intent_space_id: string;
  intent_embedding_model: string | null;
}

interface RunRow {
  id: string;
  org_id: string;
  space_id: string | null;
  status: string;
  metadata_json: unknown;
}

interface MatchRow {
  id: string;
  org_id: string;
  space_id: string | null;
  source_profile_id: string;
  target_profile_id: string;
  target_org_id: string | null;
  target_space_id: string | null;
  match_type: string;
  score: string | number;
  score_breakdown_json: unknown;
}

function assertPrivateTmpFile(inputPath: string) {
  const resolvedPath = path.resolve(inputPath);
  const file = lstatSync(resolvedPath);
  if (!file.isFile() || file.isSymbolicLink()) {
    throw new Error("Prelaunch QA labels must be a regular file, not a symlink.");
  }
  if ((file.mode & 0o777) !== 0o600) {
    throw new Error("Prelaunch QA labels permissions must be exactly 0600.");
  }
  if (typeof process.getuid === "function" && file.uid !== process.getuid()) {
    throw new Error("Prelaunch QA labels must be owned by the current user.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Prelaunch QA labels must not exceed 2 MiB.");
  }
  const realTmpRoot = realpathSync("/tmp");
  const realPath = realpathSync(resolvedPath);
  const relative = path.relative(realTmpRoot, realPath);
  if (
    relative === "" ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Prelaunch QA labels must be stored below /tmp.");
  }
  return realPath;
}

export function parsePrelaunchQaLabels(value: unknown): PrelaunchQaLabels {
  const parsed = labelsSchema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 12)
      .map((issue) => `${issue.path.join(".") || "labels"}: ${issue.message}`);
    throw new Error(`Invalid prelaunch QA labels: ${issues.join("; ")}`);
  }
  const splitValues = Object.values(parsed.data.split);
  if (
    splitValues.filter((split) => split === "calibration").length !==
      PRELAUNCH_QA_THRESHOLDS.expectedCalibrationSeekers ||
    splitValues.filter((split) => split === "holdout").length !==
      PRELAUNCH_QA_THRESHOLDS.expectedHoldoutSeekers
  ) {
    throw new Error("Prelaunch QA labels must contain the fixed 35/15 split.");
  }
  if (new Set(parsed.data.selection.mentorSourceIds).size !== PRELAUNCH_QA.expectedMentors) {
    throw new Error("Prelaunch QA mentor selection must contain 10 unique sourceId values.");
  }
  const consensusByPair = new Map(
    parsed.data.consensus.map((label) => [
      `${label.sourceId}\u0000${label.mentorSourceId}`,
      label,
    ]),
  );
  for (const roundName of ["A", "B"] as const) {
    const seenPairs = new Set<string>();
    for (const label of parsed.data.rounds[roundName]) {
      const key = `${label.sourceId}\u0000${label.mentorSourceId}`;
      const consensus = consensusByPair.get(key);
      if (
        seenPairs.has(key) ||
        !consensus ||
        consensus[roundName === "A" ? "roundA" : "roundB"] !== label.relevance
      ) {
        throw new Error(
          `Prelaunch QA blind-label round ${roundName} must cover the same 500 pairs once and agree with the recorded round relevance.`,
        );
      }
      seenPairs.add(key);
    }
    if (seenPairs.size !== PRELAUNCH_QA.expectedParticipants * PRELAUNCH_QA.expectedMentors) {
      throw new Error(`Prelaunch QA blind-label round ${roundName} must cover all 500 pairs.`);
    }
  }
  return parsed.data;
}

export function readPrelaunchQaLabelsFile(inputPath: string) {
  const realPath = assertPrivateTmpFile(inputPath);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(realPath, "utf8"));
  } catch {
    throw new Error("Prelaunch QA labels are not valid JSON.");
  }
  return parsePrelaunchQaLabels(value);
}

function inputPeopleByFullName(input: PrelaunchQaInput) {
  const byName = new Map(input.people.map((person) => [person.fullName, person]));
  if (byName.size !== input.people.length) {
    throw new Error("QA input fullName values must be unique for database mapping.");
  }
  return byName;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function capturePrelaunchQaDatabaseSnapshot(
  sqlClient: postgres.Sql,
  input: PrelaunchQaInput,
  expectedRunId: string,
): Promise<PrelaunchQaDatabaseSnapshot> {
  const rosterRows = await sqlClient<RosterRow[]>`
    SELECT
      p.id AS profile_id,
      p.full_name,
      p.embedding_model AS profile_embedding_model,
      m.org_id AS membership_org_id,
      si.id AS intent_id,
      si.org_id AS intent_org_id,
      si.space_id AS intent_space_id,
      si.embedding_model AS intent_embedding_model
    FROM space_memberships sm
    JOIN memberships m ON m.id = sm.membership_id
    JOIN profiles p ON p.membership_id = sm.membership_id
    JOIN space_intents si
      ON si.membership_id = sm.membership_id
      AND si.space_id = sm.space_id
    WHERE sm.org_id = ${PRELAUNCH_QA.orgId}
      AND sm.space_id = ${PRELAUNCH_QA.testSpaceId}
      AND sm.access_status = 'active'
    ORDER BY p.id
  `;

  const peopleByName = inputPeopleByFullName(input);
  if (rosterRows.length !== input.people.length) {
    throw new Error("QA database roster does not contain exactly the 60 input profiles/intents.");
  }
  const seenSourceIds = new Set<string>();
  const participants = rosterRows.map((row) => {
    if (row.intent_org_id !== row.membership_org_id) {
      throw new Error("QA database profile and intent organization scope do not agree.");
    }
    const person = peopleByName.get(row.full_name);
    if (!person || seenSourceIds.has(person.sourceId)) {
      throw new Error("QA database fullName values do not map one-to-one to input sourceId values.");
    }
    seenSourceIds.add(person.sourceId);
    return {
      sourceId: person.sourceId,
      fullName: person.fullName,
      kind: person.kind,
      profileId: row.profile_id,
      intentId: row.intent_id,
      orgId: row.membership_org_id,
      spaceId: row.intent_space_id,
    } satisfies PrelaunchQaSnapshotParticipant;
  });

  const [runRow] = await sqlClient<RunRow[]>`
    SELECT id, org_id, space_id, status, metadata_json
    FROM match_runs
    WHERE id = ${expectedRunId}
    LIMIT 1
  `;
  if (!runRow) throw new Error("The expected prelaunch QA matching run was not found.");

  const matchRows = await sqlClient<MatchRow[]>`
    SELECT
      ma.id,
      ma.org_id,
      ma.space_id,
      ma.source_profile_id,
      ma.target_profile_id,
      tm.org_id AS target_org_id,
      tsm.space_id AS target_space_id,
      ma.match_type,
      ma.score,
      ma.score_breakdown_json
    FROM matches ma
    LEFT JOIN profiles tp ON tp.id = ma.target_profile_id
    LEFT JOIN memberships tm ON tm.id = tp.membership_id
    LEFT JOIN space_memberships tsm
      ON tsm.membership_id = tm.id
      AND tsm.org_id = tm.org_id
      AND tsm.space_id = ma.space_id
      AND tsm.access_status = 'active'
    WHERE ma.run_id = ${runRow.id}
    ORDER BY ma.source_profile_id, ma.target_profile_id, ma.match_type, ma.id
  `;

  const matches: PrelaunchQaPersistedMatch[] = matchRows.map((row) => ({
    id: row.id,
    orgId: row.org_id,
    spaceId: row.space_id ?? "",
    sourceProfileId: row.source_profile_id,
    targetProfileId: row.target_profile_id,
    targetOrgId: row.target_org_id ?? "",
    targetSpaceId: row.target_space_id ?? "",
    matchType: row.match_type,
    score: Number(row.score),
    scoreBreakdown: row.score_breakdown_json as Record<string, number>,
  }));
  const embeddings = rosterRows.flatMap((row) => [
    { ownerType: "profile" as const, ownerId: row.profile_id, model: row.profile_embedding_model },
    { ownerType: "intent" as const, ownerId: row.intent_id, model: row.intent_embedding_model },
  ]);

  return {
    participants,
    run: {
      id: runRow.id,
      orgId: runRow.org_id,
      spaceId: runRow.space_id ?? "",
      status: runRow.status as PrelaunchQaPersistedRun["status"],
      metadata: metadataRecord(runRow.metadata_json),
      matches,
      embeddings,
    },
  };
}

function validateLabelsAgainstInput(input: PrelaunchQaInput, labels: PrelaunchQaLabels) {
  const seekerIds = new Set(
    input.people.filter((person) => person.kind === "person").map((person) => person.sourceId),
  );
  const mentorIds = new Set(
    input.people.filter((person) => person.kind === "mentor").map((person) => person.sourceId),
  );
  if (
    labels.selection.mentorSourceIds.some((sourceId) => !mentorIds.has(sourceId)) ||
    [...mentorIds].some((sourceId) => !labels.selection.mentorSourceIds.includes(sourceId))
  ) {
    throw new Error("Label mentor selection must be exactly the 10 QA mentor sourceId values.");
  }
  const splitIds = Object.keys(labels.split);
  if (
    splitIds.length !== seekerIds.size ||
    splitIds.some((sourceId) => !seekerIds.has(sourceId)) ||
    [...seekerIds].some((sourceId) => !(sourceId in labels.split))
  ) {
    throw new Error("Label split keys must be exactly the 50 QA seeker sourceId values.");
  }
  const seenPairs = new Set<string>();
  for (const label of labels.consensus) {
    const key = `${label.sourceId}\u0000${label.mentorSourceId}`;
    if (
      !seekerIds.has(label.sourceId) ||
      !mentorIds.has(label.mentorSourceId) ||
      seenPairs.has(key)
    ) {
      throw new Error("Consensus labels must contain each QA seeker-mentor sourceId pair once.");
    }
    seenPairs.add(key);
  }
  if (seenPairs.size !== seekerIds.size * mentorIds.size) {
    throw new Error("Consensus labels must cover all 500 QA seeker-mentor pairs.");
  }
}

function snapshotParticipantsBySourceId(
  snapshot: PrelaunchQaDatabaseSnapshot,
  input: PrelaunchQaInput,
) {
  const bySourceId = new Map(snapshot.participants.map((person) => [person.sourceId, person]));
  if (
    bySourceId.size !== input.people.length ||
    input.people.some((person) => !bySourceId.has(person.sourceId))
  ) {
    throw new Error("Snapshot participants must map every QA input sourceId exactly once.");
  }
  return bySourceId;
}

export function assemblePrelaunchQaEvaluationInput(
  input: PrelaunchQaInput,
  labels: PrelaunchQaLabels,
  snapshots: [PrelaunchQaDatabaseSnapshot, PrelaunchQaDatabaseSnapshot],
): PrelaunchQaEvaluationInput {
  validateLabelsAgainstInput(input, labels);
  const firstBySource = snapshotParticipantsBySourceId(snapshots[0], input);
  const latestBySource = snapshotParticipantsBySourceId(snapshots[1], input);
  for (const person of input.people) {
    const first = firstBySource.get(person.sourceId)!;
    const latest = latestBySource.get(person.sourceId)!;
    if (
      first.profileId !== latest.profileId ||
      first.intentId !== latest.intentId ||
      first.fullName !== latest.fullName ||
      first.kind !== latest.kind
    ) {
      throw new Error("Profile or intent identity changed between QA snapshots.");
    }
  }

  const seekers: PrelaunchQaSeeker[] = [];
  const mentors: PrelaunchQaParticipant[] = [];
  for (const person of [...input.people].sort((left, right) =>
    left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0,
  )) {
    const captured = latestBySource.get(person.sourceId)!;
    const participant = {
      profileId: captured.profileId,
      intentId: captured.intentId,
      orgId: captured.orgId,
      spaceId: captured.spaceId,
    };
    if (person.kind === "person") {
      seekers.push({ ...participant, split: labels.split[person.sourceId] });
    } else {
      mentors.push(participant);
    }
  }

  const latestProfileBySource = new Map(
    snapshots[1].participants.map((person) => [person.sourceId, person.profileId]),
  );
  const relevanceLabels: PrelaunchQaRelevanceLabel[] = labels.consensus.map((label) => ({
    seekerProfileId: latestProfileBySource.get(label.sourceId)!,
    mentorProfileId: latestProfileBySource.get(label.mentorSourceId)!,
    relevance: label.relevance,
  }));

  return {
    orgId: PRELAUNCH_QA.orgId,
    spaceId: PRELAUNCH_QA.testSpaceId,
    seekers,
    mentors,
    labels: relevanceLabels,
    runs: [snapshots[0].run, snapshots[1].run],
  };
}

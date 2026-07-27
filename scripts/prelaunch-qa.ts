import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";

import type postgres from "postgres";

import { readScriptEnv } from "./load-script-env";
import {
  PRELAUNCH_QA,
  assertCleanupAuthorization,
  assertSafePrelaunchQaTarget,
  assertSeedAuthorization,
  buildPrelaunchQaRows,
  cleanupPrelaunchQa,
  createPrelaunchQaDatabase,
  discoverPrelaunchQaAdminUsers,
  inspectPrelaunchQaNamespace,
  readPrelaunchQaInputFile,
  runPrelaunchQaPreflight,
  seedPrelaunchQa,
} from "./prelaunch-qa-core";
import {
  assemblePrelaunchQaEvaluationInput,
  capturePrelaunchQaDatabaseSnapshot,
  readPrelaunchQaLabelsFile,
} from "./prelaunch-qa-evaluate";
import { evaluatePrelaunchQa as evaluatePersistedPrelaunchQa } from "../src/lib/prelaunch-qa-evaluation";

export type PrelaunchQaCommand =
  | "dry-run"
  | "seed"
  | "refresh"
  | "evaluate"
  | "cleanup";

export interface PrelaunchQaCliOptions {
  command: PrelaunchQaCommand;
  environment: string;
  inputPath?: string;
  labelsPath?: string;
  adminUserId?: string;
  apply: boolean;
  confirmation?: string;
  deidentificationConfirmation?: string;
  publicDataConfirmation?: string;
}

const usage = [
  "Usage:",
  "  pnpm exec tsx scripts/prelaunch-qa.ts dry-run --environment=development --input=/tmp/prelaunch-qa.json --admin-user-id=<local-user-id>",
  `  pnpm exec tsx scripts/prelaunch-qa.ts seed --environment=development --input=/tmp/prelaunch-qa.json --admin-user-id=<local-user-id> --apply --confirm-deidentified=${PRELAUNCH_QA.deidentificationConfirmation}`,
  `  pnpm exec tsx scripts/prelaunch-qa.ts refresh --environment=development --input=/tmp/prelaunch-qa-v2.json --admin-user-id=<local-user-id> --apply --confirm-public-airtable=${PRELAUNCH_QA.publicDataConfirmation}`,
  `  pnpm exec tsx scripts/prelaunch-qa.ts evaluate --environment=development --input=/tmp/prelaunch-qa.json --labels=/tmp/prelaunch-labels.json --admin-user-id=<local-user-id> --apply (--confirm-deidentified=${PRELAUNCH_QA.deidentificationConfirmation} | --confirm-public-airtable=${PRELAUNCH_QA.publicDataConfirmation})`,
  `  pnpm exec tsx scripts/prelaunch-qa.ts cleanup --environment=development --apply --confirm=${PRELAUNCH_QA.cleanupConfirmation}`,
].join("\n");

function optionValue(args: string[], name: string) {
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function parsePrelaunchQaCli(argv: string[]): PrelaunchQaCliOptions {
  const [rawCommand, ...args] = argv;
  if (rawCommand === "--help" || rawCommand === "-h") {
    throw new Error(usage);
  }
  if (
    rawCommand !== "dry-run" &&
    rawCommand !== "seed" &&
    rawCommand !== "refresh" &&
    rawCommand !== "evaluate" &&
    rawCommand !== "cleanup"
  ) {
    throw new Error(`Choose dry-run, seed, refresh, evaluate, or cleanup.\n${usage}`);
  }

  const valuedOptions = new Set([
    "--environment",
    "--input",
    "--labels",
    "--admin-user-id",
    "--confirm",
    "--confirm-deidentified",
    "--confirm-public-airtable",
  ]);
  const flags = new Set(["--apply"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (flags.has(argument)) continue;
    const inlineName = argument.includes("=") ? argument.slice(0, argument.indexOf("=")) : undefined;
    if (inlineName && valuedOptions.has(inlineName)) continue;
    if (valuedOptions.has(argument)) {
      if (!args[index + 1] || args[index + 1].startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown prelaunch QA option: ${argument}.`);
  }

  const environment = optionValue(args, "--environment");
  if (!environment) {
    throw new Error("Pass --environment=development. No environment is selected by default.");
  }
  const inputPath = optionValue(args, "--input");
  const labelsPath = optionValue(args, "--labels");
  const adminUserId = optionValue(args, "--admin-user-id");
  const apply = args.includes("--apply");
  const confirmation = optionValue(args, "--confirm");
  const deidentificationConfirmation = optionValue(args, "--confirm-deidentified");
  const publicDataConfirmation = optionValue(args, "--confirm-public-airtable");

  if (rawCommand === "dry-run") {
    if (!inputPath) throw new Error("dry-run requires --input=/tmp/<file>.json.");
    if (!adminUserId) throw new Error("dry-run requires --admin-user-id=<local-user-id>.");
    if (labelsPath) throw new Error("dry-run does not accept --labels.");
    if (deidentificationConfirmation || publicDataConfirmation) {
      throw new Error("dry-run does not accept data-policy confirmation flags.");
    }
    if (apply || confirmation) throw new Error("dry-run does not accept write authorization flags.");
  }
  if (rawCommand === "seed") {
    if (!inputPath) throw new Error("seed requires --input=/tmp/<file>.json.");
    if (labelsPath) throw new Error("seed does not accept --labels.");
    if (!adminUserId) throw new Error("seed requires --admin-user-id=<local-user-id>.");
    if (confirmation) throw new Error("seed does not accept --confirm.");
    if (publicDataConfirmation) {
      throw new Error("seed does not accept --confirm-public-airtable; use refresh for v2 data.");
    }
    if (deidentificationConfirmation !== PRELAUNCH_QA.deidentificationConfirmation) {
      throw new Error(
        `seed requires --confirm-deidentified=${PRELAUNCH_QA.deidentificationConfirmation}.`,
      );
    }
    assertSeedAuthorization(apply);
  }
  if (rawCommand === "refresh") {
    if (!inputPath) throw new Error("refresh requires --input=/tmp/<file>.json.");
    if (labelsPath) throw new Error("refresh does not accept --labels.");
    if (!adminUserId) throw new Error("refresh requires --admin-user-id=<local-user-id>.");
    if (confirmation) throw new Error("refresh does not accept --confirm.");
    if (deidentificationConfirmation) {
      throw new Error("refresh does not accept --confirm-deidentified.");
    }
    if (publicDataConfirmation !== PRELAUNCH_QA.publicDataConfirmation) {
      throw new Error(
        `refresh requires --confirm-public-airtable=${PRELAUNCH_QA.publicDataConfirmation}.`,
      );
    }
    assertSeedAuthorization(apply);
  }
  if (rawCommand === "evaluate") {
    if (!inputPath) throw new Error("evaluate requires --input=/tmp/<file>.json.");
    if (!labelsPath) throw new Error("evaluate requires --labels=/tmp/<file>.json.");
    if (!adminUserId) throw new Error("evaluate requires --admin-user-id=<local-user-id>.");
    if (confirmation) throw new Error("evaluate does not accept --confirm.");
    const confirmedDeidentified =
      deidentificationConfirmation === PRELAUNCH_QA.deidentificationConfirmation;
    const confirmedPublicData =
      publicDataConfirmation === PRELAUNCH_QA.publicDataConfirmation;
    if (confirmedDeidentified === confirmedPublicData) {
      throw new Error(
        "evaluate requires exactly one matching data-policy confirmation flag.",
      );
    }
    assertSeedAuthorization(apply);
  }
  if (rawCommand === "cleanup") {
    if (inputPath) throw new Error("cleanup does not accept an input file.");
    if (labelsPath) throw new Error("cleanup does not accept --labels.");
    if (adminUserId) throw new Error("cleanup does not accept --admin-user-id.");
    if (deidentificationConfirmation || publicDataConfirmation) {
      throw new Error("cleanup does not accept data-policy confirmation flags.");
    }
    assertCleanupAuthorization(apply, confirmation);
  }

  return {
    command: rawCommand,
    environment,
    inputPath,
    labelsPath,
    adminUserId,
    apply,
    confirmation,
    deidentificationConfirmation,
    publicDataConfirmation,
  };
}

export function assertPrelaunchQaCommandMatchesInput(
  options: PrelaunchQaCliOptions,
  input: { version: 1 | 2 },
) {
  if (options.command === "seed" && input.version !== 1) {
    throw new Error("seed only accepts version 1 de-identified input; use refresh for version 2.");
  }
  if (options.command === "refresh" && input.version !== 2) {
    throw new Error("refresh only accepts version 2 public Airtable profile input.");
  }
  if (options.command === "evaluate") {
    const correctConfirmation =
      (input.version === 1 &&
        options.deidentificationConfirmation === PRELAUNCH_QA.deidentificationConfirmation) ||
      (input.version === 2 &&
        options.publicDataConfirmation === PRELAUNCH_QA.publicDataConfirmation);
    if (!correctConfirmation) {
      throw new Error("The evaluation confirmation does not match the input data policy.");
    }
  }
}

function selectedValue(
  key: string,
  developmentValues: Record<string, string>,
) {
  return process.env[key] ?? developmentValues[key];
}

function loadApplicationEnvironment(developmentValues: Record<string, string>) {
  for (const key of [
    "DATABASE_URL",
    "OPENAI_API_KEY",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "CLERK_JWT_KEY",
    "SPACE_SCOPED_READS_ENABLED",
  ]) {
    if (process.env[key] === undefined && developmentValues[key] !== undefined) {
      process.env[key] = developmentValues[key];
    }
  }
}

function writePrivateJson(path: string, value: unknown) {
  if (path.startsWith("/tmp/") === false || path.slice(5).includes("/")) {
    throw new Error("Prelaunch QA reports must use a direct child path below /tmp.");
  }
  const directory = mkdtempSync("/tmp/wavesparks-prelaunch-report-");
  const temporaryPath = `${directory}/report.json`;
  try {
    writeFileSync(temporaryPath, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, path);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonValue(entry)]),
    );
  }
  return value;
}

export function prelaunchQaInputFingerprint(input: unknown) {
  const semanticInput =
    input && typeof input === "object" && !Array.isArray(input)
      ? Object.fromEntries(
          Object.entries(input)
            .filter(([key]) => key !== "generatedAt" && key !== "labels")
            .map(([key, value]) => [
              key,
              key === "people" && Array.isArray(value)
                ? [...value].sort((left, right) => {
                    const leftId =
                      left && typeof left === "object" && "sourceId" in left
                        ? String(left.sourceId)
                        : "";
                    const rightId =
                      right && typeof right === "object" && "sourceId" in right
                        ? String(right.sourceId)
                        : "";
                    return leftId.localeCompare(rightId);
                  })
                : value,
            ]),
        )
      : input;
  const serialized = JSON.stringify(stableJsonValue(semanticInput)) ?? "null";
  return createHash("sha256").update(serialized).digest("hex");
}

function readColdRecomputeEvidence(expected: {
  target: string;
  inputFingerprint: string;
}) {
  const reportPath = "/tmp/wavesparks-prelaunch-seed-report.json";
  const file = lstatSync(reportPath);
  if (
    !file.isFile() ||
    file.isSymbolicLink() ||
    (file.mode & 0o777) !== 0o600 ||
    (typeof process.getuid === "function" && file.uid !== process.getuid())
  ) {
    throw new Error("The cold seed report must be a current-user 0600 regular /tmp file.");
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch {
    throw new Error("The cold seed report is not valid JSON.");
  }
  const report = value as {
    generatedAt?: unknown;
    target?: unknown;
    namespace?: unknown;
    inputFingerprintVersion?: unknown;
    inputFingerprint?: unknown;
    orgId?: unknown;
    spaceId?: unknown;
    recompute?: { durationMs?: unknown; runId?: unknown; status?: unknown };
  };
  const durationMs = report.recompute?.durationMs;
  const generatedAtMs =
    typeof report.generatedAt === "string" ? Date.parse(report.generatedAt) : Number.NaN;
  const now = Date.now();
  if (
    !Number.isFinite(generatedAtMs) ||
    generatedAtMs < now - 24 * 60 * 60 * 1_000 ||
    generatedAtMs > now + 5 * 60 * 1_000 ||
    report.target !== expected.target ||
    report.namespace !== PRELAUNCH_QA.namespace ||
    report.inputFingerprintVersion !== 2 ||
    report.inputFingerprint !== expected.inputFingerprint ||
    report.orgId !== PRELAUNCH_QA.orgId ||
    report.spaceId !== PRELAUNCH_QA.testSpaceId ||
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs < 0 ||
    typeof report.recompute?.runId !== "string" ||
    report.recompute.status !== "completed"
  ) {
    throw new Error("The cold seed report does not contain valid completed QA recompute evidence.");
  }
  return {
    reportPath,
    durationMs,
    runId: report.recompute.runId,
  };
}

async function assertColdRunEvidence(sqlClient: postgres.Sql, runId: string) {
  const [run] = await sqlClient<
    {
      org_id: string;
      space_id: string | null;
      status: string;
      metadata_json: Record<string, unknown>;
    }[]
  >`
    SELECT org_id, space_id, status, metadata_json
    FROM match_runs
    WHERE id = ${runId}
    LIMIT 1
  `;
  if (
    !run ||
    run.org_id !== PRELAUNCH_QA.orgId ||
    run.space_id !== PRELAUNCH_QA.testSpaceId ||
    run.status !== "completed" ||
    run.metadata_json.embeddingsDegraded !== 0
  ) {
    throw new Error("The cold recompute run is not valid completed evidence in the current QA database.");
  }
}

function uniqueRecomputeRunId(matches: Array<{ runId?: string }>) {
  const runIds = new Set(matches.map((match) => match.runId).filter(Boolean));
  if (!matches.length || runIds.size !== 1) {
    throw new Error("QA recompute did not return one non-empty, uniquely identified matching run.");
  }
  return [...runIds][0]!;
}

async function main() {
  const options = parsePrelaunchQaCli(process.argv.slice(2));
  const developmentEnv = readScriptEnv("development");
  const productionEnv = readScriptEnv("production");
  const databaseUrl = selectedValue("DATABASE_URL", developmentEnv.values);
  const targetFingerprint = assertSafePrelaunchQaTarget({
    environment: options.environment,
    databaseUrl,
    configuredDevelopmentDatabaseUrl: developmentEnv.values.DATABASE_URL,
    productionDatabaseUrl: productionEnv.values.DATABASE_URL,
    vercelEnvironment: process.env.VERCEL_ENV,
    nodeEnvironment: process.env.NODE_ENV,
    clerkPublishableKey: selectedValue(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      developmentEnv.values,
    ),
    clerkSecretKey: selectedValue("CLERK_SECRET_KEY", developmentEnv.values),
  });
  if (!databaseUrl) {
    throw new Error("The development DATABASE_URL is not configured.");
  }
  loadApplicationEnvironment(developmentEnv.values);

  const { createDedicatedSqlClient } = await import("@/db/client");
  const sqlClient = createDedicatedSqlClient();
  const db = createPrelaunchQaDatabase(sqlClient);
  try {
    const preflight = await runPrelaunchQaPreflight(sqlClient);

    if (options.command === "cleanup") {
      const { withSpaceRecomputeLock } = await import("@/server/space-recompute-lock");
      const cleanup = await withSpaceRecomputeLock(PRELAUNCH_QA.testSpaceId, () =>
        cleanupPrelaunchQa(db),
      );
      console.info(
        JSON.stringify(
          {
            command: options.command,
            target: targetFingerprint,
            namespace: PRELAUNCH_QA.namespace,
            cleanup,
          },
          null,
          2,
        ),
      );
      return;
    }

    const input = readPrelaunchQaInputFile(options.inputPath!);
    assertPrelaunchQaCommandMatchesInput(options, input);
    const inputFingerprint = prelaunchQaInputFingerprint(input);
    const adminUsers = await discoverPrelaunchQaAdminUsers(db, options.adminUserId!);
    const rows = buildPrelaunchQaRows(input, adminUsers);
    const namespace = await inspectPrelaunchQaNamespace(db, rows);
    const summary = {
      command: options.command,
      target: targetFingerprint,
      namespace: PRELAUNCH_QA.namespace,
      inputVersion: input.version,
      dataPolicy:
        input.version === 2 ? input.dataPolicy : "deidentified_qa_only",
      org: PRELAUNCH_QA.orgSlug,
      testSpace: PRELAUNCH_QA.testSpaceSlug,
      participants: input.people.filter((person) => person.kind === "person").length,
      mentors: input.people.filter((person) => person.kind === "mentor").length,
      adminUsers: adminUsers.length,
      records: {
        users: rows.users.length,
        memberships: rows.memberships.length,
        profiles: rows.profiles.length,
        spaces: rows.spaces.length,
        spaceMemberships: rows.spaceMemberships.length,
        spaceIntents: rows.spaceIntents.length,
        matchTypeConfigs: rows.matchTypeConfigs.length,
      },
      preflight,
      namespaceInspection: namespace,
    };

    if (options.command === "dry-run") {
      console.info(JSON.stringify({ ...summary, writesApplied: false }, null, 2));
      return;
    }

    if (options.command === "evaluate") {
      const { withSpaceRecomputeLock } = await import("@/server/space-recompute-lock");
      await withSpaceRecomputeLock(PRELAUNCH_QA.testSpaceId, async () => {
        const labels = readPrelaunchQaLabelsFile(options.labelsPath!);
        const cold = readColdRecomputeEvidence({
          target: targetFingerprint,
          inputFingerprint,
        });
        await assertColdRunEvidence(sqlClient, cold.runId);
        const { recomputeMatchesForSpace } = await import("@/server/store");
        const firstRecomputeStartedAt = Date.now();
        const firstRecomputedMatches = await recomputeMatchesForSpace(PRELAUNCH_QA.testSpaceId);
        const firstWarmDurationMs = Date.now() - firstRecomputeStartedAt;
        const firstRunId = uniqueRecomputeRunId(firstRecomputedMatches);
        const firstSnapshot = await capturePrelaunchQaDatabaseSnapshot(
          sqlClient,
          input,
          firstRunId,
        );
        const secondRecomputeStartedAt = Date.now();
        const secondRecomputedMatches = await recomputeMatchesForSpace(PRELAUNCH_QA.testSpaceId);
        const secondWarmDurationMs = Date.now() - secondRecomputeStartedAt;
        const secondRunId = uniqueRecomputeRunId(secondRecomputedMatches);
        const secondSnapshot = await capturePrelaunchQaDatabaseSnapshot(
          sqlClient,
          input,
          secondRunId,
        );
        const evaluationInput = assemblePrelaunchQaEvaluationInput(input, labels, [
          firstSnapshot,
          secondSnapshot,
        ]);
        const evaluation = evaluatePersistedPrelaunchQa(evaluationInput);
        const warmDurationMs = Math.max(firstWarmDurationMs, secondWarmDurationMs);
        const timing = {
          coldDurationMs: cold.durationMs,
          coldLimitMs: 180_000,
          coldPassed: cold.durationMs <= 180_000,
          warmDurationMs,
          warmRunsMs: [firstWarmDurationMs, secondWarmDurationMs],
          warmLimitMs: 30_000,
          warmPassed: warmDurationMs <= 30_000,
        };
        const overallPassed =
          evaluation.overallPassed && timing.coldPassed && timing.warmPassed;
        const reportPath = "/tmp/wavesparks-prelaunch-report.json";
        writePrivateJson(reportPath, {
          version: 1,
          generatedAt: new Date().toISOString(),
          target: targetFingerprint,
          namespace: PRELAUNCH_QA.namespace,
          inputFingerprintVersion: 2,
          inputFingerprint,
          preflight,
          namespaceInspection: namespace,
          runs: {
            cold: cold.runId,
            first: firstSnapshot.run.id,
            second: secondSnapshot.run.id,
            recomputedMatches: [firstRecomputedMatches.length, secondRecomputedMatches.length],
          },
          timing,
          evaluation,
          overallPassed,
        });
        console.info(
          JSON.stringify(
            {
              ...summary,
              writesApplied: true,
              reportPath,
              overallPassed,
              timing,
              evaluation: {
                coverage: evaluation.coverage,
                holdout: evaluation.holdout,
                leakage: evaluation.leakage,
                duplicates: evaluation.duplicates,
                determinism: evaluation.determinism,
                embeddingGate: evaluation.embeddingGate,
                latestRunGate: evaluation.latestRunGate,
                knownMismatchCount: evaluation.knownMismatches.length,
              },
            },
            null,
            2,
          ),
        );
        if (!overallPassed) {
          throw new Error(`Prelaunch QA evaluation gates failed; inspect ${reportPath}.`);
        }
      });
      return;
    }

    const { withSpaceRecomputeLock } = await import("@/server/space-recompute-lock");
    await withSpaceRecomputeLock(PRELAUNCH_QA.testSpaceId, async () => {
      const seed = await seedPrelaunchQa(db, rows);
      const recomputeStartedAt = Date.now();
      try {
        const { recomputeMatchesForSpace } = await import("@/server/store");
        const recomputedMatches = await recomputeMatchesForSpace(PRELAUNCH_QA.testSpaceId);
        const recomputeDurationMs = Date.now() - recomputeStartedAt;
        const recomputeRunId = uniqueRecomputeRunId(recomputedMatches);
        const [latestRun] = await sqlClient<
          {
            id: string;
            status: string;
            metadata_json: Record<string, unknown>;
          }[]
        >`
          SELECT id, status, metadata_json
          FROM match_runs
          WHERE id = ${recomputeRunId}
          LIMIT 1
        `;
        const recompute = {
          durationMs: recomputeDurationMs,
          withinColdLimit: recomputeDurationMs <= 180_000,
          matches: recomputedMatches.length,
          runId: latestRun?.id,
          status: latestRun?.status,
          metadata: latestRun?.metadata_json,
        };
        const embeddingsRefreshed =
          Number(latestRun?.metadata_json.profileEmbeddingsRefreshed ?? 0) > 0 ||
          Number(latestRun?.metadata_json.intentEmbeddingsRefreshed ?? 0) > 0;
        const seedReportPath = seed.matchingInputsChanged || embeddingsRefreshed
          ? "/tmp/wavesparks-prelaunch-seed-report.json"
          : "/tmp/wavesparks-prelaunch-idempotency-report.json";
        writePrivateJson(seedReportPath, {
          generatedAt: new Date().toISOString(),
          target: targetFingerprint,
          namespace: PRELAUNCH_QA.namespace,
          inputFingerprintVersion: 2,
          inputFingerprint,
          orgId: PRELAUNCH_QA.orgId,
          spaceId: PRELAUNCH_QA.testSpaceId,
          seed,
          recompute,
        });
        console.info(
          JSON.stringify(
            {
              ...summary,
              writesApplied: true,
              seed,
              recompute,
              seedReportPath,
            },
            null,
            2,
          ),
        );
      } catch (error) {
        const failureReportPath = "/tmp/wavesparks-prelaunch-incomplete-report.json";
        writePrivateJson(failureReportPath, {
          generatedAt: new Date().toISOString(),
          target: targetFingerprint,
          namespace: PRELAUNCH_QA.namespace,
          inputFingerprintVersion: 2,
          inputFingerprint,
          orgId: PRELAUNCH_QA.orgId,
          spaceId: PRELAUNCH_QA.testSpaceId,
          seed,
          recompute: {
            status: "failed",
            durationMs: Date.now() - recomputeStartedAt,
          },
        });
        throw error;
      }
    });
  } finally {
    await sqlClient.end();
  }
}

if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Prelaunch QA failed.");
    process.exit(1);
  });
}

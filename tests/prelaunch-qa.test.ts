import {
  chmodSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PRELAUNCH_QA,
  assertCleanupAuthorization,
  assertSafePrelaunchQaTarget,
  buildPrelaunchQaRows,
  evaluatePrelaunchQa,
  evaluatePrelaunchQaIntegrityRows,
  parsePrelaunchQaInput,
  prelaunchQaIntentConflictUpdate,
  prelaunchQaIntentSeedFingerprint,
  prelaunchQaProfileConflictUpdate,
  prelaunchQaProfileSeedFingerprint,
  readPrelaunchQaInputFile,
} from "../scripts/prelaunch-qa-core";
import { parsePrelaunchQaCli } from "../scripts/prelaunch-qa";

const temporaryDirectories: string[] = [];

function qaIdentity(kind: "person" | "mentor", index: number) {
  const position = String(index).padStart(2, "0");
  return kind === "person"
    ? {
        sourceId: `qa-participant-${position}`,
        fullName: `QA Participant ${position}`,
        email: `qa.participant.${position}@prelaunch-qa.invalid`,
      }
    : {
        sourceId: `qa-mentor-${position}`,
        fullName: `QA Mentor ${position}`,
        email: `qa.mentor.${position}@prelaunch-qa.invalid`,
      };
}

function baseQaPerson(kind: "person" | "mentor", index: number) {
  return {
    ...qaIdentity(kind, index),
    kind,
    headline: kind === "mentor" ? "Operator supporting early teams" : "Founder testing a new idea",
    bio: "De-identified background focused on product discovery and responsible growth.",
    problemInterest: "Improving access to practical tools for underserved communities.",
    currentFocus: "Validating demand and turning user interviews into a focused product plan.",
    stage: "mvp",
    industryTags: ["education", "software"],
    problemSpaceTags: ["access", "workflow"],
    skillTags: kind === "mentor" ? ["strategy", "fundraising"] : ["research", "product"],
    topStrengths: kind === "mentor" ? ["coaching", "go to market"] : ["discovery", "execution"],
    helpNeededTags: kind === "mentor" ? ["community"] : ["strategy", "fundraising"],
    idealMatchDescription: "A practical counterpart with relevant experience and direct feedback.",
    currentGoal: "Choose the strongest next milestone and reduce execution risk.",
    lookingFor: kind === "mentor" ? ["founders"] : ["mentor", "strategy"],
    offers: kind === "mentor" ? ["strategy", "fundraising"] : ["research", "product"],
  };
}

function validInputValue() {
  const participants = Array.from({ length: 50 }, (_, index) => ({
    ...baseQaPerson("person", index + 1),
    kind: "person" as const,
  }));
  const mentors = Array.from({ length: 10 }, (_, index) => ({
    ...baseQaPerson("mentor", index + 1),
    kind: "mentor" as const,
    mentorExpertiseTags: ["strategy", "fundraising"],
    mentorFunctionalStrengths: ["go to market", "coaching"],
    mentorStageExperience: ["idea", "mvp", "early traction"],
    mentorOffers: ["office hours", "milestone review"],
    mentorshipPreferences: "Weekly, goal-oriented sessions with clear preparation and follow-up.",
    mentorAvailability: "weekly",
    maxMentees: 4,
  }));
  return {
    version: 1 as const,
    generatedAt: "2026-07-15T00:00:00.000Z",
    people: [...participants, ...mentors],
    labels: { source: "de-identified-airtable-export" },
  };
}

function makeTmpDirectory() {
  const directory = mkdtempSync("/tmp/wavesparks-prelaunch-qa-test-");
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (temporaryDirectories.length) {
    rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
  }
});

describe("prelaunch QA input boundary", () => {
  it("accepts exactly 50 fixed QA participants and 10 fixed QA mentors", () => {
    const parsed = parsePrelaunchQaInput(validInputValue());

    expect(parsed.people.filter((person) => person.kind === "person")).toHaveLength(50);
    expect(parsed.people.filter((person) => person.kind === "mentor")).toHaveLength(10);
  });

  it("rejects real-looking identities, contact data, and unexpected fields", () => {
    const realName = validInputValue();
    realName.people[0].fullName = "Alice Example";
    expect(() => parsePrelaunchQaInput(realName)).toThrow(/fixed QA name/);

    const contact = validInputValue();
    contact.people[0].bio = "Reach the participant at https://example.com for details.";
    expect(() => parsePrelaunchQaInput(contact)).toThrow(/contains a URL/);

    const company = validInputValue();
    company.people[0].bio = "Previously worked at Example Pte Ltd on product discovery.";
    expect(() => parsePrelaunchQaInput(company)).toThrow(/company legal identifier/);

    const extraField = validInputValue() as ReturnType<typeof validInputValue> & {
      profilePhoto?: string;
    };
    extraField.profilePhoto = "https://example.com/photo.jpg";
    expect(() => parsePrelaunchQaInput(extraField)).toThrow(/Unrecognized key/);
  });

  it("requires a regular 0600 file below /tmp and rejects symlinks", () => {
    const directory = makeTmpDirectory();
    const inputPath = path.join(directory, "qa.json");
    writeFileSync(inputPath, JSON.stringify(validInputValue()), { mode: 0o600 });

    expect(readPrelaunchQaInputFile(inputPath).people).toHaveLength(60);

    chmodSync(inputPath, 0o644);
    expect(() => readPrelaunchQaInputFile(inputPath)).toThrow(/exactly 0600/);
    chmodSync(inputPath, 0o600);

    const linkPath = path.join(directory, "qa-link.json");
    symlinkSync(inputPath, linkPath);
    expect(() => readPrelaunchQaInputFile(linkPath)).toThrow(/not a symlink/);
  });
});

describe("prelaunch QA deterministic rows", () => {
  it("builds stable, matching-ready rows without Clerk or real contact data", () => {
    const input = parsePrelaunchQaInput(validInputValue());
    const rows = buildPrelaunchQaRows(input, [{ id: "usr_existing_admin" }]);
    const reordered = parsePrelaunchQaInput({
      ...validInputValue(),
      people: [...validInputValue().people].reverse(),
    });
    const reorderedRows = buildPrelaunchQaRows(reordered, [{ id: "usr_existing_admin" }]);

    expect(rows.users).toHaveLength(60);
    expect(rows.profiles).toHaveLength(60);
    expect(rows.spaceIntents).toHaveLength(60);
    expect(rows.spaceMemberships).toHaveLength(60);
    expect(rows.spaces.map((space) => space.slug)).toEqual(["main", "test-space"]);
    expect(rows.spaces[1].name).toBe("Airtable 50+10 Stability Test");
    expect(rows.users.map((user) => user.id)).toEqual(reorderedRows.users.map((user) => user.id));
    expect(rows.users.every((user) => user.email.endsWith("@prelaunch-qa.invalid"))).toBe(true);
    expect(rows.users.every((user) => !user.clerkUserId && user.imageUrl === "")).toBe(true);
    expect(rows.profiles.every((profile) => profile.profilePhoto === "")).toBe(true);

    const participantProfile = rows.profiles.find(
      (profile) => profile.fullName === "QA Participant 01",
    );
    const mentorProfile = rows.profiles.find((profile) => profile.fullName === "QA Mentor 01");
    expect(participantProfile).toMatchObject({
      seekingMatchTypes: ["mentor_match"],
      offeringMatchTypes: [],
      onboardingComplete: true,
    });
    expect(mentorProfile).toMatchObject({
      seekingMatchTypes: [],
      offeringMatchTypes: ["mentor_match"],
      onboardingComplete: true,
    });
  });

  it("ignores runtime embeddings and timestamps but detects matching-input changes", () => {
    const input = parsePrelaunchQaInput(validInputValue());
    const rows = buildPrelaunchQaRows(input, [{ id: "usr_existing_admin" }]);
    const profile = rows.profiles[0];
    const intent = rows.spaceIntents[0];
    const hydratedProfile = {
      ...profile,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-16T00:00:00.000Z"),
      lastActiveAt: new Date("2026-07-16T00:00:00.000Z"),
      seekingEmbeddingText: "runtime-derived profile seeking text",
      offeringEmbeddingText: "runtime-derived profile offering text",
      seekingEmbedding: [0.25, 0.75],
      offeringEmbedding: [0.5, 0.5],
      embeddingModel: "text-embedding-3-large",
      embeddingSourceHash: "runtime-hash",
      embeddingStatus: "ready",
      embeddingUpdatedAt: new Date("2026-07-16T00:00:00.000Z"),
    };
    const hydratedIntent = {
      ...intent,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-16T00:00:00.000Z"),
      seekingText: "runtime-derived intent seeking text",
      offeringText: "runtime-derived intent offering text",
      seekingEmbedding: [0.25, 0.75],
      offeringEmbedding: [0.5, 0.5],
      embeddingModel: "text-embedding-3-large",
      embeddingSourceHash: "runtime-hash",
      embeddingStatus: "ready",
      embeddingUpdatedAt: new Date("2026-07-16T00:00:00.000Z"),
    };

    expect(prelaunchQaProfileSeedFingerprint(hydratedProfile)).toBe(
      prelaunchQaProfileSeedFingerprint(profile),
    );
    expect(prelaunchQaIntentSeedFingerprint(hydratedIntent)).toBe(
      prelaunchQaIntentSeedFingerprint(intent),
    );
    expect(
      prelaunchQaProfileSeedFingerprint({
        ...profile,
        skillTags: [...profile.skillTags, "new matching signal"],
      }),
    ).not.toBe(prelaunchQaProfileSeedFingerprint(profile));
    expect(
      prelaunchQaIntentSeedFingerprint({
        ...intent,
        lookingFor: [...(intent.lookingFor ?? []), "new intent"],
      }),
    ).not.toBe(prelaunchQaIntentSeedFingerprint(intent));

    const unchangedProfileUpdate = prelaunchQaProfileConflictUpdate(profile, false);
    const unchangedIntentUpdate = prelaunchQaIntentConflictUpdate(intent, false);
    expect(unchangedProfileUpdate).not.toHaveProperty("createdAt");
    expect(unchangedProfileUpdate).not.toHaveProperty("updatedAt");
    expect(unchangedProfileUpdate).not.toHaveProperty("lastActiveAt");
    expect(unchangedProfileUpdate).not.toHaveProperty("seekingEmbeddingText");
    expect(unchangedProfileUpdate).not.toHaveProperty("seekingEmbedding");
    expect(unchangedIntentUpdate).not.toHaveProperty("createdAt");
    expect(unchangedIntentUpdate).not.toHaveProperty("updatedAt");
    expect(unchangedIntentUpdate).not.toHaveProperty("seekingText");
    expect(unchangedIntentUpdate).not.toHaveProperty("seekingEmbedding");
    expect(prelaunchQaProfileConflictUpdate(profile, true)).toMatchObject({
      embeddingStatus: "pending",
      seekingEmbedding: null,
      updatedAt: profile.updatedAt,
    });
    expect(prelaunchQaIntentConflictUpdate(intent, true)).toMatchObject({
      embeddingStatus: "pending",
      seekingEmbedding: null,
      updatedAt: intent.updatedAt,
    });
  });
});

describe("prelaunch QA target and command safety", () => {
  const developmentDatabase =
    "postgresql://qa:secret@ep-development.example.neon.tech/wavespark_dev?sslmode=require";
  const productionDatabase =
    "postgresql://prod:secret@ep-production.example.neon.tech/neondb?sslmode=require";

  it("accepts only the isolated remote development database", () => {
    expect(
      assertSafePrelaunchQaTarget({
        environment: "development",
        databaseUrl: developmentDatabase,
        configuredDevelopmentDatabaseUrl: developmentDatabase,
        productionDatabaseUrl: productionDatabase,
        clerkPublishableKey: "pk_test_example",
        clerkSecretKey: "sk_test_example",
      }),
    ).toBe("ep-development.example.neon.tech:5432/wavespark_dev");

    expect(() =>
      assertSafePrelaunchQaTarget({
        environment: "production",
        databaseUrl: developmentDatabase,
      }),
    ).toThrow(/development-only/);
    expect(() =>
      assertSafePrelaunchQaTarget({
        environment: "development",
        databaseUrl: productionDatabase,
      }),
    ).toThrow(/requires database wavespark_dev/);
    expect(() =>
      assertSafePrelaunchQaTarget({
        environment: "development",
        databaseUrl: developmentDatabase,
        configuredDevelopmentDatabaseUrl:
          "postgresql://qa:secret@ep-other.example.neon.tech/wavespark_dev",
        productionDatabaseUrl: productionDatabase,
        clerkPublishableKey: "pk_test_example",
        clerkSecretKey: "sk_test_example",
      }),
    ).toThrow(/configured development fingerprint/);
    expect(() =>
      assertSafePrelaunchQaTarget({
        environment: "development",
        databaseUrl: developmentDatabase,
        configuredDevelopmentDatabaseUrl: developmentDatabase,
        productionDatabaseUrl: developmentDatabase,
        clerkPublishableKey: "pk_test_example",
        clerkSecretKey: "sk_test_example",
      }),
    ).toThrow(/production database fingerprint/);
    expect(() =>
      assertSafePrelaunchQaTarget({
        environment: "development",
        databaseUrl: developmentDatabase,
        configuredDevelopmentDatabaseUrl: developmentDatabase,
        productionDatabaseUrl: productionDatabase,
        clerkPublishableKey: "pk_test_example",
        clerkSecretKey: "sk_live_do_not_use",
      }),
    ).toThrow(/Clerk test secret/);
    expect(() =>
      assertSafePrelaunchQaTarget({
        environment: "development",
        databaseUrl: developmentDatabase,
        productionDatabaseUrl: productionDatabase,
        clerkPublishableKey: "pk_test_example",
        clerkSecretKey: "sk_test_example",
      }),
    ).toThrow(/configured development database fingerprint/);
    expect(() =>
      assertSafePrelaunchQaTarget({
        environment: "development",
        databaseUrl: developmentDatabase,
        configuredDevelopmentDatabaseUrl: developmentDatabase,
        clerkPublishableKey: "pk_test_example",
        clerkSecretKey: "sk_test_example",
      }),
    ).toThrow(/production database fingerprint/);
    expect(() =>
      assertSafePrelaunchQaTarget({
        environment: "development",
        databaseUrl: developmentDatabase,
        nodeEnvironment: "production",
      }),
    ).toThrow(/NODE_ENV=production/);
  });

  it("requires explicit write authorization and the fixed cleanup phrase", () => {
    expect(() =>
      parsePrelaunchQaCli([
        "seed",
        "--environment=development",
        "--input=/tmp/qa.json",
        "--admin-user-id=usr_existing_admin",
        `--confirm-deidentified=${PRELAUNCH_QA.deidentificationConfirmation}`,
      ]),
    ).toThrow(/requires --apply/);
    expect(() =>
      parsePrelaunchQaCli([
        "seed",
        "--environment=development",
        "--input=/tmp/qa.json",
        "--admin-user-id=usr_existing_admin",
        "--apply",
      ]),
    ).toThrow(PRELAUNCH_QA.deidentificationConfirmation);
    expect(
      parsePrelaunchQaCli([
        "seed",
        "--environment=development",
        "--input=/tmp/qa.json",
        "--admin-user-id=usr_existing_admin",
        "--apply",
        `--confirm-deidentified=${PRELAUNCH_QA.deidentificationConfirmation}`,
      ]),
    ).toMatchObject({ command: "seed", adminUserId: "usr_existing_admin", apply: true });
    expect(() =>
      parsePrelaunchQaCli([
        "evaluate",
        "--environment=development",
        "--input=/tmp/qa.json",
        "--admin-user-id=usr_existing_admin",
        "--apply",
        `--confirm-deidentified=${PRELAUNCH_QA.deidentificationConfirmation}`,
      ]),
    ).toThrow(/requires --labels/);
    expect(
      parsePrelaunchQaCli([
        "evaluate",
        "--environment=development",
        "--input=/tmp/qa.json",
        "--labels=/tmp/labels.json",
        "--admin-user-id=usr_existing_admin",
        "--apply",
        `--confirm-deidentified=${PRELAUNCH_QA.deidentificationConfirmation}`,
      ]),
    ).toMatchObject({
      command: "evaluate",
      labelsPath: "/tmp/labels.json",
      adminUserId: "usr_existing_admin",
      apply: true,
    });
    expect(() =>
      parsePrelaunchQaCli([
        "cleanup",
        "--environment=development",
        "--apply",
        "--confirm=almost",
      ]),
    ).toThrow(PRELAUNCH_QA.cleanupConfirmation);
    expect(() => assertCleanupAuthorization(true, PRELAUNCH_QA.cleanupConfirmation)).not.toThrow();
  });
});

describe("prelaunch QA preflight and evaluator contracts", () => {
  it("fails preflight evaluation on duplicate profiles or orphan rows", () => {
    expect(() =>
      evaluatePrelaunchQaIntegrityRows([
        { check: "duplicate_profiles", count: "1" },
        { check: "orphan_profiles", count: "0" },
      ]),
    ).toThrow(/duplicate_profiles=1/);
    expect(
      evaluatePrelaunchQaIntegrityRows([
        { check: "duplicate_profiles", count: "0" },
        { check: "orphan_profiles", count: "0" },
      ]),
    ).toEqual({ duplicate_profiles: 0, orphan_profiles: 0 });
  });

  it("leaves evaluation behind a narrow adapter interface", async () => {
    const evaluate = vi.fn().mockResolvedValue({
      generatedMatchCount: 120,
      evaluatedPairs: 500,
      notes: [],
    });

    await expect(evaluatePrelaunchQa({ evaluate })).resolves.toMatchObject({
      generatedMatchCount: 120,
    });
    expect(evaluate).toHaveBeenCalledWith({
      orgId: PRELAUNCH_QA.orgId,
      spaceId: PRELAUNCH_QA.testSpaceId,
      expectedParticipants: 50,
      expectedMentors: 10,
    });
  });
});

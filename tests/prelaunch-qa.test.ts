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
  validatePrelaunchQaMembershipNamespace,
} from "../scripts/prelaunch-qa-core";
import {
  assertPrelaunchQaCommandMatchesInput,
  parsePrelaunchQaCli,
  prelaunchQaInputFingerprint,
} from "../scripts/prelaunch-qa";

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

function publicMatchTypes(kind: "person" | "mentor", index: number) {
  if (kind === "mentor") {
    return {
      seekingMatchTypes: [] as Array<
        "cofounder_match" | "mentor_match" | "collaborator_match"
      >,
      offeringMatchTypes: ["mentor_match"] as Array<
        "cofounder_match" | "mentor_match" | "collaborator_match"
      >,
    };
  }
  const mutualTypes =
    index <= 15
      ? (["cofounder_match"] as const)
      : index <= 35
        ? (["collaborator_match"] as const)
        : (["cofounder_match", "collaborator_match"] as const);
  return {
    seekingMatchTypes: ["mentor_match", ...mutualTypes] as Array<
      "cofounder_match" | "mentor_match" | "collaborator_match"
    >,
    offeringMatchTypes: [...mutualTypes] as Array<
      "cofounder_match" | "mentor_match" | "collaborator_match"
    >,
  };
}

function publicProfileFields(kind: "person" | "mentor", index: number) {
  const matchTypes = publicMatchTypes(kind, index);
  return {
    preferredName: kind === "mentor" ? `Mentor ${index}` : `Participant ${index}`,
    displayNamePreference: "preferred_name" as const,
    shortBio: "Public professional background in product discovery and responsible growth.",
    longBio:
      "Public professional background spanning research, product discovery, community programs, and responsible growth.",
    technicalExperienceLevel: kind === "mentor" ? "advanced" : "intermediate",
    technicalExperience:
      "Built and evaluated digital services with cross-functional product and engineering teams.",
    city: "Singapore",
    country: "SG",
    timezone: "Asia/Singapore",
    schoolOrCompany: "Northstar Labs Pte Ltd",
    currentStatus: kind === "mentor" ? "mentor and operator" : "founder",
    startupName: kind === "mentor" ? "" : `Open Venture ${index}`,
    startupOneLiner: "Practical workflow tools for community organizations.",
    startupDescription:
      "A public project description focused on making essential services easier to access.",
    businessModelTags: ["B2B", "subscription"],
    currentProgress: "Completed discovery interviews and shipped an early working prototype.",
    tractionSummary: "Piloted the workflow with several community teams.",
    regionFocus: "Southeast Asia",
    lookingForTypes: matchTypes.seekingMatchTypes.map((value) => value.replace("_match", "")),
    ...matchTypes,
    desiredRoles: kind === "mentor" ? ["founders"] : ["product leader", "engineer", "mentor"],
    canContribute:
      kind === "mentor"
        ? ["strategy", "fundraising", "leadership coaching"]
        : ["user research", "product discovery", "community design"],
    yearsOfExperience: kind === "mentor" ? 14 : 6,
    priorProjects:
      "Led public-interest product and community initiatives across the region from 2019 through 2024.",
    notableWins: "Launched a service used by multiple partner organizations.",
    timeCommitment: kind === "mentor" ? "mentor only" : "part time serious",
    availabilityStart: "now",
    remotePreference: "hybrid",
    preferredGeographies: ["Singapore", "Southeast Asia", "remote"],
    meetingFrequencyPreference: "weekly",
    ambitionLevel: 4,
    riskTolerance: 3,
    speedPreference: "balanced",
    decisionStyle: "evidence informed",
    workStyle: "operator",
    communicationStyle: "direct and asynchronous",
    conflictStyle: "constructive",
    commitmentHorizon: "long term",
    missionVsMarketOrientation: "balanced",
    structureVsChaos: 4,
    mentorExpertiseTags: kind === "mentor" ? ["strategy", "fundraising"] : [],
    mentorFunctionalStrengths: kind === "mentor" ? ["go to market", "coaching"] : [],
    mentorStageExperience: kind === "mentor" ? ["idea", "mvp", "early traction"] : [],
    mentorOffers: kind === "mentor" ? ["office hours", "milestone review"] : [],
    mentorshipPreferences:
      kind === "mentor"
        ? "Weekly, goal-oriented sessions with clear preparation and follow-up."
        : "",
    mentorAvailability: kind === "mentor" ? "weekly" : "",
    maxMentees: kind === "mentor" ? 4 : null,
  };
}

function validV2InputValue() {
  const participants = Array.from({ length: 50 }, (_, index) => ({
    ...baseQaPerson("person", index + 1),
    ...publicProfileFields("person", index + 1),
    fullName: `Public Participant ${String(index + 1).padStart(2, "0")}`,
    kind: "person" as const,
  }));
  const mentors = Array.from({ length: 10 }, (_, index) => ({
    ...baseQaPerson("mentor", index + 1),
    ...publicProfileFields("mentor", index + 1),
    fullName: `Public Mentor ${String(index + 1).padStart(2, "0")}`,
    kind: "mentor" as const,
  }));
  return {
    version: 2 as const,
    dataPolicy: "public_airtable_profile_data" as const,
    generatedAt: "2026-07-15T00:00:00.000Z",
    people: [...participants, ...mentors],
    labels: { source: "public-airtable-profile-data" },
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
  it("fingerprints semantic input independently of metadata, person order, and key order", () => {
    const original = validV2InputValue();
    const metadataOnly = {
      labels: { review: "new non-matching note" },
      people: [...original.people]
        .reverse()
        .map((person) => Object.fromEntries(Object.entries(person).reverse())),
      generatedAt: "2026-07-16T09:30:00.000Z",
      dataPolicy: original.dataPolicy,
      version: original.version,
    };
    expect(prelaunchQaInputFingerprint(metadataOnly)).toBe(
      prelaunchQaInputFingerprint(original),
    );

    const matchingChange = structuredClone(original);
    matchingChange.people[0].skillTags = [...matchingChange.people[0].skillTags, "new-signal"];
    expect(prelaunchQaInputFingerprint(matchingChange)).not.toBe(
      prelaunchQaInputFingerprint(original),
    );
  });

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

  it("accepts v2 public Airtable names, companies, experience, and explicit match intent", () => {
    const parsed = parsePrelaunchQaInput(validV2InputValue());
    const first = parsed.people[0];

    expect(parsed).toMatchObject({
      version: 2,
      dataPolicy: "public_airtable_profile_data",
    });
    expect(first).toMatchObject({
      fullName: "Public Participant 01",
      schoolOrCompany: "Northstar Labs Pte Ltd",
      seekingMatchTypes: ["mentor_match", "cofounder_match"],
      offeringMatchTypes: ["cofounder_match"],
    });
  });

  it("keeps Airtable-absent preference signals explicitly unknown in v2", () => {
    const input = validV2InputValue();
    const person = input.people[0];
    person.timeCommitment = "";
    person.availabilityStart = "";
    person.remotePreference = "";
    person.meetingFrequencyPreference = "";
    person.speedPreference = "";
    person.decisionStyle = "";
    person.workStyle = "";
    person.communicationStyle = "";
    person.conflictStyle = "";
    person.commitmentHorizon = "";
    person.missionVsMarketOrientation = "";
    person.ambitionLevel = 0;
    person.riskTolerance = 0;
    person.structureVsChaos = 0;

    const parsed = parsePrelaunchQaInput(input);
    const rows = buildPrelaunchQaRows(parsed, [{ id: "usr_existing_admin" }]);
    expect(rows.profiles.find((profile) => profile.fullName === person.fullName)).toMatchObject({
      timeCommitment: "",
      availabilityStart: "",
      remotePreference: "",
      meetingFrequencyPreference: "",
      speedPreference: "",
      decisionStyle: "",
      workStyle: "",
      communicationStyle: "",
      conflictStyle: "",
      commitmentHorizon: "",
      missionVsMarketOrientation: "",
      ambitionLevel: 0,
      riskTolerance: 0,
      structureVsChaos: 0,
    });
  });

  it("keeps v2 contact data out and requires the fixed public-data policy and .invalid email", () => {
    const wrongPolicy = {
      ...validV2InputValue(),
      dataPolicy: "private_airtable_export",
    };
    expect(() => parsePrelaunchQaInput(wrongPolicy)).toThrow(/dataPolicy/);

    const wrongEmail = validV2InputValue();
    wrongEmail.people[0].email = "public.person@example.com";
    expect(() => parsePrelaunchQaInput(wrongEmail)).toThrow(/fixed .invalid email/);

    for (const contactValue of [
      "Read more at https://example.com/profile",
      "Email public.person@example.com",
      "Call +65 9123 4567",
      "LinkedIn: public-person",
      "Follow @public_person",
    ]) {
      const contact = validV2InputValue();
      contact.people[0].technicalExperience = contactValue;
      expect(() => parsePrelaunchQaInput(contact)).toThrow(
        /URL, email, phone number, or social account/,
      );
    }
  });

  it("requires bidirectional opt-in for mutual v2 matching types", () => {
    const oneSided = validV2InputValue();
    oneSided.people[0].offeringMatchTypes = [];

    expect(() => parsePrelaunchQaInput(oneSided)).toThrow(
      /must both seek and offer cofounder_match because it is mutual/,
    );
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
    expect(
      rows.memberships.filter(
        (membership) =>
          membership.affiliationType === "mentor" &&
          membership.mentorStatus === "approved" &&
          membership.mentorReviewedAt instanceof Date,
      ),
    ).toHaveLength(10);

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

  it("maps the complete v2 public profile contract and enables all three match types", () => {
    const input = parsePrelaunchQaInput(validV2InputValue());
    const rows = buildPrelaunchQaRows(input, [{ id: "usr_existing_admin" }]);
    const participantProfile = rows.profiles.find(
      (profile) => profile.fullName === "Public Participant 01",
    );
    const mentorProfile = rows.profiles.find((profile) => profile.fullName === "Public Mentor 01");

    expect(participantProfile).toMatchObject({
      preferredName: "Participant 1",
      displayNamePreference: "preferred_name",
      technicalExperienceLevel: "intermediate",
      schoolOrCompany: "Northstar Labs Pte Ltd",
      startupName: "Open Venture 1",
      businessModelTags: ["B2B", "subscription"],
      seekingMatchTypes: ["mentor_match", "cofounder_match"],
      offeringMatchTypes: ["cofounder_match"],
      desiredRoles: ["product leader", "engineer", "mentor"],
      canContribute: ["user research", "product discovery", "community design"],
      yearsOfExperience: 6,
      timeCommitment: "part time serious",
      workStyle: "operator",
      profilePhoto: "",
      publicContactEnabled: false,
      emailForIntro: "qa.participant.01@prelaunch-qa.invalid",
    });
    expect(mentorProfile).toMatchObject({
      seekingMatchTypes: [],
      offeringMatchTypes: ["mentor_match"],
      mentorExpertiseTags: ["strategy", "fundraising"],
      mentorStageExperience: ["idea", "mvp", "early traction"],
      mentorAvailability: "weekly",
      maxMentees: 4,
    });
    expect(
      rows.profiles.filter((profile) => profile.seekingMatchTypes.includes("mentor_match")),
    ).toHaveLength(50);
    expect(
      rows.profiles.filter(
        (profile) =>
          profile.seekingMatchTypes.includes("cofounder_match") &&
          profile.offeringMatchTypes.includes("cofounder_match"),
      ),
    ).toHaveLength(30);
    expect(
      rows.profiles.filter(
        (profile) =>
          profile.seekingMatchTypes.includes("collaborator_match") &&
          profile.offeringMatchTypes.includes("collaborator_match"),
      ),
    ).toHaveLength(35);
    expect(
      rows.profiles.filter((profile) => profile.offeringMatchTypes.includes("mentor_match")),
    ).toHaveLength(10);
    expect(
      Object.fromEntries(
        rows.matchTypeConfigs.map((config) => [
          config.slug,
          { minimumScore: config.minimumScore, weights: config.weightsJson },
        ]),
      ),
    ).toMatchObject({
      cofounder_match: { minimumScore: 35 },
      collaborator_match: { minimumScore: 35 },
      mentor_match: {
        minimumScore: 35,
        weights: {
          semantic: 50,
          skills: 10,
          venture: 10,
          availability: 10,
          work_style: 10,
          location: 10,
        },
      },
    });
    expect(rows.organization.description).toContain("Public Airtable profile data");
    expect(
      rows.memberships
        .filter((membership) => membership.role === "member")
        .every((membership) => membership.approvalNote?.includes("contact details and links excluded")),
    ).toBe(true);
  });

  it("preserves existing connected QA admins while rejecting extra members and synthetic Clerk state", () => {
    const input = parsePrelaunchQaInput(validV2InputValue());
    const rows = buildPrelaunchQaRows(input, [{ id: "usr_existing_e2e_admin" }]);
    const desiredAdmin = rows.memberships.find((membership) => membership.role === "org_admin")!;
    const syntheticMembership = rows.memberships.find(
      (membership) => membership.role === "member",
    )!;
    const toStoredMembership = (membership: (typeof rows.memberships)[number]) => ({
      id: membership.id,
      clerkMembershipId: membership.clerkMembershipId ?? null,
      clerkRole: membership.clerkRole ?? null,
      clerkInvitationId: membership.clerkInvitationId ?? null,
      clerkInvitationStatus: membership.clerkInvitationStatus ?? null,
      clerkInvitationError: membership.clerkInvitationError ?? null,
      clerkInvitationUpdatedAt: membership.clerkInvitationUpdatedAt
        ? new Date(membership.clerkInvitationUpdatedAt)
        : null,
      orgId: membership.orgId,
      userId: membership.userId,
      role: membership.role ?? "member",
      mentorStatus: membership.mentorStatus ?? "not_mentor",
      mentorReviewedAt: membership.mentorReviewedAt ?? null,
      mentorReviewedByMembershipId: membership.mentorReviewedByMembershipId ?? null,
      accountStatus: membership.accountStatus ?? "invited",
      affiliationType: membership.affiliationType,
      status: membership.status ?? "pending",
      archetypes: membership.archetypes,
      programName: membership.programName,
      cohortNameOrYear: membership.cohortNameOrYear,
      invitedByUserId: membership.invitedByUserId ?? null,
      approvalNote: membership.approvalNote ?? null,
      approvedAt: membership.approvedAt ? new Date(membership.approvedAt) : null,
      createdAt: new Date(membership.createdAt),
      updatedAt: new Date(membership.updatedAt),
    });
    const desiredAdminRow = toStoredMembership(desiredAdmin);
    const existingAdmin = {
      ...desiredAdminRow,
      id: "mem_existing_savion_admin",
      userId: "usr_existing_savion",
    };

    expect(() =>
      validatePrelaunchQaMembershipNamespace([desiredAdminRow, existingAdmin], rows),
    ).not.toThrow();
    expect(rows.memberships.some((membership) => membership.id === existingAdmin.id)).toBe(false);

    expect(() =>
      validatePrelaunchQaMembershipNamespace(
        [{ ...existingAdmin, id: "mem_unexpected_member", role: "member" }],
        rows,
      ),
    ).toThrow(/unexpected member/);

    expect(() =>
      validatePrelaunchQaMembershipNamespace(
        [
          {
            ...toStoredMembership(syntheticMembership),
            clerkMembershipId: "clerk_membership_conflict",
          },
        ],
        rows,
      ),
    ).toThrow(/synthetic membership has Clerk state/);
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

  it("keeps seed on v1 and requires refresh or matching evaluation confirmation for v2", () => {
    const seed = parsePrelaunchQaCli([
      "seed",
      "--environment=development",
      "--input=/tmp/qa.json",
      "--admin-user-id=usr_existing_admin",
      "--apply",
      `--confirm-deidentified=${PRELAUNCH_QA.deidentificationConfirmation}`,
    ]);
    expect(() => assertPrelaunchQaCommandMatchesInput(seed, { version: 1 })).not.toThrow();
    expect(() => assertPrelaunchQaCommandMatchesInput(seed, { version: 2 })).toThrow(
      /seed only accepts version 1/,
    );

    const refresh = parsePrelaunchQaCli([
      "refresh",
      "--environment=development",
      "--input=/tmp/qa-v2.json",
      "--admin-user-id=usr_existing_admin",
      "--apply",
      `--confirm-public-airtable=${PRELAUNCH_QA.publicDataConfirmation}`,
    ]);
    expect(refresh).toMatchObject({ command: "refresh", apply: true });
    expect(() => assertPrelaunchQaCommandMatchesInput(refresh, { version: 2 })).not.toThrow();
    expect(() => assertPrelaunchQaCommandMatchesInput(refresh, { version: 1 })).toThrow(
      /refresh only accepts version 2/,
    );

    const v1Evaluate = parsePrelaunchQaCli([
      "evaluate",
      "--environment=development",
      "--input=/tmp/qa.json",
      "--labels=/tmp/labels.json",
      "--admin-user-id=usr_existing_admin",
      "--apply",
      `--confirm-deidentified=${PRELAUNCH_QA.deidentificationConfirmation}`,
    ]);
    const v2Evaluate = parsePrelaunchQaCli([
      "evaluate",
      "--environment=development",
      "--input=/tmp/qa-v2.json",
      "--labels=/tmp/labels.json",
      "--admin-user-id=usr_existing_admin",
      "--apply",
      `--confirm-public-airtable=${PRELAUNCH_QA.publicDataConfirmation}`,
    ]);
    expect(() => assertPrelaunchQaCommandMatchesInput(v1Evaluate, { version: 1 })).not.toThrow();
    expect(() => assertPrelaunchQaCommandMatchesInput(v2Evaluate, { version: 2 })).not.toThrow();
    expect(() => assertPrelaunchQaCommandMatchesInput(v1Evaluate, { version: 2 })).toThrow(
      /confirmation does not match/,
    );
    expect(() => assertPrelaunchQaCommandMatchesInput(v2Evaluate, { version: 1 })).toThrow(
      /confirmation does not match/,
    );
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

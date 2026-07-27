import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import {
  and,
  eq,
  inArray,
  isNull,
  like,
  ne,
  or,
  sql,
  type ExtractTablesWithRelations,
} from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PostgresJsTransaction } from "drizzle-orm/postgres-js/session";
import type postgres from "postgres";
import { z } from "zod";

import * as dbSchema from "@/db/schema";
import {
  accounts,
  adminActions,
  analyticsEvents,
  cohortMembers,
  cohorts,
  comments,
  follows,
  introRequests,
  matchFeedback,
  matchRuns,
  matchTypeConfigs,
  matches,
  memberships,
  notifications,
  organizations,
  postSaves,
  posts,
  profileLinks,
  profiles,
  reports,
  spaceIntents,
  spaceMemberships,
  spaces,
  users,
} from "@/db/schema";
import type { MatchFactorWeights } from "@/lib/domain";
import { stableDefaultMatchTypeConfigs } from "@/lib/match-config";
import { containsPrelaunchQaContactIdentifier } from "./prelaunch-qa-contact-safety";

export { containsPrelaunchQaContactIdentifier };

export const PRELAUNCH_QA = {
  namespace: "wavesparks-prelaunch-qa-v1",
  orgId: "org_prelaunch_qa",
  orgSlug: "prelaunch-qa",
  mainSpaceId: "spc_prelaunch_qa_main",
  mainSpaceSlug: "main",
  testSpaceId: "spc_prelaunch_qa_test",
  testSpaceSlug: "test-space",
  expectedParticipants: 50,
  expectedMentors: 10,
  emailDomain: "prelaunch-qa.invalid",
  requiredDatabaseName: "wavespark_dev",
  deidentificationConfirmation: "DEIDENTIFIED_QA_ONLY",
  publicDataConfirmation: "PUBLIC_AIRTABLE_PROFILE_DATA_QA_ONLY",
  cleanupConfirmation: "DELETE_PRELAUNCH_QA",
  latestMigrationTimestamp: 1_785_136_131_801,
} as const;

type PublicAirtableQaMatchSlug =
  | "cofounder_match"
  | "collaborator_match"
  | "mentor_match";

const publicAirtableQaMatchOverrides: Record<
  PublicAirtableQaMatchSlug,
  { minimumScore: number; weights?: MatchFactorWeights }
> = {
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
};

const boundedText = z.string().trim().min(2).max(2_000);
const boundedShortText = z.string().trim().min(1).max(300);
const boundedOptionalText = z.string().trim().max(2_000);
const boundedOptionalShortText = z.string().trim().max(300);
const tagList = z.array(z.string().trim().min(1).max(100)).min(1).max(40);
const optionalTagList = z.array(z.string().trim().min(1).max(100)).max(40);
const matchTypeSlugSchema = z.enum([
  "cofounder_match",
  "mentor_match",
  "collaborator_match",
]);
const matchTypeListSchema = z.array(matchTypeSlugSchema).max(3);

const qaPersonBaseSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(80),
    fullName: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(160),
    headline: boundedShortText,
    bio: boundedText,
    problemInterest: boundedText,
    currentFocus: boundedText,
    stage: boundedShortText,
    industryTags: tagList,
    problemSpaceTags: tagList,
    skillTags: tagList,
    topStrengths: tagList,
    helpNeededTags: tagList,
    idealMatchDescription: boundedText,
    currentGoal: boundedText,
    lookingFor: tagList,
    offers: tagList,
  })
  .strict();

const qaParticipantSchema = qaPersonBaseSchema.extend({
  kind: z.literal("person"),
});

const qaMentorSchema = qaPersonBaseSchema.extend({
  kind: z.literal("mentor"),
  mentorExpertiseTags: tagList,
  mentorFunctionalStrengths: tagList,
  mentorStageExperience: tagList,
  mentorOffers: tagList,
  mentorshipPreferences: boundedText,
  mentorAvailability: boundedShortText,
  maxMentees: z.number().int().min(1).max(100),
});

const qaPublicProfileBaseSchema = qaPersonBaseSchema.extend({
  stage: boundedOptionalShortText,
  preferredName: z.string().trim().min(1).max(80),
  displayNamePreference: z.enum(["full_name", "preferred_name", "first_name_last_initial"]),
  shortBio: boundedShortText,
  longBio: boundedText,
  technicalExperienceLevel: boundedOptionalShortText,
  technicalExperience: boundedOptionalText,
  city: boundedOptionalShortText,
  country: boundedOptionalShortText,
  timezone: boundedOptionalShortText,
  schoolOrCompany: boundedOptionalShortText,
  currentStatus: boundedOptionalShortText,
  startupName: boundedOptionalShortText,
  startupOneLiner: boundedOptionalShortText,
  startupDescription: boundedOptionalText,
  businessModelTags: optionalTagList,
  currentProgress: boundedOptionalText,
  tractionSummary: boundedOptionalText,
  regionFocus: boundedOptionalShortText,
  lookingForTypes: optionalTagList,
  seekingMatchTypes: matchTypeListSchema,
  offeringMatchTypes: matchTypeListSchema,
  desiredRoles: tagList,
  canContribute: tagList,
  yearsOfExperience: z.number().int().min(0).max(100),
  priorProjects: boundedOptionalText,
  notableWins: boundedOptionalText,
  timeCommitment: boundedOptionalShortText,
  availabilityStart: boundedOptionalShortText,
  remotePreference: boundedOptionalShortText,
  preferredGeographies: optionalTagList,
  meetingFrequencyPreference: boundedOptionalShortText,
  ambitionLevel: z.number().int().min(0).max(5),
  riskTolerance: z.number().int().min(0).max(5),
  speedPreference: boundedOptionalShortText,
  decisionStyle: boundedOptionalShortText,
  workStyle: boundedOptionalShortText,
  communicationStyle: boundedOptionalShortText,
  conflictStyle: boundedOptionalShortText,
  commitmentHorizon: boundedOptionalShortText,
  missionVsMarketOrientation: boundedOptionalShortText,
  structureVsChaos: z.number().int().min(0).max(5),
  mentorExpertiseTags: optionalTagList,
  mentorFunctionalStrengths: optionalTagList,
  mentorStageExperience: optionalTagList,
  mentorOffers: optionalTagList,
  mentorshipPreferences: boundedOptionalText,
  mentorAvailability: boundedOptionalShortText,
  maxMentees: z.number().int().min(1).max(100).nullable(),
});

const qaPublicParticipantSchema = qaPublicProfileBaseSchema.extend({
  kind: z.literal("person"),
});

const qaPublicMentorSchema = qaPublicProfileBaseSchema.extend({
  kind: z.literal("mentor"),
});

const qaInputV1Schema = z
  .object({
    version: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    people: z
      .array(z.discriminatedUnion("kind", [qaParticipantSchema, qaMentorSchema]))
      .length(PRELAUNCH_QA.expectedParticipants + PRELAUNCH_QA.expectedMentors),
    labels: z.record(z.string().max(80), z.string().max(200)).optional(),
  })
  .strict();

const qaInputV2Schema = z
  .object({
    version: z.literal(2),
    dataPolicy: z.literal("public_airtable_profile_data"),
    generatedAt: z.string().datetime({ offset: true }),
    people: z
      .array(z.discriminatedUnion("kind", [qaPublicParticipantSchema, qaPublicMentorSchema]))
      .length(PRELAUNCH_QA.expectedParticipants + PRELAUNCH_QA.expectedMentors),
    labels: z.record(z.string().max(80), z.string().max(200)).optional(),
  })
  .strict();

const qaInputSchema = z.discriminatedUnion("version", [qaInputV1Schema, qaInputV2Schema]);

type PrelaunchQaV1Person = z.infer<typeof qaParticipantSchema>;
type PrelaunchQaV1Mentor = z.infer<typeof qaMentorSchema>;
type PrelaunchQaV2Person = z.infer<typeof qaPublicParticipantSchema>;
type PrelaunchQaV2Mentor = z.infer<typeof qaPublicMentorSchema>;

export type PrelaunchQaPerson = PrelaunchQaV1Person | PrelaunchQaV2Person;
export type PrelaunchQaMentor = PrelaunchQaV1Mentor | PrelaunchQaV2Mentor;
export type PrelaunchQaInput = z.infer<typeof qaInputSchema>;

type UserInsert = typeof users.$inferInsert;
type MembershipInsert = typeof memberships.$inferInsert;
type OrganizationInsert = typeof organizations.$inferInsert;
type SpaceInsert = typeof spaces.$inferInsert;
type ProfileInsert = typeof profiles.$inferInsert;
type SpaceMembershipInsert = typeof spaceMemberships.$inferInsert;
type SpaceIntentInsert = typeof spaceIntents.$inferInsert;
type MatchTypeConfigInsert = typeof matchTypeConfigs.$inferInsert;

export type PrelaunchQaDatabase = PostgresJsDatabase<typeof dbSchema>;
type PrelaunchQaQueryExecutor =
  | PrelaunchQaDatabase
  | PostgresJsTransaction<
      typeof dbSchema,
      ExtractTablesWithRelations<typeof dbSchema>
    >;

export interface PrelaunchQaAdminUser {
  id: string;
}

export interface PrelaunchQaRows {
  organization: OrganizationInsert;
  users: UserInsert[];
  memberships: MembershipInsert[];
  spaces: SpaceInsert[];
  profiles: ProfileInsert[];
  spaceMemberships: SpaceMembershipInsert[];
  spaceIntents: SpaceIntentInsert[];
  matchTypeConfigs: MatchTypeConfigInsert[];
  syntheticUserIds: string[];
  syntheticMembershipIds: string[];
  adminMembershipIds: string[];
}

export interface PrelaunchQaPreflightResult {
  latestMigrationTimestamp: number;
  integrityCounts: Record<string, number>;
}

export interface PrelaunchQaNamespaceInspection {
  existingOrganization: boolean;
  existingSyntheticUsers: number;
  existingProfiles: number;
  adminUsers: number;
}

export interface PrelaunchQaCleanupResult {
  organizationDeleted: number;
  syntheticUsersDeleted: number;
  membershipsDeleted: number;
  profilesDeleted: number;
  spacesDeleted: number;
  spaceMembershipsDeleted: number;
  spaceIntentsDeleted: number;
  matchesDeleted: number;
  matchRunsDeleted: number;
}

export interface PrelaunchQaEvaluationRequest {
  orgId: typeof PRELAUNCH_QA.orgId;
  spaceId: typeof PRELAUNCH_QA.testSpaceId;
  expectedParticipants: typeof PRELAUNCH_QA.expectedParticipants;
  expectedMentors: typeof PRELAUNCH_QA.expectedMentors;
}

export interface PrelaunchQaEvaluationResult {
  generatedMatchCount: number;
  evaluatedPairs: number;
  notes: string[];
}

export interface PrelaunchQaEvaluator {
  evaluate(request: PrelaunchQaEvaluationRequest): Promise<PrelaunchQaEvaluationResult>;
}

export function evaluatePrelaunchQa(evaluator: PrelaunchQaEvaluator) {
  return evaluator.evaluate({
    orgId: PRELAUNCH_QA.orgId,
    spaceId: PRELAUNCH_QA.testSpaceId,
    expectedParticipants: PRELAUNCH_QA.expectedParticipants,
    expectedMentors: PRELAUNCH_QA.expectedMentors,
  });
}

function deterministicQaId(prefix: string, source: string) {
  const digest = createHash("sha256")
    .update(`${PRELAUNCH_QA.namespace}:${source}`)
    .digest("hex")
    .slice(0, 24);
  return `${prefix}_${digest}`;
}

function expectedSyntheticUserManifest() {
  return new Map(
    [
      ...Array.from({ length: PRELAUNCH_QA.expectedParticipants }, (_, index) => {
        const position = String(index + 1).padStart(2, "0");
        return [
          deterministicQaId("qa_usr", `qa-participant-${position}`),
          `qa.participant.${position}@${PRELAUNCH_QA.emailDomain}`,
        ] as const;
      }),
      ...Array.from({ length: PRELAUNCH_QA.expectedMentors }, (_, index) => {
        const position = String(index + 1).padStart(2, "0");
        return [
          deterministicQaId("qa_usr", `qa-mentor-${position}`),
          `qa.mentor.${position}@${PRELAUNCH_QA.emailDomain}`,
        ] as const;
      }),
    ],
  );
}

function expectedIdentity(kind: "person" | "mentor", index: number) {
  const position = String(index).padStart(2, "0");
  if (kind === "person") {
    return {
      sourceId: `qa-participant-${position}`,
      fullName: `QA Participant ${position}`,
      email: `qa.participant.${position}@${PRELAUNCH_QA.emailDomain}`,
    };
  }
  return {
    sourceId: `qa-mentor-${position}`,
    fullName: `QA Mentor ${position}`,
    email: `qa.mentor.${position}@${PRELAUNCH_QA.emailDomain}`,
  };
}

function isPublicProfilePerson(
  person: PrelaunchQaPerson | PrelaunchQaMentor,
): person is PrelaunchQaV2Person | PrelaunchQaV2Mentor {
  return "seekingMatchTypes" in person;
}

function writtenTextValues(person: PrelaunchQaPerson | PrelaunchQaMentor) {
  return Object.entries(person).flatMap(([key, value]) => {
    if (key === "email" || key === "sourceId" || key === "kind") return [];
    if (typeof value === "string") return [value];
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string")
      : [];
  });
}

function containsCompanyLegalIdentifier(value: string) {
  return /\b(?:pte\.?\s*ltd\.?|incorporated|llc|gmbh|plc|sdn\.?\s*bhd\.?)\b/i.test(value);
}

function inputValidationMessages(input: PrelaunchQaInput) {
  const messages: string[] = [];
  const participants = input.people.filter((person) => person.kind === "person");
  const mentors = input.people.filter((person) => person.kind === "mentor");

  if (participants.length !== PRELAUNCH_QA.expectedParticipants) {
    messages.push(`people must contain exactly ${PRELAUNCH_QA.expectedParticipants} participants.`);
  }
  if (mentors.length !== PRELAUNCH_QA.expectedMentors) {
    messages.push(`people must contain exactly ${PRELAUNCH_QA.expectedMentors} mentors.`);
  }

  const allSourceIds = input.people.map((person) => person.sourceId);
  const allEmails = input.people.map((person) => person.email.toLowerCase());
  const allFullNames = input.people.map((person) => person.fullName.toLocaleLowerCase());
  if (new Set(allSourceIds).size !== allSourceIds.length) {
    messages.push("sourceId values must be unique.");
  }
  if (new Set(allEmails).size !== allEmails.length) {
    messages.push("email values must be unique.");
  }
  if (new Set(allFullNames).size !== allFullNames.length) {
    messages.push("fullName values must be unique.");
  }

  for (const [kind, people, expectedCount] of [
    ["person", participants, PRELAUNCH_QA.expectedParticipants],
    ["mentor", mentors, PRELAUNCH_QA.expectedMentors],
  ] as const) {
    const actualBySourceId = new Map(people.map((person) => [person.sourceId, person]));
    for (let index = 1; index <= expectedCount; index += 1) {
      const expected = expectedIdentity(kind, index);
      const person = actualBySourceId.get(expected.sourceId);
      if (!person) {
        messages.push(`Missing QA record ${expected.sourceId}.`);
        continue;
      }
      if (person.email.toLowerCase() !== expected.email) {
        messages.push(`${expected.sourceId} must use its fixed .invalid email.`);
      }
      if (input.version === 1 && person.fullName !== expected.fullName) {
        messages.push(`${expected.sourceId} must use its fixed QA name and .invalid email.`);
      }
    }
  }

  for (const person of input.people) {
    if (!person.email.toLowerCase().endsWith(`@${PRELAUNCH_QA.emailDomain}`)) {
      messages.push(`${person.sourceId} must use the ${PRELAUNCH_QA.emailDomain} domain.`);
    }
    const writtenValues = writtenTextValues(person);
    if (writtenValues.some(containsPrelaunchQaContactIdentifier)) {
      messages.push(
        `${person.sourceId} contains a URL, email, phone number, or social account.`,
      );
    }
    if (input.version === 1 && writtenValues.some(containsCompanyLegalIdentifier)) {
      messages.push(`${person.sourceId} contains a company legal identifier.`);
    }
    if (input.version === 2 && isPublicProfilePerson(person)) {
      for (const key of ["seekingMatchTypes", "offeringMatchTypes"] as const) {
        if (new Set(person[key]).size !== person[key].length) {
          messages.push(`${person.sourceId} contains duplicate ${key} values.`);
        }
      }
      for (const matchType of ["cofounder_match", "collaborator_match"] as const) {
        const seeks = person.seekingMatchTypes.includes(matchType);
        const offers = person.offeringMatchTypes.includes(matchType);
        if (seeks !== offers) {
          messages.push(
            `${person.sourceId} must both seek and offer ${matchType} because it is mutual.`,
          );
        }
      }
    }
  }

  return [...new Set(messages)];
}

export function parsePrelaunchQaInput(value: unknown): PrelaunchQaInput {
  const parsed = qaInputSchema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 12)
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`);
    throw new Error(`Invalid prelaunch QA input: ${issues.join("; ")}`);
  }

  const messages = inputValidationMessages(parsed.data);
  if (messages.length) {
    throw new Error(`Unsafe prelaunch QA input: ${messages.join(" ")}`);
  }
  return parsed.data;
}

export function readPrelaunchQaInputFile(inputPath: string) {
  const resolvedPath = path.resolve(inputPath);
  const file = lstatSync(resolvedPath);
  if (file.isSymbolicLink() || !file.isFile()) {
    throw new Error("Prelaunch QA input must be a regular file, not a symlink.");
  }
  if ((file.mode & 0o777) !== 0o600) {
    throw new Error("Prelaunch QA input permissions must be exactly 0600.");
  }
  if (typeof process.getuid === "function" && file.uid !== process.getuid()) {
    throw new Error("Prelaunch QA input must be owned by the current user.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Prelaunch QA input must not exceed 2 MiB.");
  }

  const realTmpRoot = realpathSync("/tmp");
  const realInputPath = realpathSync(resolvedPath);
  const relativeToTmp = path.relative(realTmpRoot, realInputPath);
  if (
    relativeToTmp === "" ||
    relativeToTmp.startsWith(`..${path.sep}`) ||
    relativeToTmp === ".." ||
    path.isAbsolute(relativeToTmp)
  ) {
    throw new Error("Prelaunch QA input must be stored below /tmp and outside the repository.");
  }
  const realRepositoryRoot = realpathSync(process.cwd());
  const relativeToRepository = path.relative(realRepositoryRoot, realInputPath);
  if (
    relativeToRepository === "" ||
    (!relativeToRepository.startsWith(`..${path.sep}`) &&
      relativeToRepository !== ".." &&
      !path.isAbsolute(relativeToRepository))
  ) {
    throw new Error("Prelaunch QA input must not be stored inside the repository.");
  }

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(realInputPath, "utf8"));
  } catch {
    throw new Error("Prelaunch QA input is not valid JSON.");
  }
  return parsePrelaunchQaInput(value);
}

function databaseParts(databaseUrl: string) {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use postgres or postgresql.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")).split("/")[0];
  return {
    database,
    fingerprint: `${url.hostname.toLowerCase()}:${url.port || "5432"}/${database}`,
    hostname: url.hostname.toLowerCase(),
  };
}

function isLocalDatabaseHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.startsWith("127.")
  );
}

export function assertSafePrelaunchQaTarget(input: {
  environment?: string;
  databaseUrl?: string;
  configuredDevelopmentDatabaseUrl?: string;
  productionDatabaseUrl?: string;
  vercelEnvironment?: string;
  nodeEnvironment?: string;
  clerkPublishableKey?: string;
  clerkSecretKey?: string;
}) {
  if (input.environment !== "development") {
    throw new Error("Prelaunch QA is development-only; production targets are always rejected.");
  }
  if (input.vercelEnvironment?.toLowerCase() === "production") {
    throw new Error("Prelaunch QA cannot run in a production Vercel environment.");
  }
  if (input.nodeEnvironment?.toLowerCase() === "production") {
    throw new Error("Prelaunch QA cannot run with NODE_ENV=production.");
  }
  if (!input.databaseUrl) {
    throw new Error("The development DATABASE_URL is not configured.");
  }

  const target = databaseParts(input.databaseUrl);
  if (target.database !== PRELAUNCH_QA.requiredDatabaseName) {
    throw new Error(
      `Prelaunch QA requires database ${PRELAUNCH_QA.requiredDatabaseName}; received a different database fingerprint.`,
    );
  }
  if (isLocalDatabaseHost(target.hostname)) {
    throw new Error("Prelaunch QA requires the shared development database, not localhost.");
  }
  if (!input.configuredDevelopmentDatabaseUrl) {
    throw new Error("Prelaunch QA requires an explicit configured development database fingerprint.");
  }
  const configuredDevelopment = databaseParts(input.configuredDevelopmentDatabaseUrl);
  if (configuredDevelopment.fingerprint !== target.fingerprint) {
    throw new Error("The selected database does not match the configured development fingerprint.");
  }
  if (!input.productionDatabaseUrl) {
    throw new Error("Prelaunch QA requires an explicit production database fingerprint for isolation.");
  }
  const production = databaseParts(input.productionDatabaseUrl);
  if (production.fingerprint === target.fingerprint) {
    throw new Error("The selected database matches the production database fingerprint.");
  }
  if (!input.clerkPublishableKey?.startsWith("pk_test_")) {
    throw new Error("Prelaunch QA requires an explicit Clerk test publishable key.");
  }
  if (!input.clerkSecretKey?.startsWith("sk_test_")) {
    throw new Error("Prelaunch QA requires an explicit Clerk test secret key.");
  }
  return target.fingerprint;
}

export function assertSeedAuthorization(apply: boolean) {
  if (!apply) {
    throw new Error("seed requires --apply. Use dry-run for a read-only validation.");
  }
}

export function assertCleanupAuthorization(apply: boolean, confirmation?: string) {
  if (!apply || confirmation !== PRELAUNCH_QA.cleanupConfirmation) {
    throw new Error(
      `cleanup requires --apply and --confirm=${PRELAUNCH_QA.cleanupConfirmation}.`,
    );
  }
}

function profileSeekingText(person: PrelaunchQaPerson | PrelaunchQaMentor) {
  const desiredRoles = isPublicProfilePerson(person) ? person.desiredRoles : person.lookingFor;
  const businessModels = isPublicProfilePerson(person) ? person.businessModelTags : [];
  return [
    `Current context: ${person.headline}. ${person.currentFocus}. ${person.problemInterest}`,
    `Ideal match: ${person.idealMatchDescription}`,
    `Roles needed: ${desiredRoles.join(", ")}`,
    `Help needed: ${person.helpNeededTags.join(", ")}`,
    `Current goal: ${person.currentGoal}`,
    `Looking for: ${person.lookingFor.join(", ")}`,
    `Venture: ${person.stage}; ${person.industryTags.join(", ")}; ${person.problemSpaceTags.join(", ")}; ${businessModels.join(", ")}`,
  ].join("\n");
}

function profileOfferingText(person: PrelaunchQaPerson | PrelaunchQaMentor) {
  const mentorSignals = isPublicProfilePerson(person)
    ? [
        ...person.mentorExpertiseTags,
        ...person.mentorFunctionalStrengths,
        ...person.mentorOffers,
      ]
    : person.kind === "mentor"
      ? [
          ...person.mentorExpertiseTags,
          ...person.mentorFunctionalStrengths,
          ...person.mentorOffers,
        ]
      : [];
  const canContribute = isPublicProfilePerson(person) ? person.canContribute : person.offers;
  const experience = isPublicProfilePerson(person)
    ? [person.technicalExperience, person.priorProjects, person.notableWins].filter(Boolean).join("; ")
    : "";
  return [
    `Profile: ${person.headline}. ${person.bio}`,
    `Skills: ${person.skillTags.join(", ")}`,
    `Strengths: ${person.topStrengths.join(", ")}`,
    `Can offer: ${[...canContribute, ...mentorSignals].join(", ")}`,
    experience ? `Experience: ${experience}` : "",
    `Venture context: ${person.stage}; ${person.industryTags.join(", ")}; ${person.problemSpaceTags.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSyntheticMembership(
  person: PrelaunchQaPerson | PrelaunchQaMentor,
  at: Date,
  usesPublicProfileData: boolean,
) {
  const userId = deterministicQaId("qa_usr", person.sourceId);
  const membershipId = deterministicQaId("qa_mem", person.sourceId);
  return {
    user: {
      id: userId,
      email: person.email.toLowerCase(),
      name: person.fullName,
      imageUrl: "",
      platformRole: "standard" as const,
      createdAt: at,
      updatedAt: at,
    } satisfies UserInsert,
    membership: {
      id: membershipId,
      orgId: PRELAUNCH_QA.orgId,
      userId,
      role: "member" as const,
      mentorStatus: person.kind === "mentor" ? ("approved" as const) : ("not_mentor" as const),
      mentorReviewedAt: person.kind === "mentor" ? at : undefined,
      accountStatus: "connected" as const,
      affiliationType: person.kind === "mentor" ? "mentor" : "current participant",
      status: "approved" as const,
      archetypes: person.kind === "mentor" ? ["mentor"] : ["founder", "mentee"],
      programName: "Wavesparks Prelaunch QA",
      cohortNameOrYear: "Prelaunch QA",
      approvalNote: usesPublicProfileData
        ? "Protected QA profile built from public Airtable profile data; contact details and links excluded."
        : "Synthetic, de-identified prelaunch QA record.",
      approvedAt: at,
      createdAt: at,
      updatedAt: at,
    } satisfies MembershipInsert,
  };
}

function buildProfile(
  person: PrelaunchQaPerson | PrelaunchQaMentor,
  membershipId: string,
  at: Date,
) {
  const isMentor = person.kind === "mentor";
  const publicProfile = isPublicProfilePerson(person) ? person : undefined;
  const mentorSignals = !publicProfile && isMentor
    ? [...person.mentorExpertiseTags, ...person.mentorFunctionalStrengths, ...person.mentorOffers]
    : [];
  const seekingMatchTypes = publicProfile
    ? publicProfile.seekingMatchTypes
    : isMentor
      ? []
      : ["mentor_match"];
  const offeringMatchTypes = publicProfile
    ? publicProfile.offeringMatchTypes
    : isMentor
      ? ["mentor_match"]
      : [];
  return {
    id: deterministicQaId("qa_pro", person.sourceId),
    membershipId,
    fullName: person.fullName,
    preferredName: publicProfile?.preferredName ?? person.fullName,
    displayNamePreference: publicProfile?.displayNamePreference ?? "full_name",
    profilePhoto: "",
    headline: person.headline,
    shortBio: publicProfile?.shortBio ?? person.bio.slice(0, 280),
    longBio: publicProfile?.longBio ?? person.bio,
    bio: person.bio,
    problemInterest: person.problemInterest,
    currentFocus: person.currentFocus,
    technicalExperienceLevel: publicProfile?.technicalExperienceLevel ?? "not_sure",
    technicalExperience: publicProfile?.technicalExperience ?? person.topStrengths.join(", "),
    city: publicProfile?.city ?? "Singapore",
    country: publicProfile?.country ?? "SG",
    timezone: publicProfile?.timezone ?? "Asia/Singapore",
    schoolOrCompany: publicProfile?.schoolOrCompany ?? "",
    currentStatus: publicProfile?.currentStatus ?? (isMentor ? "mentor" : "founder"),
    startupName: publicProfile?.startupName ?? "",
    startupOneLiner: publicProfile?.startupOneLiner ?? person.currentFocus,
    startupDescription: publicProfile?.startupDescription ?? person.problemInterest,
    stage: person.stage,
    industryTags: person.industryTags,
    problemSpaceTags: person.problemSpaceTags,
    businessModelTags: publicProfile?.businessModelTags ?? [],
    currentProgress: publicProfile?.currentProgress ?? person.currentFocus,
    tractionSummary: publicProfile?.tractionSummary ?? "",
    regionFocus: publicProfile?.regionFocus ?? "Singapore",
    lookingForTypes: publicProfile?.lookingForTypes ?? (isMentor ? [] : ["mentor"]),
    seekingMatchTypes,
    offeringMatchTypes,
    desiredRoles: publicProfile?.desiredRoles ?? person.lookingFor,
    helpNeededTags: person.helpNeededTags,
    idealMatchDescription: person.idealMatchDescription,
    skillTags: person.skillTags,
    yearsOfExperience: publicProfile?.yearsOfExperience ?? (isMentor ? 10 : 3),
    topStrengths: person.topStrengths,
    canContribute: publicProfile?.canContribute ?? [
      ...new Set([...person.offers, ...mentorSignals]),
    ],
    priorProjects: publicProfile?.priorProjects ?? person.currentFocus,
    notableWins: publicProfile?.notableWins ?? "",
    timeCommitment: publicProfile?.timeCommitment ?? "part time serious",
    availabilityStart: publicProfile?.availabilityStart ?? "now",
    remotePreference: publicProfile?.remotePreference ?? "remote",
    preferredGeographies: publicProfile?.preferredGeographies ?? ["Singapore", "remote"],
    meetingFrequencyPreference: publicProfile?.meetingFrequencyPreference ?? "weekly",
    ambitionLevel: publicProfile?.ambitionLevel ?? 3,
    riskTolerance: publicProfile?.riskTolerance ?? 3,
    speedPreference: publicProfile?.speedPreference ?? "balanced",
    decisionStyle: publicProfile?.decisionStyle ?? "evidence informed",
    workStyle: publicProfile?.workStyle ?? "collaborative",
    communicationStyle: publicProfile?.communicationStyle ?? "direct",
    conflictStyle: publicProfile?.conflictStyle ?? "constructive",
    commitmentHorizon: publicProfile?.commitmentHorizon ?? "long term",
    missionVsMarketOrientation: publicProfile?.missionVsMarketOrientation ?? "balanced",
    structureVsChaos: publicProfile?.structureVsChaos ?? 3,
    mentorExpertiseTags:
      publicProfile?.mentorExpertiseTags ?? (isMentor ? person.mentorExpertiseTags : []),
    mentorStageExperience:
      publicProfile?.mentorStageExperience ?? (isMentor ? person.mentorStageExperience : []),
    mentorFunctionalStrengths:
      publicProfile?.mentorFunctionalStrengths ??
      (isMentor ? person.mentorFunctionalStrengths : []),
    mentorAvailability:
      publicProfile?.mentorAvailability ?? (isMentor ? person.mentorAvailability : ""),
    mentorOffers: publicProfile?.mentorOffers ?? (isMentor ? person.mentorOffers : []),
    maxMentees: publicProfile?.maxMentees ?? (isMentor ? person.maxMentees : null),
    mentorshipPreferences:
      publicProfile?.mentorshipPreferences ?? (isMentor ? person.mentorshipPreferences : ""),
    publicContactEnabled: false,
    emailForIntro: person.email.toLowerCase(),
    whatsappNumber: "",
    whatsappVisibleAfterAccept: false,
    introOptIn: true,
    profileVisibleInMatching: true,
    profileCompletionPercent: 100,
    lastActiveAt: at,
    featured: false,
    stale: false,
    onboardingComplete: true,
    seekingEmbeddingText: profileSeekingText(person),
    offeringEmbeddingText: profileOfferingText(person),
    seekingEmbedding: null,
    offeringEmbedding: null,
    embeddingModel: null,
    embeddingSourceHash: null,
    embeddingStatus: "pending",
    embeddingError: null,
    embeddingUpdatedAt: null,
    createdAt: at,
    updatedAt: at,
  } satisfies ProfileInsert;
}

export function buildPrelaunchQaRows(
  input: PrelaunchQaInput,
  adminUsers: PrelaunchQaAdminUser[],
): PrelaunchQaRows {
  if (!adminUsers.length) {
    throw new Error("No existing administrator account is available for QA org access.");
  }
  const at = new Date(input.generatedAt);
  const usesPublicProfileData = input.version === 2;
  const sortedPeople = [...input.people].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId),
  );
  const synthetic = sortedPeople.map((person) =>
    buildSyntheticMembership(person, at, usesPublicProfileData),
  );
  const adminMemberships = [...adminUsers]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(
      (admin) =>
        ({
          id: deterministicQaId("qa_adm", admin.id),
          orgId: PRELAUNCH_QA.orgId,
          userId: admin.id,
          role: "org_admin",
          mentorStatus: "not_mentor",
          accountStatus: "connected",
          affiliationType: "current participant",
          status: "approved",
          archetypes: ["operator"],
          programName: "Wavesparks Prelaunch QA",
          cohortNameOrYear: "Admin",
          approvalNote: "Existing administrator granted access to the isolated QA organization.",
          approvedAt: at,
          createdAt: at,
          updatedAt: at,
        }) satisfies MembershipInsert,
    );
  const creatorMembershipId = adminMemberships[0].id;
  const organization = {
    id: PRELAUNCH_QA.orgId,
    name: "Wavesparks Prelaunch QA",
    slug: PRELAUNCH_QA.orgSlug,
    logoUrl: "",
    themeJson: {
      accent: "#2563eb",
      accentSoft: "#dbeafe",
      canvas: "#f8fafc",
      ink: "#0f172a",
    },
    tagline: usesPublicProfileData
      ? "Protected public-profile prelaunch validation"
      : "Isolated prelaunch matching validation",
    description: usesPublicProfileData
      ? "Public Airtable profile data replicated for isolated prelaunch QA; contact details, links, and photos are excluded."
      : "Synthetic, de-identified records for prelaunch stability and matching QA.",
    membershipRules: usesPublicProfileData
      ? ["QA namespace only", "No invitations", "Public profile data only", "No contact data or links"]
      : ["QA namespace only", "No invitations", "No real contact data"],
    allowedDomains: [PRELAUNCH_QA.emailDomain],
    inviteSettings: "disabled",
    status: "active",
    createdAt: at,
  } satisfies OrganizationInsert;
  const qaSpaces = [
    {
      id: PRELAUNCH_QA.mainSpaceId,
      orgId: PRELAUNCH_QA.orgId,
      slug: PRELAUNCH_QA.mainSpaceSlug,
      kind: "main" as const,
      lifecycle: "active" as const,
      name: "Wavesparks Prelaunch QA",
      description: "Main space for the isolated prelaunch QA organization.",
      eventLabel: "QA Community",
      matchingEnabled: false,
      createdByMembershipId: creatorMembershipId,
      createdAt: at,
      updatedAt: at,
    },
    {
      id: PRELAUNCH_QA.testSpaceId,
      orgId: PRELAUNCH_QA.orgId,
      slug: PRELAUNCH_QA.testSpaceSlug,
      kind: "event" as const,
      lifecycle: "active" as const,
      name: "Airtable 50+10 Stability Test",
      description: "50 participant cards and 10 mentor cards for matching validation.",
      eventLabel: "Prelaunch QA",
      matchingEnabled: true,
      createdByMembershipId: creatorMembershipId,
      createdAt: at,
      updatedAt: at,
    },
  ] satisfies SpaceInsert[];

  const qaProfiles = sortedPeople.map((person) =>
    buildProfile(person, deterministicQaId("qa_mem", person.sourceId), at),
  );
  const syntheticAccess = sortedPeople.map(
    (person) =>
      ({
        id: deterministicQaId("qa_spm", `${PRELAUNCH_QA.testSpaceId}:${person.sourceId}`),
        orgId: PRELAUNCH_QA.orgId,
        spaceId: PRELAUNCH_QA.testSpaceId,
        membershipId: deterministicQaId("qa_mem", person.sourceId),
        accessStatus: "active",
        joinedVia: "import",
        grantedAt: at,
        createdAt: at,
        updatedAt: at,
      }) satisfies SpaceMembershipInsert,
  );
  const qaIntents = sortedPeople.map(
    (person) =>
      ({
        id: deterministicQaId("qa_spi", `${PRELAUNCH_QA.testSpaceId}:${person.sourceId}`),
        orgId: PRELAUNCH_QA.orgId,
        spaceId: PRELAUNCH_QA.testSpaceId,
        membershipId: deterministicQaId("qa_mem", person.sourceId),
        currentGoal: person.currentGoal,
        lookingFor: person.lookingFor,
        offers: person.offers,
        matchingOptIn: true,
        intentComplete: true,
        seekingText: [
          `Current goal: ${person.currentGoal}`,
          `Looking for in this space: ${person.lookingFor.join(", ")}`,
        ].join("\n"),
        offeringText: `Can offer in this space: ${person.offers.join(", ")}`,
        seekingEmbedding: null,
        offeringEmbedding: null,
        embeddingModel: null,
        embeddingSourceHash: null,
        embeddingStatus: "pending",
        embeddingError: null,
        embeddingUpdatedAt: null,
        createdAt: at,
        updatedAt: at,
      }) satisfies SpaceIntentInsert,
  );
  const configs = stableDefaultMatchTypeConfigs(PRELAUNCH_QA.orgId, input.generatedAt).map(
    (config) => {
      const override =
        usesPublicProfileData && config.slug in publicAirtableQaMatchOverrides
          ? publicAirtableQaMatchOverrides[config.slug as PublicAirtableQaMatchSlug]
          : undefined;
      const overrideWeights = override?.weights;
      return {
        id: config.id,
        orgId: config.orgId,
        slug: config.slug,
        name: config.name,
        description: config.description,
        direction: config.direction,
        seekerLabel: config.seekerLabel,
        providerLabel: config.providerLabel,
        weightsJson: overrideWeights ?? config.weights,
        minimumScore: override?.minimumScore ?? config.minimumScore,
        active: config.active,
        version: override ? 2 : config.version,
        createdAt: at,
        updatedAt: at,
      } satisfies MatchTypeConfigInsert;
    },
  );

  return {
    organization,
    users: synthetic.map((entry) => entry.user),
    memberships: [...adminMemberships, ...synthetic.map((entry) => entry.membership)],
    spaces: qaSpaces,
    profiles: qaProfiles,
    // Org admins can manage the Event without joining its roster. Keeping the
    // admin out of Space membership makes the Event participant count exactly 60.
    spaceMemberships: syntheticAccess,
    spaceIntents: qaIntents,
    matchTypeConfigs: configs,
    syntheticUserIds: synthetic.map((entry) => entry.user.id),
    syntheticMembershipIds: synthetic.map((entry) => entry.membership.id),
    adminMembershipIds: adminMemberships.map((entry) => entry.id),
  };
}

interface SchemaPresenceRow {
  migration_table: string | null;
  organizations: string | null;
  users: string | null;
  memberships: string | null;
  profiles: string | null;
  spaces: string | null;
  space_memberships: string | null;
  space_intents: string | null;
  match_type_configs: string | null;
  migration_0017_columns: string | number;
}

interface MigrationTimestampRow {
  latest: string | number | null;
}

interface IntegrityRow {
  check: string;
  count: string | number;
}

export function evaluatePrelaunchQaIntegrityRows(rows: IntegrityRow[]) {
  const counts: Record<string, number> = {};
  const errors: string[] = [];
  for (const row of rows) {
    const count = Number(row.count);
    counts[row.check] = count;
    if (!Number.isSafeInteger(count) || count < 0) {
      errors.push(`${row.check} returned an invalid count.`);
    } else if (count > 0) {
      errors.push(`${row.check}=${count}`);
    }
  }
  if (errors.length) {
    throw new Error(`Prelaunch QA integrity preflight failed: ${errors.join(", ")}.`);
  }
  return counts;
}

export async function runPrelaunchQaPreflight(sqlClient: postgres.Sql) {
  const [presence] = await sqlClient<SchemaPresenceRow[]>`
    SELECT
      to_regclass('drizzle.__drizzle_migrations')::text AS migration_table,
      to_regclass('public.organizations')::text AS organizations,
      to_regclass('public.users')::text AS users,
      to_regclass('public.memberships')::text AS memberships,
      to_regclass('public.profiles')::text AS profiles,
      to_regclass('public.spaces')::text AS spaces,
      to_regclass('public.space_memberships')::text AS space_memberships,
      to_regclass('public.space_intents')::text AS space_intents,
      to_regclass('public.match_type_configs')::text AS match_type_configs,
      (
        SELECT count(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (
              table_name = 'profiles'
              AND column_name IN (
                'bio',
                'problem_interest',
                'current_focus',
                'technical_experience_level',
                'technical_experience'
              )
            )
            OR (
              table_name = 'memberships'
              AND column_name IN (
                'mentor_status',
                'mentor_reviewed_at',
                'mentor_reviewed_by_membership_id'
              )
            )
            OR (table_name = 'intro_requests' AND column_name = 'kind')
          )
      )::integer AS migration_0017_columns
  `;
  const requiredTables = [
    "migration_table",
    "organizations",
    "users",
    "memberships",
    "profiles",
    "spaces",
    "space_memberships",
    "space_intents",
    "match_type_configs",
  ] as const;
  const missingTables = requiredTables.filter((name) => !presence?.[name]);
  if (missingTables.length || Number(presence?.migration_0017_columns) !== 9) {
    throw new Error(
      `Prelaunch QA requires migrations through 0017; missing=${missingTables.join(",") || "none"}, required_columns=${Number(presence?.migration_0017_columns ?? 0)}/9.`,
    );
  }

  const [migration] = await sqlClient<MigrationTimestampRow[]>`
    SELECT max(created_at) AS latest FROM drizzle.__drizzle_migrations
  `;
  const latestMigrationTimestamp = Number(migration?.latest ?? 0);
  if (
    !Number.isSafeInteger(latestMigrationTimestamp) ||
    latestMigrationTimestamp < PRELAUNCH_QA.latestMigrationTimestamp
  ) {
    throw new Error(
      `Prelaunch QA requires migration 0017 (${PRELAUNCH_QA.latestMigrationTimestamp}); latest=${latestMigrationTimestamp}.`,
    );
  }

  const integrityRows = await sqlClient<IntegrityRow[]>`
    WITH audit AS (
      SELECT 'duplicate_profiles'::text AS "check", count(*)::bigint AS "count"
      FROM (
        SELECT membership_id
        FROM profiles
        GROUP BY membership_id
        HAVING count(*) > 1
      ) duplicate_profile_memberships

      UNION ALL
      SELECT 'orphan_profiles', count(*)::bigint
      FROM profiles p
      LEFT JOIN memberships m ON m.id = p.membership_id
      WHERE m.id IS NULL

      UNION ALL
      SELECT 'orphan_profile_links', count(*)::bigint
      FROM profile_links pl
      LEFT JOIN profiles p ON p.id = pl.profile_id
      WHERE p.id IS NULL

      UNION ALL
      SELECT 'orphan_accounts', count(*)::bigint
      FROM accounts a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE u.id IS NULL

      UNION ALL
      SELECT 'orphan_memberships', count(*)::bigint
      FROM memberships m
      LEFT JOIN organizations o ON o.id = m.org_id
      LEFT JOIN users u ON u.id = m.user_id
      WHERE o.id IS NULL OR u.id IS NULL

      UNION ALL
      SELECT 'orphan_spaces', count(*)::bigint
      FROM spaces s
      LEFT JOIN organizations o ON o.id = s.org_id
      LEFT JOIN memberships creator
        ON creator.id = s.created_by_membership_id
        AND creator.org_id = s.org_id
      WHERE o.id IS NULL
        OR (s.created_by_membership_id IS NOT NULL AND creator.id IS NULL)

      UNION ALL
      SELECT 'orphan_match_type_configs', count(*)::bigint
      FROM match_type_configs mtc
      LEFT JOIN organizations o ON o.id = mtc.org_id
      WHERE o.id IS NULL

      UNION ALL
      SELECT 'orphan_space_memberships', count(*)::bigint
      FROM space_memberships sm
      LEFT JOIN spaces s ON s.id = sm.space_id AND s.org_id = sm.org_id
      LEFT JOIN memberships m ON m.id = sm.membership_id AND m.org_id = sm.org_id
      WHERE s.id IS NULL OR m.id IS NULL

      UNION ALL
      SELECT 'orphan_space_intents', count(*)::bigint
      FROM space_intents si
      LEFT JOIN space_memberships sm
        ON sm.space_id = si.space_id
        AND sm.membership_id = si.membership_id
        AND sm.org_id = si.org_id
      WHERE sm.id IS NULL
    )
    SELECT "check", "count" FROM audit ORDER BY "check"
  `;
  return {
    latestMigrationTimestamp,
    integrityCounts: evaluatePrelaunchQaIntegrityRows(integrityRows),
  } satisfies PrelaunchQaPreflightResult;
}

export function createPrelaunchQaDatabase(sqlClient: postgres.Sql) {
  return drizzle(sqlClient, { schema: dbSchema });
}

export async function discoverPrelaunchQaAdminUsers(
  db: PrelaunchQaDatabase,
  adminUserId: string,
) {
  const rows = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .leftJoin(memberships, eq(memberships.userId, users.id))
    .where(
      and(
        eq(users.id, adminUserId),
        isNull(users.anonymizedAt),
        or(
          eq(users.platformRole, "platform_owner"),
          and(
            eq(memberships.role, "org_admin"),
            eq(memberships.accountStatus, "connected"),
            eq(memberships.status, "approved"),
          ),
        ),
        sql`lower(${users.email}) NOT LIKE ${`%@${PRELAUNCH_QA.emailDomain}`}`,
      ),
    )
    .orderBy(users.id);
  if (!rows.length) {
    throw new Error("The selected admin user is not an existing connected administrator.");
  }
  return rows satisfies PrelaunchQaAdminUser[];
}

function hasClerkMembershipState(membership: typeof memberships.$inferSelect) {
  return Boolean(
    membership.clerkMembershipId ||
      membership.clerkRole ||
      membership.clerkInvitationId ||
      membership.clerkInvitationStatus ||
      membership.clerkInvitationError ||
      membership.clerkInvitationUpdatedAt,
  );
}

function isPreservablePrelaunchQaAdmin(
  membership: typeof memberships.$inferSelect,
  syntheticUserIds: Set<string>,
) {
  return (
    membership.orgId === PRELAUNCH_QA.orgId &&
    !syntheticUserIds.has(membership.userId) &&
    membership.role === "org_admin" &&
    membership.accountStatus === "connected" &&
    membership.status === "approved" &&
    !hasClerkMembershipState(membership)
  );
}

export function validatePrelaunchQaMembershipNamespace(
  existingMemberships: Array<typeof memberships.$inferSelect>,
  rows: PrelaunchQaRows,
) {
  const desiredMembershipByUser = new Map(
    rows.memberships.map((membership) => [membership.userId, membership]),
  );
  const desiredMembershipById = new Map(
    rows.memberships.map((membership) => [membership.id, membership]),
  );
  const syntheticUserIds = new Set(rows.syntheticUserIds);
  let preservedAdminCount = 0;

  for (const membership of existingMemberships) {
    const expectedById = desiredMembershipById.get(membership.id);
    if (
      expectedById &&
      (expectedById.orgId !== membership.orgId || expectedById.userId !== membership.userId)
    ) {
      throw new Error("A deterministic QA membership id collides with non-QA data.");
    }
    if (syntheticUserIds.has(membership.userId) && membership.orgId !== PRELAUNCH_QA.orgId) {
      throw new Error("A QA synthetic user belongs to an organization outside the QA namespace.");
    }
    if (membership.orgId === PRELAUNCH_QA.orgId && hasClerkMembershipState(membership)) {
      if (syntheticUserIds.has(membership.userId)) {
        throw new Error(
          "A QA synthetic membership has Clerk state; refusing database-only seed writes.",
        );
      }
      throw new Error("A QA admin membership has Clerk state; refusing database-only seed writes.");
    }
    if (membership.orgId !== PRELAUNCH_QA.orgId) continue;

    const expected = desiredMembershipByUser.get(membership.userId);
    if (expected?.id === membership.id) continue;
    if (isPreservablePrelaunchQaAdmin(membership, syntheticUserIds)) {
      preservedAdminCount += 1;
      continue;
    }
    throw new Error(
      "The QA membership namespace contains an unexpected member; only existing connected and approved org admins may be preserved.",
    );
  }
  return { preservedAdminCount };
}

export async function inspectPrelaunchQaNamespace(
  db: PrelaunchQaQueryExecutor,
  rows: PrelaunchQaRows,
): Promise<PrelaunchQaNamespaceInspection> {
  const organizationRows = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      clerkOrgId: organizations.clerkOrgId,
    })
    .from(organizations)
    .where(
      or(
        eq(organizations.id, PRELAUNCH_QA.orgId),
        eq(organizations.slug, PRELAUNCH_QA.orgSlug),
      ),
    );
  if (
    organizationRows.some(
      (row) => row.id !== PRELAUNCH_QA.orgId || row.slug !== PRELAUNCH_QA.orgSlug,
    )
  ) {
    throw new Error("The fixed QA organization id or slug collides with non-QA data.");
  }
  if (organizationRows.some((row) => Boolean(row.clerkOrgId))) {
    throw new Error("The QA organization is linked to Clerk; refusing database-only seed writes.");
  }

  const fixedSpaceIds = new Set([PRELAUNCH_QA.mainSpaceId, PRELAUNCH_QA.testSpaceId]);
  const fixedSpaceById = new Map(rows.spaces.map((space) => [space.id, space]));
  const existingSpaces = await db
    .select({ id: spaces.id, orgId: spaces.orgId, slug: spaces.slug, kind: spaces.kind })
    .from(spaces)
    .where(
      or(
        eq(spaces.orgId, PRELAUNCH_QA.orgId),
        inArray(spaces.id, [...fixedSpaceIds]),
      ),
    );
  for (const space of existingSpaces) {
    const expected = fixedSpaceById.get(space.id);
    if (
      !expected ||
      space.orgId !== PRELAUNCH_QA.orgId ||
      space.slug !== expected.slug ||
      space.kind !== expected.kind
    ) {
      throw new Error("The fixed QA Space namespace contains an unexpected or colliding Space.");
    }
  }

  const desiredUserById = new Map(rows.users.map((user) => [user.id, user]));
  const desiredUserByEmail = new Map(rows.users.map((user) => [user.email.toLowerCase(), user]));
  const desiredEmails = rows.users.map((user) => user.email.toLowerCase());
  const existingUsers = await db
    .select()
    .from(users)
    .where(
      or(
        inArray(users.id, rows.syntheticUserIds),
        inArray(sql<string>`lower(${users.email})`, desiredEmails),
        like(users.id, "qa_usr_%"),
        sql`lower(${users.email}) LIKE ${`%@${PRELAUNCH_QA.emailDomain}`}`,
      ),
    );
  for (const user of existingUsers) {
    const expectedById = desiredUserById.get(user.id);
    const expectedByEmail = desiredUserByEmail.get(user.email.toLowerCase());
    if (!expectedById || !expectedByEmail || expectedById.id !== expectedByEmail.id) {
      throw new Error("The QA synthetic-user namespace differs from the requested input; cleanup first.");
    }
    if (user.clerkUserId || user.anonymizedAt) {
      throw new Error("A QA synthetic user is linked to Clerk or anonymized; refusing to overwrite it.");
    }
  }

  if (rows.syntheticUserIds.length) {
    const syntheticAccounts = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(inArray(accounts.userId, rows.syntheticUserIds));
    if (syntheticAccounts.length) {
      throw new Error("QA synthetic users unexpectedly have authentication accounts.");
    }
  }

  const membershipUsers = [...new Set(rows.memberships.map((membership) => membership.userId))];
  const existingMemberships = await db
    .select()
    .from(memberships)
    .where(
      or(
        inArray(
          memberships.id,
          rows.memberships.map((membership) => membership.id),
        ),
        inArray(memberships.userId, membershipUsers),
        eq(memberships.orgId, PRELAUNCH_QA.orgId),
      ),
    );
  const { preservedAdminCount } = validatePrelaunchQaMembershipNamespace(
    existingMemberships,
    rows,
  );

  const profileIds = rows.profiles.map((profile) => profile.id);
  const membershipIds = rows.profiles.map((profile) => profile.membershipId);
  const desiredProfileById = new Map(rows.profiles.map((profile) => [profile.id, profile]));
  const desiredProfileByMembership = new Map(
    rows.profiles.map((profile) => [profile.membershipId, profile]),
  );
  const existingProfiles = await db
    .select({ id: profiles.id, membershipId: profiles.membershipId })
    .from(profiles)
    .where(
      or(inArray(profiles.id, profileIds), inArray(profiles.membershipId, membershipIds)),
    );
  for (const profile of existingProfiles) {
    const byId = desiredProfileById.get(profile.id);
    const byMembership = desiredProfileByMembership.get(profile.membershipId);
    if (!byId || !byMembership || byId.id !== byMembership.id) {
      throw new Error("A deterministic QA profile id or membership conflicts with existing data.");
    }
  }

  const desiredAccessById = new Map(
    rows.spaceMemberships.map((access) => [access.id, access]),
  );
  const existingAccess = await db
    .select({
      id: spaceMemberships.id,
      orgId: spaceMemberships.orgId,
      spaceId: spaceMemberships.spaceId,
      membershipId: spaceMemberships.membershipId,
    })
    .from(spaceMemberships)
    .where(
      or(
        eq(spaceMemberships.orgId, PRELAUNCH_QA.orgId),
        inArray(
          spaceMemberships.id,
          rows.spaceMemberships.map((access) => access.id),
        ),
      ),
    );
  for (const access of existingAccess) {
    const expected = desiredAccessById.get(access.id);
    if (
      !expected ||
      expected.orgId !== access.orgId ||
      expected.spaceId !== access.spaceId ||
      expected.membershipId !== access.membershipId
    ) {
      throw new Error("A QA Space membership is unexpected or collides with non-QA data.");
    }
  }

  const desiredIntentById = new Map(rows.spaceIntents.map((intent) => [intent.id, intent]));
  const existingIntents = await db
    .select({
      id: spaceIntents.id,
      orgId: spaceIntents.orgId,
      spaceId: spaceIntents.spaceId,
      membershipId: spaceIntents.membershipId,
    })
    .from(spaceIntents)
    .where(
      or(
        eq(spaceIntents.orgId, PRELAUNCH_QA.orgId),
        inArray(
          spaceIntents.id,
          rows.spaceIntents.map((intent) => intent.id),
        ),
      ),
    );
  for (const intent of existingIntents) {
    const expected = desiredIntentById.get(intent.id);
    if (
      !expected ||
      expected.orgId !== intent.orgId ||
      expected.spaceId !== intent.spaceId ||
      expected.membershipId !== intent.membershipId
    ) {
      throw new Error("A QA Space intent is unexpected or collides with non-QA data.");
    }
  }

  const desiredConfigById = new Map(rows.matchTypeConfigs.map((config) => [config.id, config]));
  const existingConfigs = await db
    .select({ id: matchTypeConfigs.id, orgId: matchTypeConfigs.orgId, slug: matchTypeConfigs.slug })
    .from(matchTypeConfigs)
    .where(
      or(
        eq(matchTypeConfigs.orgId, PRELAUNCH_QA.orgId),
        inArray(
          matchTypeConfigs.id,
          rows.matchTypeConfigs.map((config) => config.id),
        ),
      ),
    );
  for (const config of existingConfigs) {
    const expected = desiredConfigById.get(config.id);
    if (!expected || expected.orgId !== config.orgId || expected.slug !== config.slug) {
      throw new Error("A QA match configuration is unexpected or collides with non-QA data.");
    }
  }

  return {
    existingOrganization: organizationRows.length === 1,
    existingSyntheticUsers: existingUsers.length,
    existingProfiles: existingProfiles.length,
    adminUsers: rows.adminMembershipIds.length + preservedAdminCount,
  };
}

function omitKeys<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  const copy: Partial<T> = { ...value };
  for (const key of keys) delete copy[key];
  return copy as Omit<T, K>;
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function seedStateFingerprint(value: object, runtimeKeys: readonly string[]) {
  const runtimeKeySet = new Set(runtimeKeys);
  const seededState = Object.fromEntries(
    Object.entries(value).filter(([key]) => !runtimeKeySet.has(key)),
  );
  return createHash("sha256").update(stableSerialize(seededState)).digest("hex");
}

const profileEmbeddingRuntimeKeys = [
  "seekingEmbeddingText",
  "offeringEmbeddingText",
  "seekingEmbedding",
  "offeringEmbedding",
  "embeddingModel",
  "embeddingSourceHash",
  "embeddingStatus",
  "embeddingError",
  "embeddingUpdatedAt",
] as const;

const profileSeedRuntimeKeys = [
  "createdAt",
  "updatedAt",
  "lastActiveAt",
  ...profileEmbeddingRuntimeKeys,
] as const;

const unchangedProfileUpdateRuntimeKeys = [
  "updatedAt",
  "lastActiveAt",
  ...profileEmbeddingRuntimeKeys,
] as const;

const intentEmbeddingRuntimeKeys = [
  "seekingText",
  "offeringText",
  "seekingEmbedding",
  "offeringEmbedding",
  "embeddingModel",
  "embeddingSourceHash",
  "embeddingStatus",
  "embeddingError",
  "embeddingUpdatedAt",
] as const;

const intentSeedRuntimeKeys = [
  "createdAt",
  "updatedAt",
  ...intentEmbeddingRuntimeKeys,
] as const;

const unchangedIntentUpdateRuntimeKeys = [
  "updatedAt",
  ...intentEmbeddingRuntimeKeys,
] as const;

export function prelaunchQaProfileSeedFingerprint(
  profile: ProfileInsert | typeof profiles.$inferSelect,
) {
  return seedStateFingerprint(profile, profileSeedRuntimeKeys);
}

export function prelaunchQaIntentSeedFingerprint(
  intent: SpaceIntentInsert | typeof spaceIntents.$inferSelect,
) {
  return seedStateFingerprint(intent, intentSeedRuntimeKeys);
}

function updateSetWithoutIdentityAndCreatedAt<
  T extends { id: string; createdAt?: unknown },
>(row: T) {
  return omitKeys(row, ["id", "createdAt"] as const);
}

export function prelaunchQaProfileConflictUpdate(
  profile: ProfileInsert,
  matchingInputChanged: boolean,
) {
  const baseUpdate = updateSetWithoutIdentityAndCreatedAt(profile);
  return matchingInputChanged
    ? baseUpdate
    : omitKeys(baseUpdate, unchangedProfileUpdateRuntimeKeys);
}

export function prelaunchQaIntentConflictUpdate(
  intent: SpaceIntentInsert,
  matchingInputChanged: boolean,
) {
  const baseUpdate = updateSetWithoutIdentityAndCreatedAt(intent);
  return matchingInputChanged
    ? baseUpdate
    : omitKeys(baseUpdate, unchangedIntentUpdateRuntimeKeys);
}

export async function seedPrelaunchQa(db: PrelaunchQaDatabase, rows: PrelaunchQaRows) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${PRELAUNCH_QA.namespace}))`);
    await inspectPrelaunchQaNamespace(tx, rows);
    const desiredAdminMembershipIds = new Set(rows.adminMembershipIds);
    const desiredAdminUserIds = rows.memberships
      .filter((membership) => desiredAdminMembershipIds.has(membership.id))
      .map((membership) => membership.userId);

    const [
      storedProfiles,
      storedIntents,
      storedConfigs,
      storedMemberships,
      storedSpaces,
      storedSpaceMemberships,
    ] = await Promise.all([
      tx
        .select()
        .from(profiles)
        .where(inArray(profiles.id, rows.profiles.map((profile) => profile.id))),
      tx
        .select()
        .from(spaceIntents)
        .where(inArray(spaceIntents.id, rows.spaceIntents.map((intent) => intent.id))),
      tx
        .select()
        .from(matchTypeConfigs)
        .where(inArray(matchTypeConfigs.id, rows.matchTypeConfigs.map((config) => config.id))),
      tx
        .select()
        .from(memberships)
        .where(
          or(
            inArray(memberships.id, rows.memberships.map((membership) => membership.id)),
            and(
              eq(memberships.orgId, PRELAUNCH_QA.orgId),
              inArray(memberships.userId, desiredAdminUserIds),
            ),
          ),
        ),
      tx
        .select()
        .from(spaces)
        .where(inArray(spaces.id, rows.spaces.map((space) => space.id))),
      tx
        .select()
        .from(spaceMemberships)
        .where(
          inArray(
            spaceMemberships.id,
            rows.spaceMemberships.map((access) => access.id),
          ),
        ),
    ]);
    const storedProfileById = new Map(storedProfiles.map((profile) => [profile.id, profile]));
    const storedIntentById = new Map(storedIntents.map((intent) => [intent.id, intent]));
    const storedConfigById = new Map(storedConfigs.map((config) => [config.id, config]));
    const storedMembershipById = new Map(
      storedMemberships.map((membership) => [membership.id, membership]),
    );
    const storedMembershipByUser = new Map(
      storedMemberships
        .filter((membership) => membership.orgId === PRELAUNCH_QA.orgId)
        .map((membership) => [membership.userId, membership]),
    );
    const storedMembershipForDesired = (membership: MembershipInsert) =>
      storedMembershipById.get(membership.id) ??
      (desiredAdminMembershipIds.has(membership.id)
        ? storedMembershipByUser.get(membership.userId)
        : undefined);
    const resolvedAdminMembershipId = new Map(
      rows.memberships
        .filter((membership) => desiredAdminMembershipIds.has(membership.id))
        .map((membership) => [
          membership.id,
          storedMembershipByUser.get(membership.userId)?.id ?? membership.id,
        ]),
    );
    const storedSpaceById = new Map(storedSpaces.map((space) => [space.id, space]));
    const storedSpaceMembershipById = new Map(
      storedSpaceMemberships.map((access) => [access.id, access]),
    );
    const changedProfileIds = new Set(
      rows.profiles
        .filter((profile) => {
          const stored = storedProfileById.get(profile.id);
          return (
            !stored ||
            prelaunchQaProfileSeedFingerprint(stored) !==
              prelaunchQaProfileSeedFingerprint(profile)
          );
        })
        .map((profile) => profile.id),
    );
    const changedIntentIds = new Set(
      rows.spaceIntents
        .filter((intent) => {
          const stored = storedIntentById.get(intent.id);
          return (
            !stored ||
            prelaunchQaIntentSeedFingerprint(stored) !==
              prelaunchQaIntentSeedFingerprint(intent)
          );
        })
        .map((intent) => intent.id),
    );
    const configsChanged = rows.matchTypeConfigs.some((config) => {
      const stored = storedConfigById.get(config.id);
      return (
        !stored ||
        seedStateFingerprint(stored, ["createdAt", "updatedAt"]) !==
          seedStateFingerprint(config, ["createdAt", "updatedAt"])
      );
    });
    const eligibilityInputsChanged =
      rows.memberships.some((membership) => {
        const stored = storedMembershipForDesired(membership);
        return (
          !stored ||
          stableSerialize({
            orgId: stored.orgId,
            userId: stored.userId,
            accountStatus: stored.accountStatus,
            status: stored.status,
            mentorStatus: stored.mentorStatus,
          }) !==
            stableSerialize({
              orgId: membership.orgId,
              userId: membership.userId,
              accountStatus: membership.accountStatus,
              status: membership.status,
              mentorStatus: membership.mentorStatus,
            })
        );
      }) ||
      rows.spaces.some((space) => {
        const stored = storedSpaceById.get(space.id);
        return (
          !stored ||
          stableSerialize({
            orgId: stored.orgId,
            kind: stored.kind,
            lifecycle: stored.lifecycle,
            matchingEnabled: stored.matchingEnabled,
          }) !==
            stableSerialize({
              orgId: space.orgId,
              kind: space.kind,
              lifecycle: space.lifecycle,
              matchingEnabled: space.matchingEnabled,
            })
        );
      }) ||
      rows.spaceMemberships.some((access) => {
        const stored = storedSpaceMembershipById.get(access.id);
        return (
          !stored ||
          stableSerialize({
            orgId: stored.orgId,
            spaceId: stored.spaceId,
            membershipId: stored.membershipId,
            accessStatus: stored.accessStatus,
          }) !==
            stableSerialize({
              orgId: access.orgId,
              spaceId: access.spaceId,
              membershipId: access.membershipId,
              accessStatus: access.accessStatus,
            })
        );
      });
    const matchingInputsChanged =
      changedProfileIds.size > 0 ||
      changedIntentIds.size > 0 ||
      configsChanged ||
      eligibilityInputsChanged;

    await tx
      .insert(organizations)
      .values(rows.organization)
      .onConflictDoUpdate({
        target: organizations.id,
        set: updateSetWithoutIdentityAndCreatedAt(rows.organization),
      });

    for (const user of rows.users) {
      await tx
        .insert(users)
        .values(user)
        .onConflictDoUpdate({
          target: users.id,
          set: updateSetWithoutIdentityAndCreatedAt(user),
        });
    }
    for (const membership of rows.memberships) {
      const preservedAdmin = desiredAdminMembershipIds.has(membership.id)
        ? storedMembershipByUser.get(membership.userId)
        : undefined;
      // Existing connected QA admins are access-control state, not seed data.
      // Preserve the complete row even when it already uses our deterministic id.
      if (preservedAdmin) continue;
      await tx
        .insert(memberships)
        .values(membership)
        .onConflictDoUpdate({
          target: memberships.id,
          set: updateSetWithoutIdentityAndCreatedAt(membership),
        });
    }
    for (const space of rows.spaces) {
      const resolvedCreatorMembershipId = space.createdByMembershipId
        ? resolvedAdminMembershipId.get(space.createdByMembershipId) ?? space.createdByMembershipId
        : undefined;
      const spaceForWrite = {
        ...space,
        ...(resolvedCreatorMembershipId
          ? { createdByMembershipId: resolvedCreatorMembershipId }
          : {}),
      } satisfies SpaceInsert;
      await tx
        .insert(spaces)
        .values(spaceForWrite)
        .onConflictDoUpdate({
          target: spaces.id,
          set: updateSetWithoutIdentityAndCreatedAt(spaceForWrite),
        });
    }
    for (const config of rows.matchTypeConfigs) {
      await tx
        .insert(matchTypeConfigs)
        .values(config)
        .onConflictDoUpdate({
          target: matchTypeConfigs.id,
          set: updateSetWithoutIdentityAndCreatedAt(config),
        });
    }
    for (const profile of rows.profiles) {
      await tx
        .insert(profiles)
        .values(profile)
        .onConflictDoUpdate({
          target: profiles.id,
          set: prelaunchQaProfileConflictUpdate(
            profile,
            changedProfileIds.has(profile.id),
          ),
        });
    }
    for (const access of rows.spaceMemberships) {
      await tx
        .insert(spaceMemberships)
        .values(access)
        .onConflictDoUpdate({
          target: spaceMemberships.id,
          set: updateSetWithoutIdentityAndCreatedAt(access),
        });
    }
    for (const intent of rows.spaceIntents) {
      await tx
        .insert(spaceIntents)
        .values(intent)
        .onConflictDoUpdate({
          target: spaceIntents.id,
          set: prelaunchQaIntentConflictUpdate(
            intent,
            changedIntentIds.has(intent.id),
          ),
        });
    }
    return {
      matchingInputsChanged,
      // Kept for callers transitioning from v1. Matching outputs are now
      // preserved until the store atomically replaces them after recompute.
      matchingOutputsReset: false,
    };
  });
}

async function deleteCount<T extends { id: string }>(promise: Promise<T[]>) {
  return (await promise).length;
}

export async function cleanupPrelaunchQa(
  db: PrelaunchQaDatabase,
): Promise<PrelaunchQaCleanupResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${PRELAUNCH_QA.namespace}))`);
    await tx.execute(
      sql`LOCK TABLE organizations, users, memberships, accounts IN SHARE ROW EXCLUSIVE MODE`,
    );
    const orgRows = await tx
      .select({
        id: organizations.id,
        slug: organizations.slug,
        clerkOrgId: organizations.clerkOrgId,
      })
      .from(organizations)
      .where(
        or(
          eq(organizations.id, PRELAUNCH_QA.orgId),
          eq(organizations.slug, PRELAUNCH_QA.orgSlug),
        ),
      );
    if (
      orgRows.some(
        (row) => row.id !== PRELAUNCH_QA.orgId || row.slug !== PRELAUNCH_QA.orgSlug,
      )
    ) {
      throw new Error("Cleanup stopped because the QA organization id or slug collides.");
    }
    if (orgRows.some((row) => Boolean(row.clerkOrgId))) {
      throw new Error(
        "Cleanup stopped because the QA organization is linked to Clerk; unlink it explicitly first.",
      );
    }

    const qaClerkMemberships = await tx
      .select()
      .from(memberships)
      .where(eq(memberships.orgId, PRELAUNCH_QA.orgId));
    if (qaClerkMemberships.some(hasClerkMembershipState)) {
      throw new Error(
        "Cleanup stopped because a QA membership has Clerk state; reconcile Clerk explicitly first.",
      );
    }

    const syntheticManifest = expectedSyntheticUserManifest();
    const expectedSyntheticUserIds = [...syntheticManifest.keys()];
    const syntheticUsers = await tx
      .select({ id: users.id, email: users.email, clerkUserId: users.clerkUserId })
      .from(users)
      .innerJoin(
        memberships,
        and(
          eq(memberships.userId, users.id),
          eq(memberships.orgId, PRELAUNCH_QA.orgId),
        ),
      )
      .where(
        inArray(users.id, expectedSyntheticUserIds),
      );
    const syntheticUserIds = syntheticUsers.map((user) => user.id);
    if (
      syntheticUsers.some(
        (user) => syntheticManifest.get(user.id) !== user.email.toLowerCase(),
      )
    ) {
      throw new Error("Cleanup stopped because a deterministic QA user identity does not match its manifest.");
    }
    if (syntheticUsers.some((user) => Boolean(user.clerkUserId))) {
      throw new Error("Cleanup stopped because a QA synthetic user is linked to Clerk.");
    }
    if (syntheticUserIds.length) {
      const externalMemberships = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            inArray(memberships.userId, syntheticUserIds),
            ne(memberships.orgId, PRELAUNCH_QA.orgId),
          ),
        );
      const authenticationAccounts = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(inArray(accounts.userId, syntheticUserIds));
      if (externalMemberships.length || authenticationAccounts.length) {
        throw new Error(
          "Cleanup stopped because a QA synthetic user has external membership or auth data.",
        );
      }
    }

    const qaMembershipIds = tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.orgId, PRELAUNCH_QA.orgId));
    const qaProfileIds = tx
      .select({ id: profiles.id })
      .from(profiles)
      .innerJoin(memberships, eq(memberships.id, profiles.membershipId))
      .where(eq(memberships.orgId, PRELAUNCH_QA.orgId));
    const qaPostIds = tx
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.orgId, PRELAUNCH_QA.orgId));

    await tx.delete(matchFeedback).where(eq(matchFeedback.orgId, PRELAUNCH_QA.orgId));
    const matchesDeleted = await deleteCount(
      tx
        .delete(matches)
        .where(eq(matches.orgId, PRELAUNCH_QA.orgId))
        .returning({ id: matches.id }),
    );
    await tx.delete(introRequests).where(eq(introRequests.orgId, PRELAUNCH_QA.orgId));
    await tx.delete(notifications).where(eq(notifications.orgId, PRELAUNCH_QA.orgId));
    await tx.delete(analyticsEvents).where(eq(analyticsEvents.orgId, PRELAUNCH_QA.orgId));
    await tx.delete(adminActions).where(eq(adminActions.orgId, PRELAUNCH_QA.orgId));
    await tx.delete(reports).where(eq(reports.orgId, PRELAUNCH_QA.orgId));
    await tx
      .delete(comments)
      .where(
        or(
          inArray(comments.postId, qaPostIds),
          inArray(comments.authorMembershipId, qaMembershipIds),
        ),
      );
    await tx.delete(postSaves).where(eq(postSaves.orgId, PRELAUNCH_QA.orgId));
    await tx.delete(follows).where(eq(follows.orgId, PRELAUNCH_QA.orgId));
    await tx.delete(posts).where(eq(posts.orgId, PRELAUNCH_QA.orgId));
    const matchRunsDeleted = await deleteCount(
      tx
        .delete(matchRuns)
        .where(eq(matchRuns.orgId, PRELAUNCH_QA.orgId))
        .returning({ id: matchRuns.id }),
    );
    const spaceIntentsDeleted = await deleteCount(
      tx
        .delete(spaceIntents)
        .where(eq(spaceIntents.orgId, PRELAUNCH_QA.orgId))
        .returning({ id: spaceIntents.id }),
    );
    const spaceMembershipsDeleted = await deleteCount(
      tx
        .delete(spaceMemberships)
        .where(eq(spaceMemberships.orgId, PRELAUNCH_QA.orgId))
        .returning({ id: spaceMemberships.id }),
    );
    await tx.delete(cohortMembers).where(eq(cohortMembers.orgId, PRELAUNCH_QA.orgId));
    await tx.delete(cohorts).where(eq(cohorts.orgId, PRELAUNCH_QA.orgId));
    await tx.delete(matchTypeConfigs).where(eq(matchTypeConfigs.orgId, PRELAUNCH_QA.orgId));
    await tx.delete(profileLinks).where(inArray(profileLinks.profileId, qaProfileIds));
    const profilesDeleted = await deleteCount(
      tx
        .delete(profiles)
        .where(inArray(profiles.membershipId, qaMembershipIds))
        .returning({ id: profiles.id }),
    );
    const spacesDeleted = await deleteCount(
      tx
        .delete(spaces)
        .where(eq(spaces.orgId, PRELAUNCH_QA.orgId))
        .returning({ id: spaces.id }),
    );
    const membershipsDeleted = await deleteCount(
      tx
        .delete(memberships)
        .where(eq(memberships.orgId, PRELAUNCH_QA.orgId))
        .returning({ id: memberships.id }),
    );
    const syntheticUsersDeleted = syntheticUserIds.length
      ? await deleteCount(
          tx.delete(users).where(inArray(users.id, syntheticUserIds)).returning({ id: users.id }),
        )
      : 0;
    const organizationDeleted = await deleteCount(
      tx
        .delete(organizations)
        .where(
          and(
            eq(organizations.id, PRELAUNCH_QA.orgId),
            eq(organizations.slug, PRELAUNCH_QA.orgSlug),
          ),
        )
        .returning({ id: organizations.id }),
    );

    return {
      organizationDeleted,
      syntheticUsersDeleted,
      membershipsDeleted,
      profilesDeleted,
      spacesDeleted,
      spaceMembershipsDeleted,
      spaceIntentsDeleted,
      matchesDeleted,
      matchRunsDeleted,
    };
  });
}

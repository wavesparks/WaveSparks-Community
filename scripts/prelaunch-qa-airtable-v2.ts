import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  containsPrelaunchQaContactIdentifier,
  stripPrelaunchQaContactIdentifiers as stripContactIdentifiers,
} from "./prelaunch-qa-contact-safety";
import { parsePrelaunchQaInput, type PrelaunchQaInput } from "./prelaunch-qa-core";

export { stripContactIdentifiers };

const DEFAULT_PATHS = {
  real: "/tmp/wavesparks-airtable-real-profiles-20260715-c.json",
  oldRaw: "/tmp/wavesparks-prelaunch-airtable-raw.json",
  oldCache: "/tmp/wavesparks-prelaunch-sanitized-cache.json",
  oldInput: "/tmp/wavesparks-prelaunch-input.json",
  output: "/tmp/wavesparks-prelaunch-real-input-v2.json",
} as const;

export const AIRTABLE_PROFILE_FIELDS = {
  participant: {
    familyName: "fld7cTEWVY73HTg7v",
    givenName: "fldW86sbEeA0dlfbS",
    problem: "fldl6SIHnIPf17Dvl",
    skills: "fld4VhRKsaqFIpxSN",
    archetypes: "fldmf6buTv4cVNO8Y",
    track: "fldtxCoWNObRV0gL6",
  },
  mentor: {
    // Calendar and social-link fields are intentionally absent from this mapping.
    title: "fldApytgSXMiJNzmI",
    expertise: "fldDGWtmwz8AKewC0",
    mentorTypes: "fldFWlhGpWHD7a1V0",
    fullName: "fldP32FOC0tZi1MaB",
    fullNameFallback: "fldZG9FOfqWojXuGV",
    topic: "fldRv78aNFaSaftys",
    industries: "fldUZi38sRXA8c745",
    bio: "flddLAmUakcBHpE4P",
    socialCauses: "fldgJu79ZkfSEmUeR",
    organization: "fldp68Jbve3nHOSGC",
  },
} as const;

const EXPECTED_PARTICIPANTS = 50;
const EXPECTED_MENTOR_CANDIDATES = 39;
const EXPECTED_MENTORS = 10;
const PRIVATE_MODE = 0o600;
const MAX_PRIVATE_JSON_BYTES = 4 * 1024 * 1024;

type JsonObject = Record<string, unknown>;

export interface AirtableRecord {
  id: string;
  createdTime?: string;
  cellValuesByFieldId: Record<string, unknown>;
}

interface RealProfilesCapture {
  capturedAt: string;
  people: { recordsByTableId: Record<string, AirtableRecord[]> };
  mentors: { records: AirtableRecord[] };
}

interface LegacyRawRecord extends JsonObject {
  sourceId: string;
}

interface LegacyRawInput {
  people: LegacyRawRecord[];
  mentorCandidates: LegacyRawRecord[];
}

interface LegacySanitizedRecord extends JsonObject {
  sourceId: string;
}

interface LegacySanitizedCache {
  people: LegacySanitizedRecord[];
  mentors: LegacySanitizedRecord[];
}

interface LegacyQaPerson extends JsonObject {
  sourceId: string;
  kind: "person" | "mentor";
}

interface LegacyQaInput {
  people: LegacyQaPerson[];
}

export interface AirtableV2CliOptions {
  realPath: string;
  oldRawPath: string;
  oldCachePath: string;
  oldInputPath: string;
  outputPath: string;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function parseAirtableRecord(value: unknown, label: string): AirtableRecord {
  const object = requireObject(value, label);
  return {
    id: requireString(object.id, `${label}.id`),
    cellValuesByFieldId: requireObject(
      object.cellValuesByFieldId,
      `${label}.cellValuesByFieldId`,
    ),
    ...(typeof object.createdTime === "string" ? { createdTime: object.createdTime } : {}),
  };
}

function parseLegacySourceRecords(value: unknown, label: string): LegacyRawRecord[] {
  return requireArray(value, label).map((entry, index) => {
    const object = requireObject(entry, `${label}[${index}]`);
    return {
      ...object,
      sourceId: requireString(object.sourceId, `${label}[${index}].sourceId`),
    };
  });
}

function assertUniqueIds(values: Array<{ id?: string; sourceId?: string }>, label: string) {
  const ids = values.map((value) => value.id ?? value.sourceId ?? "");
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new Error(`${label} must contain unique non-empty IDs.`);
  }
}

function parseRealCapture(value: unknown): RealProfilesCapture {
  const object = requireObject(value, "real capture");
  const peopleObject = requireObject(object.people, "real capture.people");
  const recordsByTableId = requireObject(
    peopleObject.recordsByTableId,
    "real capture.people.recordsByTableId",
  );
  const participantRecords = Object.values(recordsByTableId).flatMap((records, tableIndex) =>
    requireArray(records, `real participant table ${tableIndex}`).map((record, recordIndex) =>
      parseAirtableRecord(record, `real participant record ${recordIndex}`),
    ),
  );
  const mentorsObject = requireObject(object.mentors, "real capture.mentors");
  const mentorRecords = requireArray(mentorsObject.records, "real capture.mentors.records").map(
    (record, index) => parseAirtableRecord(record, `real mentor record ${index}`),
  );
  if (participantRecords.length !== 100) {
    throw new Error("Real capture must contain exactly 100 participant records.");
  }
  if (mentorRecords.length !== EXPECTED_MENTOR_CANDIDATES) {
    throw new Error("Real capture must contain exactly 39 mentor records.");
  }
  assertUniqueIds(participantRecords, "real participant records");
  assertUniqueIds(mentorRecords, "real mentor records");
  const capturedAt = requireString(object.capturedAt, "real capture.capturedAt");
  if (Number.isNaN(Date.parse(capturedAt))) {
    throw new Error("real capture.capturedAt must be an ISO timestamp.");
  }
  return {
    capturedAt,
    people: { recordsByTableId: { records: participantRecords } },
    mentors: { records: mentorRecords },
  };
}

function parseLegacyRaw(value: unknown): LegacyRawInput {
  const object = requireObject(value, "legacy raw input");
  const people = parseLegacySourceRecords(object.people, "legacy raw input.people");
  const mentorCandidates = parseLegacySourceRecords(
    object.mentorCandidates,
    "legacy raw input.mentorCandidates",
  );
  if (people.length !== EXPECTED_PARTICIPANTS) {
    throw new Error("Legacy raw input must contain exactly 50 selected participants.");
  }
  if (mentorCandidates.length !== EXPECTED_MENTOR_CANDIDATES) {
    throw new Error("Legacy raw input must contain exactly 39 mentor candidates.");
  }
  assertUniqueIds(people, "legacy raw participants");
  assertUniqueIds(mentorCandidates, "legacy raw mentor candidates");
  return { people, mentorCandidates };
}

function parseLegacyCache(value: unknown): LegacySanitizedCache {
  const object = requireObject(value, "legacy sanitized cache");
  const people = parseLegacySourceRecords(
    object.people,
    "legacy sanitized cache.people",
  ) as LegacySanitizedRecord[];
  const mentors = parseLegacySourceRecords(
    object.mentors,
    "legacy sanitized cache.mentors",
  ) as LegacySanitizedRecord[];
  if (people.length !== EXPECTED_PARTICIPANTS || mentors.length !== EXPECTED_MENTOR_CANDIDATES) {
    throw new Error("Legacy sanitized cache must contain exactly 50 people and 39 mentors.");
  }
  assertUniqueIds(people, "legacy sanitized participants");
  assertUniqueIds(mentors, "legacy sanitized mentors");
  return { people, mentors };
}

function parseLegacyQaInput(value: unknown): LegacyQaInput {
  const object = requireObject(value, "legacy QA input");
  const people = requireArray(object.people, "legacy QA input.people").map((entry, index) => {
    const person = requireObject(entry, `legacy QA input.people[${index}]`);
    const kindValue = person.kind;
    if (kindValue !== "person" && kindValue !== "mentor") {
      throw new Error(`legacy QA input.people[${index}].kind is invalid.`);
    }
    const kind: "person" | "mentor" = kindValue;
    return {
      ...person,
      kind,
      sourceId: requireString(person.sourceId, `legacy QA input.people[${index}].sourceId`),
    };
  });
  if (
    people.filter((person) => person.kind === "person").length !== EXPECTED_PARTICIPANTS ||
    people.filter((person) => person.kind === "mentor").length !== EXPECTED_MENTORS
  ) {
    throw new Error("Legacy QA input must contain exactly 50 people and 10 mentors.");
  }
  return { people };
}

function ensureBelowTmp(value: string, label: string, mustExist: boolean) {
  const resolved = path.resolve(value);
  const realTmp = realpathSync("/tmp");
  const targetForBoundary = mustExist ? realpathSync(resolved) : realpathSync(path.dirname(resolved));
  const relative = path.relative(realTmp, targetForBoundary);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} must be stored below /tmp.`);
  }
  return resolved;
}

export function readPrivateTmpJson(filePath: string, label = "input") {
  const resolved = path.resolve(filePath);
  const info = lstatSync(resolved);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`${label} must be a regular file, not a symlink.`);
  }
  if ((info.mode & 0o777) !== PRIVATE_MODE) {
    throw new Error(`${label} permissions must be exactly 0600.`);
  }
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
    throw new Error(`${label} must be owned by the current user.`);
  }
  if (info.size > MAX_PRIVATE_JSON_BYTES) {
    throw new Error(`${label} must not exceed 4 MiB.`);
  }
  ensureBelowTmp(resolved, label, true);
  try {
    return JSON.parse(readFileSync(resolved, "utf8")) as unknown;
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
}

function legacyCleanString(value: unknown, max = 1_200) {
  return String(value ?? "")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
    .replace(/(?:\+?\d[\d .()-]{7,}\d)/g, "[redacted]")
    .replace(/@[A-Za-z0-9_]{2,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function legacyCleanList(value: unknown, maxItems = 12, maxLength = 100) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(items.map((item) => legacyCleanString(item, maxLength)).filter(Boolean))].slice(
    0,
    maxItems,
  );
}

function legacyRequiredList(value: unknown, fallback: string[], maxItems = 12) {
  const cleaned = legacyCleanList(value, maxItems);
  return cleaned.length ? cleaned : fallback;
}

/** Reproduces the original private preparation script exactly for selection recovery. */
export function normalizeLegacyMentor(item: LegacySanitizedRecord) {
  return {
    sourceId: item.sourceId,
    kind: "mentor" as const,
    headline: legacyCleanString(item.headline, 180) || "Mentor for early-stage builders",
    bio:
      legacyCleanString(item.bio, 800) ||
      "Mentor offering practical, domain-relevant guidance.",
    problemInterest: legacyRequiredList(item.problemSpaceTags, ["early-stage innovation"]).join(
      ", ",
    ),
    currentFocus:
      legacyCleanString(item.mentorshipPreferences, 500) ||
      "Practical mentoring for early-stage teams",
    stage: "mvp",
    industryTags: legacyRequiredList(item.industryTags, ["cross-industry innovation"]),
    problemSpaceTags: legacyRequiredList(item.problemSpaceTags, ["venture development"]),
    skillTags: legacyRequiredList(item.skillTags, ["mentoring"]),
    topStrengths: legacyRequiredList(item.topStrengths, ["practical guidance"]),
    helpNeededTags: ["mentoring engagement"],
    idealMatchDescription:
      "Participants whose current challenge aligns with this mentor's expertise.",
    currentGoal: "Support participants with practical, domain-relevant guidance.",
    lookingFor: ["participants seeking guidance"],
    offers: legacyRequiredList(item.mentorOffers, ["mentor guidance"]),
    mentorExpertiseTags: legacyRequiredList(item.mentorExpertiseTags, ["venture development"]),
    mentorFunctionalStrengths: legacyRequiredList(item.mentorFunctionalStrengths, [
      "structured problem solving",
    ]),
    mentorStageExperience: legacyRequiredList(
      item.mentorStageExperience,
      ["exploring", "idea", "pre-mvp"],
      6,
    ),
    mentorOffers: legacyRequiredList(item.mentorOffers, ["mentor guidance"]),
    mentorshipPreferences:
      legacyCleanString(item.mentorshipPreferences, 500) ||
      "Builders seeking practical guidance on an early-stage challenge.",
    mentorAvailability:
      legacyCleanString(item.mentorAvailability, 120) || "Flexible by arrangement",
    maxMentees: 8,
  };
}

const LEGACY_MENTOR_SIGNATURE_KEYS = [
  "kind",
  "headline",
  "bio",
  "problemInterest",
  "currentFocus",
  "stage",
  "industryTags",
  "problemSpaceTags",
  "skillTags",
  "topStrengths",
  "helpNeededTags",
  "idealMatchDescription",
  "currentGoal",
  "lookingFor",
  "offers",
  "mentorExpertiseTags",
  "mentorFunctionalStrengths",
  "mentorStageExperience",
  "mentorOffers",
  "mentorshipPreferences",
  "mentorAvailability",
  "maxMentees",
] as const;

function legacyMentorSignature(value: JsonObject) {
  return JSON.stringify(
    Object.fromEntries(LEGACY_MENTOR_SIGNATURE_KEYS.map((key) => [key, value[key]])),
  );
}

export function recoverSelectedMentorRecordIds(
  sanitizedCandidates: LegacySanitizedRecord[],
  legacySelectedMentors: LegacyQaPerson[],
) {
  const candidatesBySignature = new Map<string, string[]>();
  for (const candidate of sanitizedCandidates) {
    const signature = legacyMentorSignature(normalizeLegacyMentor(candidate));
    candidatesBySignature.set(signature, [
      ...(candidatesBySignature.get(signature) ?? []),
      candidate.sourceId,
    ]);
  }
  const selected = [...legacySelectedMentors].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId),
  );
  const expectedIds = Array.from(
    { length: EXPECTED_MENTORS },
    (_, index) => `qa-mentor-${String(index + 1).padStart(2, "0")}`,
  );
  if (
    selected.length !== EXPECTED_MENTORS ||
    selected.some((mentor, index) => mentor.sourceId !== expectedIds[index])
  ) {
    throw new Error("Legacy selected mentors must use the exact qa-mentor-01..10 IDs.");
  }
  const recovered = selected.map((mentor) => {
    const candidates = candidatesBySignature.get(legacyMentorSignature(mentor)) ?? [];
    if (candidates.length !== 1) {
      throw new Error(
        `Legacy mentor ${mentor.sourceId} must resolve to exactly one original record; found ${candidates.length}.`,
      );
    }
    return candidates[0];
  });
  if (new Set(recovered).size !== EXPECTED_MENTORS) {
    throw new Error("Legacy mentor selection resolved to duplicate original records.");
  }
  return recovered;
}

function rawCellText(value: unknown): string {
  if (Array.isArray(value)) return value.map(rawCellText).filter(Boolean).join(", ");
  if (isObject(value)) return rawCellText(value.name ?? "");
  return stripContactIdentifiers(value);
}

function cleanText(value: unknown, maxLength = 2_000) {
  return stripContactIdentifiers(rawCellText(value), maxLength);
}

function cleanTags(value: unknown, maxItems = 40) {
  const rawItems = Array.isArray(value)
    ? value.flatMap((entry) => (isObject(entry) ? [entry.name] : [entry]))
    : isObject(value)
      ? [value.name]
      : String(value ?? "").split(/[,;|\n]+/);
  return [...new Set(rawItems.map((entry) => cleanText(entry, 100)).filter(Boolean))].slice(
    0,
    maxItems,
  );
}

function combineTags(...values: unknown[]) {
  return [...new Set(values.flatMap((value) => cleanTags(value)))].slice(0, 40);
}

function requiredText(value: string, label: string, maxLength = 2_000) {
  const cleaned = stripContactIdentifiers(value, maxLength);
  if (cleaned.length < 2) throw new Error(`${label} is missing from the selected Airtable record.`);
  return cleaned;
}

function requiredName(value: string, label: string) {
  const cleaned = stripContactIdentifiers(value, 80);
  if (!cleaned) throw new Error(`${label} is missing from the selected Airtable record.`);
  return cleaned;
}

function requiredTags(value: string[], label: string) {
  if (!value.length) throw new Error(`${label} is missing from the selected Airtable record.`);
  return value;
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

function participantSignals(record: AirtableRecord) {
  const fields = record.cellValuesByFieldId;
  const archetypes = cleanTags(fields[AIRTABLE_PROFILE_FIELDS.participant.archetypes]);
  const skills = cleanTags(fields[AIRTABLE_PROFILE_FIELDS.participant.skills]);
  return { archetypes, skills };
}

const COFOUNDER_ARCHETYPE_TERMS = ["founder", "visionary", "hacker", "hustler"];
const COFOUNDER_SKILL_TERMS = [
  "business",
  "engineering",
  "finance",
  "fundraising",
  "leadership",
  "operations",
  "pitch",
  "product",
  "programming",
  "sales",
  "software",
  "strategy",
];
const COLLABORATOR_ARCHETYPE_TERMS = [
  "creative",
  "designer",
  "hacker",
  "maker",
  "researcher",
];
const COLLABORATOR_SKILL_TERMS = [
  "community",
  "content",
  "data",
  "design",
  "engineering",
  "graphic",
  "marketing",
  "multimedia",
  "product",
  "programming",
  "research",
  "software",
  "video",
];

function keywordScore(values: string[], terms: string[]) {
  const text = values.join(" ").toLocaleLowerCase();
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

export function selectMutualIntentRecordIds(records: AirtableRecord[]) {
  if (records.length !== EXPECTED_PARTICIPANTS) {
    throw new Error("Intent selection requires exactly 50 preserved participant records.");
  }
  assertUniqueIds(records, "intent selection records");
  const ranked = records.map((record) => {
    const signals = participantSignals(record);
    return {
      id: record.id,
      cofounderScore:
        keywordScore(signals.archetypes, COFOUNDER_ARCHETYPE_TERMS) * 100 +
        keywordScore(signals.skills, COFOUNDER_SKILL_TERMS) * 10,
      collaboratorScore:
        keywordScore(signals.archetypes, COLLABORATOR_ARCHETYPE_TERMS) * 100 +
        keywordScore(signals.skills, COLLABORATOR_SKILL_TERMS) * 10,
    };
  });
  const select = (
    key: "cofounderScore" | "collaboratorScore",
    count: number,
    label: string,
  ) => {
    const positive = ranked.filter((entry) => entry[key] > 0);
    if (positive.length < count) {
      throw new Error(
        `${label} intent requires ${count} participants with positive archetype/skill evidence; found ${positive.length}.`,
      );
    }
    return new Set(
      positive
        .sort((left, right) => right[key] - left[key] || left.id.localeCompare(right.id))
        .slice(0, count)
        .map((entry) => entry.id),
    );
  };
  const positiveCandidateCounts = {
    cofounder: ranked.filter((entry) => entry.cofounderScore > 0).length,
    collaborator: ranked.filter((entry) => entry.collaboratorScore > 0).length,
  };
  return {
    cofounder: select("cofounderScore", 30, "Co-founder"),
    collaborator: select("collaboratorScore", 35, "Collaborator"),
    positiveCandidateCounts,
  };
}

function humanMatchTypes(cofounder: boolean, collaborator: boolean) {
  return [
    "Mentor",
    ...(cofounder ? ["Co-founder"] : []),
    ...(collaborator ? ["Collaborator"] : []),
  ];
}

function emptyPreferenceFields() {
  return {
    timeCommitment: "",
    availabilityStart: "",
    remotePreference: "",
    preferredGeographies: [] as string[],
    meetingFrequencyPreference: "",
    ambitionLevel: 0,
    riskTolerance: 0,
    speedPreference: "",
    decisionStyle: "",
    workStyle: "",
    communicationStyle: "",
    conflictStyle: "",
    commitmentHorizon: "",
    missionVsMarketOrientation: "",
    structureVsChaos: 0,
  };
}

function buildParticipant(
  record: AirtableRecord,
  ordinal: number,
  cofounder: boolean,
  collaborator: boolean,
) {
  const position = String(ordinal).padStart(2, "0");
  const fields = record.cellValuesByFieldId;
  const givenName = cleanText(fields[AIRTABLE_PROFILE_FIELDS.participant.givenName], 80);
  const familyName = cleanText(fields[AIRTABLE_PROFILE_FIELDS.participant.familyName], 80);
  const fullName = requiredName(
    [givenName, familyName].filter(Boolean).join(" "),
    `${record.id} full name`,
  );
  const preferredName = givenName || familyName;
  const problem = requiredText(
    cleanText(fields[AIRTABLE_PROFILE_FIELDS.participant.problem]),
    `${record.id} problem statement`,
  );
  const track = requiredText(
    cleanText(fields[AIRTABLE_PROFILE_FIELDS.participant.track], 100),
    `${record.id} track`,
    100,
  );
  const archetypes = requiredTags(
    cleanTags(fields[AIRTABLE_PROFILE_FIELDS.participant.archetypes]),
    `${record.id} archetypes`,
  );
  const skills = requiredTags(
    cleanTags(fields[AIRTABLE_PROFILE_FIELDS.participant.skills]),
    `${record.id} skills`,
  );
  const matchLabels = humanMatchTypes(cofounder, collaborator);
  const mutualMatchTypes = [
    ...(cofounder ? (["cofounder_match"] as const) : []),
    ...(collaborator ? (["collaborator_match"] as const) : []),
  ];
  const headline = requiredText(`${archetypes.join(", ")} · ${track}`, `${record.id} headline`, 300);
  const idealMatchDescription = requiredText(
    `${matchLabels.join(", ")} with complementary experience relevant to ${track}.`,
    `${record.id} ideal match`,
  );
  return {
    sourceId: `qa-participant-${position}`,
    kind: "person" as const,
    fullName,
    email: `qa.participant.${position}@prelaunch-qa.invalid`,
    headline,
    bio: problem,
    problemInterest: problem,
    currentFocus: problem,
    stage: "",
    industryTags: [track],
    problemSpaceTags: requiredTags(combineTags([track], archetypes), `${record.id} problem tags`),
    skillTags: skills,
    topStrengths: skills,
    helpNeededTags: ["Mentor guidance"],
    idealMatchDescription,
    currentGoal: problem,
    lookingFor: matchLabels,
    offers: skills,
    preferredName,
    displayNamePreference: "full_name" as const,
    shortBio: requiredText(problem, `${record.id} short bio`, 300),
    longBio: problem,
    technicalExperienceLevel: "",
    technicalExperience: skills.join(", "),
    city: "",
    country: "",
    timezone: "",
    schoolOrCompany: "",
    currentStatus: archetypes.join(", ").slice(0, 300),
    startupName: "",
    startupOneLiner: "",
    startupDescription: "",
    businessModelTags: [],
    currentProgress: "",
    tractionSummary: "",
    regionFocus: "",
    lookingForTypes: matchLabels,
    seekingMatchTypes: ["mentor_match" as const, ...mutualMatchTypes],
    offeringMatchTypes: mutualMatchTypes,
    desiredRoles: matchLabels,
    canContribute: skills,
    yearsOfExperience: 0,
    priorProjects: "",
    notableWins: "",
    ...emptyPreferenceFields(),
    mentorExpertiseTags: [],
    mentorFunctionalStrengths: [],
    mentorStageExperience: [],
    mentorOffers: [],
    mentorshipPreferences: "",
    mentorAvailability: "",
    maxMentees: null,
  };
}

function buildMentor(record: AirtableRecord, ordinal: number) {
  const position = String(ordinal).padStart(2, "0");
  const fields = record.cellValuesByFieldId;
  const fullName = requiredName(
    cleanText(
      fields[AIRTABLE_PROFILE_FIELDS.mentor.fullName] ??
        fields[AIRTABLE_PROFILE_FIELDS.mentor.fullNameFallback],
      80,
    ),
    `${record.id} mentor name`,
  );
  const title = cleanText(fields[AIRTABLE_PROFILE_FIELDS.mentor.title], 300);
  const organization = cleanText(fields[AIRTABLE_PROFILE_FIELDS.mentor.organization], 300);
  const mentorTypes = cleanTags(fields[AIRTABLE_PROFILE_FIELDS.mentor.mentorTypes]);
  const expertise = combineTags(
    fields[AIRTABLE_PROFILE_FIELDS.mentor.expertise],
    fields[AIRTABLE_PROFILE_FIELDS.mentor.topic],
  );
  const industries = cleanTags(fields[AIRTABLE_PROFILE_FIELDS.mentor.industries]);
  const socialCauses = cleanTags(fields[AIRTABLE_PROFILE_FIELDS.mentor.socialCauses]);
  const capabilityTags = requiredTags(
    combineTags(expertise, industries, socialCauses, mentorTypes),
    `${record.id} mentor capabilities`,
  );
  const bio = requiredText(
    cleanText(fields[AIRTABLE_PROFILE_FIELDS.mentor.bio]),
    `${record.id} mentor bio`,
  );
  const headline = requiredText(
    [title, organization].filter(Boolean).join(" · ") || mentorTypes.join(", "),
    `${record.id} mentor headline`,
    300,
  );
  const problemInterest = requiredText(
    [...socialCauses, ...industries, ...expertise].join(", "),
    `${record.id} mentor focus`,
  );
  const currentFocus = requiredText(
    [...expertise, ...industries, ...socialCauses].join(", "),
    `${record.id} mentor current focus`,
  );
  const idealMatchDescription = requiredText(
    `Participants seeking mentorship in ${capabilityTags.slice(0, 6).join(", ")}.`,
    `${record.id} mentor ideal match`,
  );
  return {
    sourceId: `qa-mentor-${position}`,
    kind: "mentor" as const,
    fullName,
    email: `qa.mentor.${position}@prelaunch-qa.invalid`,
    headline,
    bio,
    problemInterest,
    currentFocus,
    stage: "",
    industryTags: requiredTags(
      industries.length ? industries : capabilityTags,
      `${record.id} industries`,
    ),
    problemSpaceTags: requiredTags(
      combineTags(socialCauses, industries, expertise),
      `${record.id} problem tags`,
    ),
    skillTags: capabilityTags,
    topStrengths: capabilityTags,
    helpNeededTags: ["Mentoring engagement"],
    idealMatchDescription,
    currentGoal: currentFocus,
    lookingFor: ["Participants seeking mentorship"],
    offers: capabilityTags,
    preferredName: firstName(fullName),
    displayNamePreference: "full_name" as const,
    shortBio: requiredText(bio, `${record.id} mentor short bio`, 300),
    longBio: bio,
    technicalExperienceLevel: "",
    technicalExperience: bio,
    city: "",
    country: "",
    timezone: "",
    schoolOrCompany: organization,
    currentStatus: title,
    startupName: "",
    startupOneLiner: "",
    startupDescription: "",
    businessModelTags: [],
    currentProgress: "",
    tractionSummary: "",
    regionFocus: "",
    lookingForTypes: [],
    seekingMatchTypes: [],
    offeringMatchTypes: ["mentor_match" as const],
    desiredRoles: ["Participants seeking mentorship"],
    canContribute: capabilityTags,
    yearsOfExperience: 0,
    priorProjects: bio,
    notableWins: "",
    ...emptyPreferenceFields(),
    mentorExpertiseTags: capabilityTags,
    mentorFunctionalStrengths: expertise.length ? expertise : capabilityTags,
    mentorStageExperience: [],
    mentorOffers: capabilityTags,
    mentorshipPreferences: problemInterest,
    mentorAvailability: "",
    maxMentees: null,
  };
}

function assertPreservedOrder(
  raw: Array<{ sourceId: string }>,
  cached: Array<{ sourceId: string }>,
  label: string,
) {
  if (
    raw.length !== cached.length ||
    raw.some((record, index) => record.sourceId !== cached[index]?.sourceId)
  ) {
    throw new Error(`${label} record ID order changed between legacy artifacts.`);
  }
}

function assertNoContactIdentifiers(input: PrelaunchQaInput) {
  const serialized = JSON.stringify(input.people);
  const withoutSyntheticEmails = serialized.replace(
    /qa\.(?:participant|mentor)\.\d{2}@prelaunch-qa\.invalid/gi,
    "",
  );
  if (containsPrelaunchQaContactIdentifier(withoutSyntheticEmails)) {
    throw new Error("Converted profile data contains a contact identifier.");
  }
}

interface AirtableV2BuildValues {
  real: unknown;
  oldRaw: unknown;
  oldCache: unknown;
  oldInput: unknown;
}

function buildAirtableV2InputWithAudit(values: AirtableV2BuildValues) {
  const real = parseRealCapture(values.real);
  const oldRaw = parseLegacyRaw(values.oldRaw);
  const oldCache = parseLegacyCache(values.oldCache);
  const oldInput = parseLegacyQaInput(values.oldInput);
  assertPreservedOrder(oldRaw.people, oldCache.people, "Participant");
  assertPreservedOrder(oldRaw.mentorCandidates, oldCache.mentors, "Mentor candidate");

  const realParticipants = Object.values(real.people.recordsByTableId).flat();
  const realParticipantsById = new Map(realParticipants.map((record) => [record.id, record]));
  const preservedParticipants = oldRaw.people.map((record) => {
    const realRecord = realParticipantsById.get(record.sourceId);
    if (!realRecord) throw new Error("A preserved participant record is missing from the real capture.");
    return realRecord;
  });
  const intents = selectMutualIntentRecordIds(preservedParticipants);

  const legacyMentors = oldInput.people.filter((person) => person.kind === "mentor");
  const selectedMentorRecordIds = recoverSelectedMentorRecordIds(oldCache.mentors, legacyMentors);
  const realMentorsById = new Map(real.mentors.records.map((record) => [record.id, record]));
  const selectedMentors = selectedMentorRecordIds.map((recordId) => {
    const realRecord = realMentorsById.get(recordId);
    if (!realRecord) throw new Error("A preserved mentor record is missing from the real capture.");
    return realRecord;
  });

  const people = [
    ...preservedParticipants.map((record, index) =>
      buildParticipant(
        record,
        index + 1,
        intents.cofounder.has(record.id),
        intents.collaborator.has(record.id),
      ),
    ),
    ...selectedMentors.map((record, index) => buildMentor(record, index + 1)),
  ];
  const candidate = {
    version: 2 as const,
    dataPolicy: "public_airtable_profile_data" as const,
    generatedAt: new Date(real.capturedAt).toISOString(),
    people,
    labels: {
      source: "Public Airtable profile fields; all contact, link, handle, and photo fields excluded.",
      selection: "Original 50 participant and 10 mentor selections preserved deterministically.",
      intents: "50 seek mentor; 30 mutual co-founder; 35 mutual collaborator; mentors only offer mentor.",
      intentEvidence: `Positive source evidence: ${intents.positiveCandidateCounts.cofounder} co-founder; ${intents.positiveCandidateCounts.collaborator} collaborator.`,
      unknowns: "Fields absent from Airtable remain empty or zero; no achievements, tenure, or traction inferred.",
    },
  };
  const parsed = parsePrelaunchQaInput(candidate);
  if (parsed.version !== 2) {
    throw new Error("Airtable conversion did not produce a version 2 QA input.");
  }
  assertNoContactIdentifiers(parsed);
  return { input: parsed, positiveCandidateCounts: intents.positiveCandidateCounts };
}

export function buildAirtableV2Input(values: AirtableV2BuildValues) {
  return buildAirtableV2InputWithAudit(values).input;
}

export function writePrivateTmpJson(outputPath: string, value: unknown) {
  const resolved = ensureBelowTmp(outputPath, "output", false);
  if (existsSync(resolved)) {
    const info = lstatSync(resolved);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error("output must be a regular file, not a symlink.");
    }
    if ((info.mode & 0o777) !== PRIVATE_MODE) {
      throw new Error("Existing output permissions must be exactly 0600.");
    }
    if (typeof process.getuid === "function" && info.uid !== process.getuid()) {
      throw new Error("Existing output must be owned by the current user.");
    }
  }
  const temporaryPath = path.join(
    path.dirname(resolved),
    `.${path.basename(resolved)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporaryPath, "wx", PRIVATE_MODE);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporaryPath, PRIVATE_MODE);
    renameSync(temporaryPath, resolved);
    chmodSync(resolved, PRIVATE_MODE);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporaryPath, { force: true });
  }
  const finalInfo = lstatSync(resolved);
  if ((finalInfo.mode & 0o777) !== PRIVATE_MODE) {
    throw new Error("Output permissions are not exactly 0600 after writing.");
  }
  return resolved;
}

export function parseAirtableV2Cli(argv: string[]): AirtableV2CliOptions {
  const options: AirtableV2CliOptions = {
    realPath: DEFAULT_PATHS.real,
    oldRawPath: DEFAULT_PATHS.oldRaw,
    oldCachePath: DEFAULT_PATHS.oldCache,
    oldInputPath: DEFAULT_PATHS.oldInput,
    outputPath: DEFAULT_PATHS.output,
  };
  const flags: Record<string, keyof AirtableV2CliOptions> = {
    "--real": "realPath",
    "--old-raw": "oldRawPath",
    "--old-cache": "oldCachePath",
    "--old-input": "oldInputPath",
    "--output": "outputPath",
  };
  const seen = new Set<string>();
  for (const argument of argv) {
    const separator = argument.indexOf("=");
    const flag = separator === -1 ? argument : argument.slice(0, separator);
    const value = separator === -1 ? "" : argument.slice(separator + 1);
    const key = flags[flag];
    if (!key || !value) {
      throw new Error(
        "Usage: tsx scripts/prelaunch-qa-airtable-v2.ts [--real=/tmp/...] [--old-raw=/tmp/...] [--old-cache=/tmp/...] [--old-input=/tmp/...] [--output=/tmp/...]",
      );
    }
    if (seen.has(flag)) throw new Error(`Duplicate CLI option ${flag}.`);
    seen.add(flag);
    options[key] = value;
  }
  return options;
}

export function runAirtableV2Conversion(options: AirtableV2CliOptions) {
  const { input, positiveCandidateCounts } = buildAirtableV2InputWithAudit({
    real: readPrivateTmpJson(options.realPath, "real Airtable capture"),
    oldRaw: readPrivateTmpJson(options.oldRawPath, "legacy raw selection"),
    oldCache: readPrivateTmpJson(options.oldCachePath, "legacy sanitized cache"),
    oldInput: readPrivateTmpJson(options.oldInputPath, "legacy QA input"),
  });
  const outputPath = writePrivateTmpJson(options.outputPath, input);
  const distribution = input.people.reduce(
    (result, person) => {
      if (person.kind === "person") result.participants += 1;
      else result.mentors += 1;
      if (person.seekingMatchTypes.includes("mentor_match")) result.mentorSeekers += 1;
      if (person.offeringMatchTypes.includes("mentor_match")) result.mentorProviders += 1;
      if (person.seekingMatchTypes.includes("cofounder_match")) result.cofounders += 1;
      if (person.seekingMatchTypes.includes("collaborator_match")) result.collaborators += 1;
      return result;
    },
    {
      participants: 0,
      mentors: 0,
      mentorSeekers: 0,
      mentorProviders: 0,
      cofounders: 0,
      collaborators: 0,
    },
  );
  return {
    outputPath,
    mode: (lstatSync(outputPath).mode & 0o777).toString(8).padStart(4, "0"),
    positiveCandidateCounts,
    distribution,
    fingerprint: createHash("sha256").update(readFileSync(outputPath)).digest("hex"),
    contactIdentifiersExcluded: true,
  };
}

function main() {
  const result = runAirtableV2Conversion(parseAirtableV2Cli(process.argv.slice(2)));
  console.log(JSON.stringify(result));
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1] as string)).href;
if (isDirectExecution) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Airtable v2 conversion failed.");
    process.exitCode = 1;
  }
}

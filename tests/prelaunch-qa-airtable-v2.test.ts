import { chmodSync, lstatSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  AIRTABLE_PROFILE_FIELDS,
  buildAirtableV2Input,
  normalizeLegacyMentor,
  readPrivateTmpJson,
  recoverSelectedMentorRecordIds,
  selectMutualIntentRecordIds,
  stripContactIdentifiers,
  writePrivateTmpJson,
  type AirtableRecord,
} from "../scripts/prelaunch-qa-airtable-v2";

const temporaryDirectories: string[] = [];

function legacyMentorCandidate(index: number) {
  return {
    sourceId: `rec-mentor-${String(index).padStart(2, "0")}`,
    headline: `Synthetic mentor capability ${index}`,
    bio: `Synthetic public background ${index} focused on useful guidance.`,
    industryTags: [`Sector ${index}`],
    problemSpaceTags: [`Problem ${index}`],
    skillTags: [`Skill ${index}`],
    topStrengths: [`Strength ${index}`],
    mentorExpertiseTags: [`Expertise ${index}`],
    mentorFunctionalStrengths: [`Function ${index}`],
    mentorStageExperience: ["idea"],
    mentorOffers: [`Offer ${index}`],
    mentorshipPreferences: `Synthetic preference ${index}`,
    mentorAvailability: "",
  };
}

function participantRecord(index: number): AirtableRecord {
  const id = `rec-person-${String(index).padStart(3, "0")}`;
  const cofounderSignal = index <= 30 ? "Technical Founder" : "Explorer";
  const collaboratorSignal = index <= 35 ? "Product Design" : "Listening";
  return {
    id,
    cellValuesByFieldId: {
      [AIRTABLE_PROFILE_FIELDS.participant.familyName]:
        index === 1 ? "+65 8123 4567" : index === 2 ? "X" : `Family${index}`,
      [AIRTABLE_PROFILE_FIELDS.participant.givenName]: index === 1 ? "Q" : `Given${index}`,
      [AIRTABLE_PROFILE_FIELDS.participant.problem]:
        `Synthetic problem statement ${index} about improving a community workflow.`,
      [AIRTABLE_PROFILE_FIELDS.participant.skills]: [
        { name: cofounderSignal },
        { name: collaboratorSignal },
      ],
      [AIRTABLE_PROFILE_FIELDS.participant.archetypes]: [{ name: cofounderSignal }],
      [AIRTABLE_PROFILE_FIELDS.participant.track]: { name: `Synthetic sector ${index % 5}` },
    },
  };
}

function mentorRecord(index: number): AirtableRecord {
  return {
    id: `rec-mentor-${String(index).padStart(2, "0")}`,
    cellValuesByFieldId: {
      [AIRTABLE_PROFILE_FIELDS.mentor.fullName]: index === 1 ? "M" : `Synthetic Mentor ${index}`,
      [AIRTABLE_PROFILE_FIELDS.mentor.title]: "Sample Role",
      [AIRTABLE_PROFILE_FIELDS.mentor.organization]: "Sample Organization",
      [AIRTABLE_PROFILE_FIELDS.mentor.expertise]: [{ name: `Expertise ${index}` }],
      [AIRTABLE_PROFILE_FIELDS.mentor.mentorTypes]: [{ name: "Sample Mentor Type" }],
      [AIRTABLE_PROFILE_FIELDS.mentor.industries]: [{ name: `Sector ${index}` }],
      [AIRTABLE_PROFILE_FIELDS.mentor.socialCauses]: `Problem ${index}`,
      [AIRTABLE_PROFILE_FIELDS.mentor.topic]: `Function ${index}`,
      [AIRTABLE_PROFILE_FIELDS.mentor.bio]:
        `Synthetic public experience ${index}. A removed link https://example.test/profile is not retained.`,
      ignoredCalendarField: "https://calendar.example.test/sample",
      ignoredSocialField: "https://social.example.test/sample",
    },
  };
}

function completeSyntheticArtifacts() {
  const realParticipants = Array.from({ length: 100 }, (_, index) =>
    participantRecord(index + 1),
  );
  const realMentors = Array.from({ length: 39 }, (_, index) => mentorRecord(index + 1));
  const oldPeople = realParticipants.slice(0, 50).map((record) => ({ sourceId: record.id }));
  const sanitizedMentors = Array.from({ length: 39 }, (_, index) =>
    legacyMentorCandidate(index + 1),
  );
  const selectedMentors = sanitizedMentors.slice(0, 10).map((candidate, index) => ({
    ...normalizeLegacyMentor(candidate),
    sourceId: `qa-mentor-${String(index + 1).padStart(2, "0")}`,
    fullName: `Legacy QA Mentor ${index + 1}`,
    email: `qa.mentor.${String(index + 1).padStart(2, "0")}@prelaunch-qa.invalid`,
  }));
  return {
    real: {
      capturedAt: "2026-07-15T12:00:00.000Z",
      people: { recordsByTableId: { syntheticTable: realParticipants } },
      mentors: { records: realMentors },
    },
    oldRaw: {
      people: oldPeople,
      mentorCandidates: sanitizedMentors.map((record) => ({ sourceId: record.sourceId })),
    },
    oldCache: { people: oldPeople, mentors: sanitizedMentors },
    oldInput: {
      people: [
        ...oldPeople.map((_, index) => ({
          sourceId: `qa-participant-${String(index + 1).padStart(2, "0")}`,
          kind: "person",
        })),
        ...selectedMentors,
      ],
    },
  };
}

afterEach(() => {
  while (temporaryDirectories.length) {
    rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
  }
});

describe("private Airtable v2 conversion", () => {
  it("removes contact details without removing surrounding public prose", () => {
    const unsafeValues = [
      "https://example.test/a",
      "person@example.test",
      "+65 8123 4567",
      "9123-4567",
      "@sample",
      "portfolio.me",
      "name.dev/foo",
      "foo.xyz",
      "foo.tech",
      "例子.公司/路径",
      "xn--fsqu00a.xn--55qx5d",
    ];

    for (const unsafe of unsafeValues) {
      const cleaned = stripContactIdentifiers(`Public background before ${unsafe} after.`);
      expect(cleaned).toBe("Public background before after.");
    }
  });

  it("recovers the exact original mentor IDs with the legacy normalizeMentor signature", () => {
    const candidates = Array.from({ length: 10 }, (_, index) => legacyMentorCandidate(index + 1));
    const selected = candidates.map((candidate, index) => ({
      ...normalizeLegacyMentor(candidate),
      sourceId: `qa-mentor-${String(index + 1).padStart(2, "0")}`,
      fullName: `Legacy QA Mentor ${index + 1}`,
      email: `qa.mentor.${String(index + 1).padStart(2, "0")}@prelaunch-qa.invalid`,
    }));

    expect(recoverSelectedMentorRecordIds(candidates, selected)).toEqual(
      candidates.map((candidate) => candidate.sourceId),
    );
  });

  it("assigns exact mutual-intent counts deterministically from archetypes and skills", () => {
    const records = Array.from({ length: 50 }, (_, index) => participantRecord(index + 1));
    const first = selectMutualIntentRecordIds(records);
    const second = selectMutualIntentRecordIds([...records].reverse());

    expect(first.cofounder).toHaveLength(30);
    expect(first.collaborator).toHaveLength(35);
    expect(first.positiveCandidateCounts).toEqual({ cofounder: 35, collaborator: 35 });
    expect([...first.cofounder].sort()).toEqual([...second.cofounder].sort());
    expect([...first.collaborator].sort()).toEqual([...second.collaborator].sort());
  });

  it("fails instead of filling mutual-intent quotas with zero-evidence records", () => {
    const neutral = Array.from({ length: 50 }, (_, index) => {
      const record = participantRecord(index + 1);
      return {
        ...record,
        cellValuesByFieldId: {
          ...record.cellValuesByFieldId,
          [AIRTABLE_PROFILE_FIELDS.participant.archetypes]: [{ name: "Explorer" }],
          [AIRTABLE_PROFILE_FIELDS.participant.skills]: [{ name: "Listening" }],
        },
      };
    });
    expect(() => selectMutualIntentRecordIds(neutral)).toThrow(
      /Co-founder intent requires 30.*found 0/,
    );

    const insufficientCollaborators = Array.from({ length: 50 }, (_, index) => {
      const record = participantRecord(index + 1);
      const position = index + 1;
      return {
        ...record,
        cellValuesByFieldId: {
          ...record.cellValuesByFieldId,
          [AIRTABLE_PROFILE_FIELDS.participant.archetypes]: [
            { name: position <= 30 ? "Technical Founder" : "Explorer" },
          ],
          [AIRTABLE_PROFILE_FIELDS.participant.skills]: [
            { name: position <= 34 ? "Design" : "Listening" },
          ],
        },
      };
    });
    expect(() => selectMutualIntentRecordIds(insufficientCollaborators)).toThrow(
      /Collaborator intent requires 35.*found 34/,
    );
  });

  it("builds the 50+10 v2 contract with real-field identities and no inferred unknowns", () => {
    const input = buildAirtableV2Input(completeSyntheticArtifacts());
    const participants = input.people.filter((person) => person.kind === "person");
    const mentors = input.people.filter((person) => person.kind === "mentor");

    expect(input.version).toBe(2);
    expect(input.dataPolicy).toBe("public_airtable_profile_data");
    expect(participants).toHaveLength(50);
    expect(mentors).toHaveLength(10);
    expect(participants.filter((person) => person.seekingMatchTypes.includes("mentor_match"))).toHaveLength(50);
    expect(participants.filter((person) => person.seekingMatchTypes.includes("cofounder_match"))).toHaveLength(30);
    expect(participants.filter((person) => person.seekingMatchTypes.includes("collaborator_match"))).toHaveLength(35);
    expect(mentors.every((mentor) => mentor.offeringMatchTypes.join() === "mentor_match")).toBe(true);
    expect(input.people.every((person) => person.stage === "")).toBe(true);
    expect(input.people.every((person) => person.yearsOfExperience === 0)).toBe(true);
    expect(input.people.every((person) => person.ambitionLevel === 0)).toBe(true);
    expect(participants[0]?.fullName).toBe("Q");
    expect(participants[1]?.fullName).toBe("Given2 X");
    expect(mentors[0]?.fullName).toBe("M");
    expect(JSON.stringify(input)).not.toMatch(/https?:\/\/|example\.test|8123 4567/);
  });

  it("requires private tmp inputs and writes output atomically with mode 0600", () => {
    const directory = mkdtempSync("/tmp/wavesparks-airtable-v2-test-");
    temporaryDirectories.push(directory);
    const inputPath = path.join(directory, "input.json");
    const outputPath = path.join(directory, "output.json");
    const linkPath = path.join(directory, "link.json");
    writeFileSync(inputPath, "{}", { mode: 0o600 });
    chmodSync(inputPath, 0o600);
    symlinkSync(inputPath, linkPath);

    expect(readPrivateTmpJson(inputPath)).toEqual({});
    expect(() => readPrivateTmpJson(linkPath)).toThrow(/regular file, not a symlink/);
    expect(writePrivateTmpJson(outputPath, { safe: true })).toBe(outputPath);
    expect(lstatSync(outputPath).mode & 0o777).toBe(0o600);
  });
});

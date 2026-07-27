import { describe, expect, it } from "vitest";

import { seedMemberships, seedProfiles } from "@/data/seed-data";
import type { FullAdminProfile, Profile } from "@/lib/domain";
import { toFullAdminProfile } from "@/server/view-models";

const inspectorFields = [
  "schoolOrCompany",
  "timezone",
  "startupName",
  "startupOneLiner",
  "startupDescription",
  "stage",
  "industryTags",
  "problemSpaceTags",
  "businessModelTags",
  "currentProgress",
  "tractionSummary",
  "regionFocus",
  "lookingForTypes",
  "seekingMatchTypes",
  "offeringMatchTypes",
  "desiredRoles",
  "helpNeededTags",
  "idealMatchDescription",
  "skillTags",
  "yearsOfExperience",
  "topStrengths",
  "canContribute",
  "priorProjects",
  "notableWins",
  "timeCommitment",
  "availabilityStart",
  "remotePreference",
  "preferredGeographies",
  "meetingFrequencyPreference",
  "ambitionLevel",
  "riskTolerance",
  "speedPreference",
  "decisionStyle",
  "workStyle",
  "communicationStyle",
  "conflictStyle",
  "commitmentHorizon",
  "missionVsMarketOrientation",
  "structureVsChaos",
  "mentorExpertiseTags",
  "mentorStageExperience",
  "mentorFunctionalStrengths",
  "mentorAvailability",
  "mentorOffers",
  "maxMentees",
  "mentorshipPreferences",
  "introOptIn",
  "profileVisibleInMatching",
  "onboardingComplete",
] as const satisfies ReadonlyArray<keyof Profile & keyof FullAdminProfile>;

describe("admin profile inspector view model", () => {
  it("retains the full profile, matching, availability, and mentoring details", () => {
    const profile = seedProfiles.find((candidate) => candidate.id === "pro_jules")!;
    const membership = seedMemberships.find(
      (candidate) => candidate.id === profile.membershipId,
    )!;

    const adminProfile = toFullAdminProfile(profile, membership);

    for (const field of inspectorFields) {
      expect(adminProfile[field], field).toEqual(profile[field]);
    }
  });
});

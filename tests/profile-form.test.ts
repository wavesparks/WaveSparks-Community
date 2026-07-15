import { describe, expect, it } from "vitest";

import {
  seedMatchTypeConfigs,
  seedMemberships,
  seedProfiles,
  seedUsers,
} from "@/data/seed-data";
import { profileFromFormData } from "@/lib/profile-form";
import { canonicalLegacyBio, distinctLegacyProfileText } from "@/lib/profile-bio";
import type { ProfileLink } from "@/lib/domain";

describe("profile form", () => {
  it("saves one canonical bio and preserves fields removed from onboarding", () => {
    const existingProfile = {
      ...seedProfiles[0],
      bio: "",
      longBio: "Legacy long biography",
      shortBio: "Legacy short biography",
      tractionSummary: "Historical traction that should not be erased",
      notableWins: "Historical milestone that should not be erased",
      businessModelTags: ["legacy model"],
      publicContactEnabled: true,
    };
    const membership = seedMemberships.find(
      (candidate) => candidate.id === existingProfile.membershipId,
    )!;
    const user = seedUsers.find((candidate) => candidate.id === membership.userId)!;
    const formData = new FormData();
    formData.set("bio", "A single, clearer biography for the whole community.");
    formData.set("problem_interest", "I care about making public services easier to use.");
    formData.set("current_focus", "Learning service design through a community project.");
    formData.set("technical_experience_level", "new");
    formData.set("technical_experience", "I am new to coding and want to learn prototyping.");
    formData.set("matching_intent_version", "2");
    formData.append("seeking_match_types", "collaborator_match");
    formData.set("skill_tags", "service design, prototyping");

    const result = profileFromFormData({
      existingProfile,
      formData,
      matchTypeConfigs: seedMatchTypeConfigs,
      membership,
      user,
    });

    expect(result.profile).toMatchObject({
      bio: "A single, clearer biography for the whole community.",
      longBio: "A single, clearer biography for the whole community.",
      shortBio: "A single, clearer biography for the whole community.",
      problemInterest: "I care about making public services easier to use.",
      currentFocus: "Learning service design through a community project.",
      technicalExperienceLevel: "new",
      technicalExperience: "I am new to coding and want to learn prototyping.",
      tractionSummary: "Historical traction that should not be erased",
      notableWins: "Historical milestone that should not be erased",
      businessModelTags: ["legacy model"],
      publicContactEnabled: true,
    });
  });

  it("falls back to a legacy bio when the new field was not submitted", () => {
    const existingProfile = {
      ...seedProfiles[0],
      bio: "",
      longBio: "",
      shortBio: "Legacy short biography",
    };
    const membership = seedMemberships.find(
      (candidate) => candidate.id === existingProfile.membershipId,
    )!;
    const user = seedUsers.find((candidate) => candidate.id === membership.userId)!;

    const result = profileFromFormData({
      existingProfile,
      formData: new FormData(),
      membership,
      user,
    });

    expect(result.profile.bio).toBe("Legacy short biography");
    expect(result.profile.longBio).toBe("Legacy short biography");
    expect(result.profile.seekingMatchTypes).toEqual(existingProfile.seekingMatchTypes);
    expect(result.profile.offeringMatchTypes).toEqual(existingProfile.offeringMatchTypes);
    expect(result.profile.embeddingStatus).toBe("pending");
    expect(result.profile.embeddingSourceHash).toBeUndefined();
    expect(result.links).toBeUndefined();
  });

  it("preserves current embeddings when a partial update does not change matching text", () => {
    const existingProfile = { ...seedProfiles[0] };
    const membership = seedMemberships.find(
      (candidate) => candidate.id === existingProfile.membershipId,
    )!;
    const user = seedUsers.find((candidate) => candidate.id === membership.userId)!;

    const result = profileFromFormData({
      existingProfile,
      formData: new FormData(),
      membership,
      user,
    });

    expect(result.profile.embeddingStatus).toBe(existingProfile.embeddingStatus);
    expect(result.profile.embeddingSourceHash).toBe(existingProfile.embeddingSourceHash);
    expect(result.profile.seekingEmbedding).toEqual(existingProfile.seekingEmbedding);
    expect(result.profile.offeringEmbedding).toEqual(existingProfile.offeringEmbedding);
  });

  it("lets the full profile form turn off privacy controls without treating partial omission as false", () => {
    const existingProfile = {
      ...seedProfiles[0],
      introOptIn: true,
      whatsappVisibleAfterAccept: true,
    };
    const membership = seedMemberships.find(
      (candidate) => candidate.id === existingProfile.membershipId,
    )!;
    const user = seedUsers.find((candidate) => candidate.id === membership.userId)!;
    const fullFormData = new FormData();
    fullFormData.set("profile_form_version", "2");

    const fullResult = profileFromFormData({
      existingProfile,
      formData: fullFormData,
      membership,
      user,
    });
    const partialResult = profileFromFormData({
      existingProfile,
      formData: new FormData(),
      membership,
      user,
    });

    expect(fullResult.profile.introOptIn).toBe(false);
    expect(fullResult.profile.whatsappVisibleAfterAccept).toBe(false);
    expect(partialResult.profile.introOptIn).toBe(true);
    expect(partialResult.profile.whatsappVisibleAfterAccept).toBe(true);
  });

  it("keeps a short-only answer from the legacy two-bio form", () => {
    const existingProfile = {
      ...seedProfiles[0],
      bio: "Existing biography",
    };
    const membership = seedMemberships.find(
      (candidate) => candidate.id === existingProfile.membershipId,
    )!;
    const user = seedUsers.find((candidate) => candidate.id === membership.userId)!;
    const formData = new FormData();
    formData.set("long_bio", "");
    formData.set("short_bio", "A legacy short-only answer");

    const result = profileFromFormData({ existingProfile, formData, membership, user });

    expect(result.profile.bio).toBe("A legacy short-only answer");
    expect(result.profile.longBio).toBe("A legacy short-only answer");
  });

  it("merges distinct legacy bio answers without duplicating excerpts", () => {
    expect(canonicalLegacyBio("A concise introduction.", "A different detailed story."))
      .toBe("A concise introduction.\n\nA different detailed story.");
    expect(canonicalLegacyBio("A concise introduction.", "A concise introduction. More detail."))
      .toBe("A concise introduction. More detail.");
    expect(distinctLegacyProfileText("Current focus", "current focus")).toBe("");
    expect(distinctLegacyProfileText("Current focus", "A separate project")).toBe(
      "A separate project",
    );
  });

  it("updates partial matching intent and links without clearing sibling values", () => {
    const existingProfile = { ...seedProfiles[0] };
    const membership = seedMemberships.find(
      (candidate) => candidate.id === existingProfile.membershipId,
    )!;
    const user = seedUsers.find((candidate) => candidate.id === membership.userId)!;
    const existingLinks: ProfileLink[] = [
      { id: "lnk_linkedin", profileId: existingProfile.id, type: "linkedin", url: "https://linkedin.com/in/old" },
      { id: "lnk_github", profileId: existingProfile.id, type: "github", url: "https://github.com/kept" },
    ];
    const formData = new FormData();
    formData.append("offering_match_types", "mentor_match");
    formData.set("linkedin_url", "https://linkedin.com/in/new");

    const result = profileFromFormData({
      existingProfile,
      existingLinks,
      formData,
      membership,
      user,
    });

    expect(result.profile.seekingMatchTypes).toEqual(existingProfile.seekingMatchTypes);
    expect(result.profile.offeringMatchTypes).toEqual(["mentor_match"]);
    expect(result.links).toEqual(
      expect.arrayContaining([
        existingLinks[1],
        expect.objectContaining({ type: "linkedin", url: "https://linkedin.com/in/new" }),
      ]),
    );
  });
});

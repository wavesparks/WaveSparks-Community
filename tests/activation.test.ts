import { describe, expect, it, beforeEach } from "vitest";

import {
  getPendingAccessExperience,
  getProfileReadiness,
  getStatusBannerCopy,
} from "@/lib/activation";
import type { Membership, Profile, User } from "@/lib/domain";
import { emptyProfileForMember } from "@/lib/profile-form";
import {
  createIntroRequest,
  createPost,
  followMembership,
  getMemberActivationSignals,
  getStore,
  resetStore,
} from "@/server/store";
import { getMemberActivationState } from "@/server/view-models";

const activationUser: User = {
  id: "usr_activation",
  email: "activation@example.com",
  name: "Activation User",
  imageUrl: "",
  platformRole: "standard",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const activationMembership: Membership = {
  id: "mem_activation",
  orgId: "org_wavespark",
  userId: activationUser.id,
      role: "member",
      accountStatus: "connected",
      affiliationType: "current participant",
  status: "approved",
  archetypes: ["founder"],
  programName: "Activation Program",
  cohortNameOrYear: "2026",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function readyProfile(): Profile {
  const profile = emptyProfileForMember(activationUser, activationMembership);
  return {
    ...profile,
    preferredName: "Activation",
    headline: "Founder validating trust-first workflows",
    bio: "I build tools that help communities make thoughtful introductions.",
    currentFocus: "Testing a simpler way for members to find useful collaborators.",
    startupOneLiner: "A workflow product for high-trust communities.",
    startupDescription: "We help founders coordinate introductions with better context.",
    lookingForTypes: ["cofounder"],
    seekingMatchTypes: ["cofounder_match"],
    offeringMatchTypes: ["cofounder_match"],
    desiredRoles: ["technical"],
    skillTags: ["product"],
    emailForIntro: "activation@example.com",
    onboardingComplete: true,
    profileCompletionPercent: 100,
  };
}

describe("member activation state", () => {
  beforeEach(() => {
    resetStore();
  });

  it("marks a ready profile without first actions as partially activated", async () => {
    const state = await getMemberActivationState(
      "org_wavespark",
      activationMembership.id,
      readyProfile(),
    );

    expect(state.completedCount).toBe(1);
    expect(state.isComplete).toBe(false);
    expect(state.items).toMatchObject([
      { id: "profile", complete: true },
      { id: "post", complete: false },
      { id: "matches", complete: false },
      { id: "intro", complete: false },
    ]);
  });

  it("marks posting, following, and requesting an intro as activation progress", async () => {
    await createPost({
      orgId: activationMembership.orgId,
      authorMembershipId: activationMembership.id,
      type: "ask",
      title: "Looking for early workflow design feedback",
      body: "I would love feedback from people building trust-heavy products.",
      tags: ["workflow"],
      relatedStartupName: "",
      relatedRolesNeeded: ["design"],
      visibility: "org_only",
      status: "active",
      featured: false,
      hidden: false,
      commentsLocked: false,
    });
    await followMembership(activationMembership.orgId, activationMembership.id, "mem_jules");
    await createIntroRequest({
      orgId: activationMembership.orgId,
      requesterMembershipId: activationMembership.id,
      receiverMembershipId: "mem_jules",
      sourceType: "match",
      sourceId: "mtc_activation",
      introPurpose: "co-founder conversation",
      note: "Strong overlap on workflow trust.",
      status: "pending",
      suggestedFirstMessage: "Would love to compare notes.",
    });

    await expect(
      getMemberActivationSignals({
        orgId: activationMembership.orgId,
        membershipId: activationMembership.id,
        profileId: readyProfile().id,
      }),
    ).resolves.toEqual({
      hasPost: true,
      hasFollow: true,
      hasVisibleMatch: false,
      hasRequestedIntro: true,
    });

    const state = await getMemberActivationState(
      "org_wavespark",
      activationMembership.id,
      readyProfile(),
    );

    expect(state.isComplete).toBe(true);
    expect(state.items.every((item) => item.complete)).toBe(true);
    expect(state.items.find((item) => item.id === "intro")).toMatchObject({
      cta: "View introductions",
      href: "/org/wavesparks/requests",
    });
  });

  it("counts a visible match as match progress even before following", async () => {
    const profile = readyProfile();
    const targetProfile = getStore().profiles[0];
    getStore().matches.unshift({
      id: "mtc_activation_visible",
      orgId: activationMembership.orgId,
      sourceProfileId: profile.id,
      targetProfileId: targetProfile.id,
      matchType: "cofounder_match",
      score: 84,
      scoreBreakdown: { skills: 30, intent: 30, stage: 24 },
      explanationText: "Strong overlap before a follow action.",
      overlapTags: ["product"],
      scoreBand: "high",
      confidence: "high",
      algorithmVersion: "hybrid-v2",
      surfacedAt: "2026-01-01T00:00:00.000Z",
      dismissedBySource: false,
      hiddenByAdmin: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const state = await getMemberActivationState(
      "org_wavespark",
      activationMembership.id,
      profile,
    );

    expect(state.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "matches", complete: true }),
        expect.objectContaining({ id: "post", complete: false }),
        expect.objectContaining({
          id: "intro",
          complete: false,
          href: "/org/wavesparks/matches",
        }),
      ]),
    );
  });
});

describe("pending access experience", () => {
  it("keeps pending members oriented toward profile edits and review", () => {
    const experience = getPendingAccessExperience("pending");

    expect(experience.title).toBe("Your application is in review");
    expect(experience.primaryHref).toBe("onboarding");
    expect(experience.timeline.map((item) => item.title)).toContain("Admin review");
  });

  it("does not imply rejected or suspended members are still waiting", () => {
    const rejected = getPendingAccessExperience("rejected", "Not a fit.");
    const suspended = getPendingAccessExperience("suspended", "Paused.");

    expect(rejected.primaryHref).toBeUndefined();
    expect(rejected.noteLabel).toBe("Admin decision note");
    expect(suspended.primaryHref).toBeUndefined();
    expect(suspended.noteLabel).toBe("Access note");
  });
});

describe("profile readiness", () => {
  it("requires the minimum activation fields before final onboarding save", () => {
    const profile = emptyProfileForMember(activationUser, activationMembership);
    const readiness = getProfileReadiness(profile);

    expect(readiness.isReady).toBe(false);
    expect(readiness.missingFields.map((field) => field.key)).toEqual([
      "headline",
      "bio",
      "current_focus",
      "looking_for_types",
      "skill_tags",
    ]);
  });

  it("allows a learner to finish without claiming a startup or prior technical experience", () => {
    const profile = emptyProfileForMember(activationUser, activationMembership);
    profile.headline = "Student exploring accessible education";
    profile.bio = "I am learning how thoughtful products can make education more inclusive.";
    profile.currentFocus = "Working through my first design research project.";
    profile.technicalExperienceLevel = "new";
    profile.technicalExperience = "";
    profile.seekingMatchTypes = ["collaborator_match"];
    profile.skillTags = ["user research"];

    expect(profile.startupName).toBe("");
    expect(profile.startupOneLiner).toBe("");
    expect(profile.technicalExperience).toBe("");
    expect(getProfileReadiness(profile)).toMatchObject({ isReady: true, missingFields: [] });
  });
});

describe("status banners", () => {
  it("includes admin workflow feedback", () => {
    expect(getStatusBannerCopy("manual_intro_created")).toMatchObject({
      title: "Introduction created",
    });
    expect(getStatusBannerCopy("comment_added")).toMatchObject({
      title: "Comment added",
    });
    expect(getStatusBannerCopy("intro_accepted")).toMatchObject({
      title: "Introduction accepted",
    });
    expect(getStatusBannerCopy("intro_existing")).toMatchObject({
      title: "Introduction already requested",
    });
    expect(getStatusBannerCopy("intro_declined")).toMatchObject({
      title: "Introduction declined",
    });
    expect(getStatusBannerCopy("member_followed")).toMatchObject({
      title: "Now following",
    });
    expect(getStatusBannerCopy("member_unfollowed")).toMatchObject({
      title: "No longer following",
    });
    expect(getStatusBannerCopy("notifications_read")).toMatchObject({
      title: "Notifications marked read",
    });
    expect(getStatusBannerCopy("member_invited")).toMatchObject({
      title: "Invitation sent",
    });
    expect(getStatusBannerCopy("member_saved")).toMatchObject({
      title: "Member saved",
    });
    expect(getStatusBannerCopy("membership_updated")).toMatchObject({
      title: "Member updated",
    });
    expect(getStatusBannerCopy("org_settings_saved")).toMatchObject({
      title: "Settings saved",
    });
    expect(getStatusBannerCopy("post_moderation_updated")).toMatchObject({
      title: "Post settings saved",
    });
    expect(getStatusBannerCopy("comment_moderation_updated")).toMatchObject({
      title: "Comment settings saved",
    });
    expect(getStatusBannerCopy("profile_flags_updated")).toMatchObject({
      title: "Profile review updated",
    });
    expect(getStatusBannerCopy("matches_recomputed")).toMatchObject({
      title: "Matches refreshed",
    });
  });
});

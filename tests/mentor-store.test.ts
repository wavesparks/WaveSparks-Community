import { beforeEach, describe, expect, it } from "vitest";

import { seedOrganization } from "@/data/seed-data";
import {
  createIntroRequest,
  createIntroRequestInSpace,
  createManagedAccount,
  getIntroRequestById,
  getStore,
  listIntroRequestsForMembership,
  listMemberWorkspaceForOrg,
  respondToIntroRequestInSpace,
  resetStore,
  updateMembershipMentorStatus,
} from "@/server/store";

describe("mentor designation store", () => {
  beforeEach(() => {
    resetStore();
  });

  it("defaults managed accounts to non-mentor and filters the member workspace canonically", async () => {
    const created = await createManagedAccount({
      orgId: seedOrganization.id,
      email: "mentor.default@example.com",
      name: "Mentor Default",
      role: "member",
      status: "pending",
    });
    const approvedMentors = await listMemberWorkspaceForOrg(seedOrganization.id, {
      mentorStatus: "approved",
      pageSize: 100,
    });

    expect(created.membership.mentorStatus).toBe("not_mentor");
    expect(approvedMentors.records.map(({ membership }) => membership.id)).toEqual(
      expect.arrayContaining(["mem_avery", "mem_kai", "mem_marcus", "mem_amelia", "mem_tom"]),
    );
    expect(
      approvedMentors.records.every(
        ({ membership }) => membership.mentorStatus === "approved",
      ),
    ).toBe(true);
  });

  it("rejects a managed-account reviewer from another organization before creating the user", async () => {
    await expect(
      createManagedAccount({
        orgId: "org_other",
        email: "cross-org-mentor@example.com",
        name: "Cross Org Mentor",
        role: "member",
        mentorStatus: "approved",
        mentorReviewedByMembershipId: "mem_maya",
        status: "approved",
      }),
    ).rejects.toThrow("organization administrator");

    expect(
      getStore().users.some((user) => user.email === "cross-org-mentor@example.com"),
    ).toBe(false);
  });

  it("expires pending mentoring when a review resolves as non-mentor", async () => {
    const membershipUnderReview = getStore().memberships.find(
      (membership) => membership.id === "mem_avery",
    )!;
    membershipUnderReview.mentorStatus = "needs_review";
    const general = await createIntroRequest({
      orgId: seedOrganization.id,
      requesterMembershipId: "mem_rhea",
      receiverMembershipId: "mem_avery",
      sourceType: "profile",
      sourceId: "pro_avery",
      introPurpose: "general connection",
      note: "A normal introduction should remain pending.",
      status: "pending",
      suggestedFirstMessage: "Would love to connect.",
    });

    const updated = await updateMembershipMentorStatus("mem_avery", "not_mentor", {
      reviewedByMembershipId: "mem_maya",
      recomputeMatches: false,
    });

    expect(updated).toMatchObject({
      mentorStatus: "not_mentor",
      mentorReviewedByMembershipId: "mem_maya",
    });
    expect(updated?.mentorReviewedAt).toBeTruthy();
    await expect(getIntroRequestById("intro_4")).resolves.toMatchObject({
      kind: "mentoring",
      status: "expired",
    });
    const expiredMentoring = (await getIntroRequestById("intro_4"))!;
    await expect(
      respondToIntroRequestInSpace(
        expiredMentoring.spaceId!,
        expiredMentoring.id,
        "accepted",
        { recordAnalytics: false },
      ),
    ).resolves.toBeNull();
    const persistedExpiredMentoring = await getIntroRequestById(expiredMentoring.id);
    expect(persistedExpiredMentoring).toMatchObject({ status: "expired" });
    expect(persistedExpiredMentoring?.contactRevealedAt).toBeUndefined();
    await expect(getIntroRequestById(general.id)).resolves.toMatchObject({
      kind: "general",
      status: "pending",
    });
  });

  it("supports typed request filtering and rejects a non-admin reviewer", async () => {
    const incomingMentoring = await listIntroRequestsForMembership("mem_avery", {
      direction: "incoming",
      kind: "mentoring",
    });

    expect(incomingMentoring.map((request) => request.id)).toContain("intro_4");
    expect(incomingMentoring.every((request) => request.kind === "mentoring")).toBe(true);
    await expect(
      updateMembershipMentorStatus("mem_avery", "not_mentor", {
        reviewedByMembershipId: "mem_jules",
        recomputeMatches: false,
      }),
    ).rejects.toThrow("organization administrator");
  });

  it("rechecks mentor approval and offering at the atomic request write", async () => {
    const store = getStore();
    const mainSpace = store.spaces.find((space) => space.kind === "main")!;
    const mentor = store.memberships.find((membership) => membership.id === "mem_kai")!;
    const mentorProfile = store.profiles.find(
      (profile) => profile.membershipId === mentor.id,
    )!;
    const input = {
      orgId: seedOrganization.id,
      spaceId: mainSpace.id,
      requesterMembershipId: "mem_jules",
      receiverMembershipId: mentor.id,
      kind: "mentoring" as const,
      sourceType: "profile" as const,
      sourceId: mentorProfile.id,
      introPurpose: "mentor request race coverage",
      note: "Please help with this decision.",
      status: "pending" as const,
      suggestedFirstMessage: "Would you be open to a short mentoring conversation?",
    };

    mentorProfile.offeringMatchTypes = mentorProfile.offeringMatchTypes.filter(
      (matchType) => matchType !== "mentor_match",
    );
    await expect(createIntroRequestInSpace(input)).rejects.toThrow(
      "no longer accepting mentoring requests",
    );

    mentorProfile.offeringMatchTypes.push("mentor_match");
    mentor.mentorStatus = "needs_review";
    await expect(createIntroRequestInSpace(input)).rejects.toThrow(
      "no longer accepting mentoring requests",
    );

    mentor.mentorStatus = "approved";
    await expect(createIntroRequestInSpace(input)).resolves.toMatchObject({
      kind: "mentoring",
      receiverMembershipId: mentor.id,
      status: "pending",
    });
  });

  it("normalizes legacy intro kinds with the same mentor receiver guard as the SQL migration", () => {
    const store = getStore();
    const ordinaryReceiverRequest = store.introRequests.find(
      (request) => request.id === "intro_2",
    )!;
    const mentorReviewRequest = store.introRequests.find(
      (request) => request.id === "intro_4",
    )!;
    const mentorUnderReview = store.memberships.find(
      (membership) => membership.id === mentorReviewRequest.receiverMembershipId,
    )!;

    ordinaryReceiverRequest.introPurpose = "mentor guidance";
    delete (ordinaryReceiverRequest as Partial<typeof ordinaryReceiverRequest>).kind;
    mentorUnderReview.mentorStatus = "needs_review";
    delete (mentorReviewRequest as Partial<typeof mentorReviewRequest>).kind;

    const normalizedStore = getStore();

    expect(
      normalizedStore.introRequests.find((request) => request.id === "intro_2")?.kind,
    ).toBe("general");
    expect(
      normalizedStore.introRequests.find((request) => request.id === "intro_4")?.kind,
    ).toBe("mentoring");
  });

  it("accepts a connected platform owner as a reviewer independent of membership role", async () => {
    const platformOwnerMembership = getStore().memberships.find(
      (membership) => membership.id === "mem_avery",
    )!;
    platformOwnerMembership.role = "member";

    await expect(
      updateMembershipMentorStatus("mem_marcus", "not_mentor", {
        reviewedByMembershipId: platformOwnerMembership.id,
        recomputeMatches: false,
      }),
    ).resolves.toMatchObject({
      mentorStatus: "not_mentor",
      mentorReviewedByMembershipId: platformOwnerMembership.id,
    });
  });
});

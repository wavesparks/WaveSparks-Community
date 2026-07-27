import { beforeEach, describe, expect, it } from "vitest";

import { canViewContactDetails } from "@/server/permissions";
import {
  createCommentInSpace,
  createIntroRequestInSpace,
  createPostInSpace,
  getIntroRequestById,
  getMembershipById,
  getSpaceMembership,
  listCommentsForPost,
  listIntroRequestsForMembership,
  listMatchesForProfile,
  listSpacesForOrg,
  respondToIntroRequestInSpace,
  resetStore,
  updateMembershipStatus,
} from "@/server/store";

describe("member flows", () => {
  beforeEach(() => {
    resetStore();
  });

  it("keeps legacy approval separate while Space-scoped interactions still work", async () => {
    const mainSpace = (await listSpacesForOrg("org_wavespark")).find(
      (space) => space.kind === "main",
    )!;
    await updateMembershipStatus("mem_priya", "approved", "Approved for invited brand support");
    await expect(getMembershipById("mem_priya")).resolves.toMatchObject({ status: "approved" });
    await expect(getSpaceMembership(mainSpace.id, "mem_priya")).resolves.toBeUndefined();
    const matchesAfterApproval = await listMatchesForProfile("pro_priya", {
      spaceId: mainSpace.id,
      limit: 1000,
    });
    expect(
      matchesAfterApproval.some(
        (match) =>
          match.sourceProfileId === "pro_priya" || match.targetProfileId === "pro_priya",
      ),
    ).toBe(false);

    const post = await createPostInSpace({
      orgId: "org_wavespark",
      spaceId: mainSpace.id,
      authorMembershipId: "mem_jules",
      type: "ask",
      title: "Testing a new post flow",
      body: "Need advice on enterprise onboarding language.",
      tags: ["testing", "enterprise"],
      relatedStartupName: "",
      relatedRolesNeeded: [],
      status: "active",
      featured: false,
      hidden: false,
      commentsLocked: false,
    });

    await createCommentInSpace(mainSpace.id, {
      postId: post.id,
      authorMembershipId: "mem_kai",
      body: "Happy to help on positioning and call structure.",
    });

    const intro = await createIntroRequestInSpace({
      orgId: "org_wavespark",
      spaceId: mainSpace.id,
      requesterMembershipId: "mem_jules",
      receiverMembershipId: "mem_kai",
      sourceType: "post",
      sourceId: post.id,
      introPurpose: "mentor guidance",
      note: "Would love feedback on the first ten calls.",
      status: "pending",
      suggestedFirstMessage: "Thanks for being open to the intro.",
    });

    const accepted = (
      await respondToIntroRequestInSpace(mainSpace.id, intro.id, "accepted")
    )!;

    expect(await listCommentsForPost(post.id)).toHaveLength(1);
    expect(
      (
        await listIntroRequestsForMembership("mem_jules", {
          spaceId: mainSpace.id,
        })
      ).some((request) => request.id === intro.id),
    ).toBe(true);
    expect(intro.spaceId).toBe(mainSpace.id);
    expect(accepted.status).toBe("accepted");
    expect(canViewContactDetails("mem_jules", accepted)).toBe(true);
  });

  it("atomically allows only one pending intro response in the owning Space", async () => {
    const spaces = await listSpacesForOrg("org_wavespark");
    const mainSpace = spaces.find((space) => space.kind === "main")!;
    const intro = await createIntroRequestInSpace({
      orgId: "org_wavespark",
      spaceId: mainSpace.id,
      requesterMembershipId: "mem_jules",
      receiverMembershipId: "mem_kai",
      sourceType: "profile",
      sourceId: "pro_kai",
      introPurpose: "atomic response",
      note: "Only the first response should win.",
      status: "pending",
      suggestedFirstMessage: "Hello Kai.",
    });

    await expect(
      respondToIntroRequestInSpace("spc_wrong_space", intro.id, "accepted", {
        recordAnalytics: false,
      }),
    ).resolves.toBeNull();
    await expect(getIntroRequestById(intro.id)).resolves.toMatchObject({
      status: "pending",
    });

    const [accepted, declined] = await Promise.all([
      respondToIntroRequestInSpace(mainSpace.id, intro.id, "accepted", {
        recordAnalytics: false,
      }),
      respondToIntroRequestInSpace(mainSpace.id, intro.id, "declined", {
        recordAnalytics: false,
      }),
    ]);

    expect(accepted).toMatchObject({ status: "accepted" });
    expect(declined).toBeNull();
    await expect(getIntroRequestById(intro.id)).resolves.toMatchObject({
      status: "accepted",
      contactRevealedAt: expect.any(String),
    });
    await expect(
      respondToIntroRequestInSpace(mainSpace.id, intro.id, "declined", {
        recordAnalytics: false,
      }),
    ).resolves.toBeNull();
  });
});

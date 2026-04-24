import { beforeEach, describe, expect, it } from "vitest";

import { canViewContactDetails } from "@/server/permissions";
import {
  createComment,
  createIntroRequest,
  createPost,
  getMembershipById,
  listCommentsForPost,
  listIntroRequestsForMembership,
  respondToIntroRequest,
  resetStore,
  updateMembershipStatus,
} from "@/server/store";

describe("member flows", () => {
  beforeEach(() => {
    resetStore();
  });

  it("supports approval, posting, commenting, and intro acceptance", () => {
    updateMembershipStatus("mem_priya", "approved", "Approved for invited brand support");
    expect(getMembershipById("mem_priya")?.status).toBe("approved");

    const post = createPost({
      orgId: "org_wavespark",
      authorMembershipId: "mem_jules",
      type: "ask",
      title: "Testing a new post flow",
      body: "Need advice on enterprise onboarding language.",
      tags: ["testing", "enterprise"],
      relatedStartupName: "",
      relatedRolesNeeded: [],
      visibility: "org_only",
      status: "active",
      featured: false,
      hidden: false,
      commentsLocked: false,
    });

    createComment({
      postId: post.id,
      authorMembershipId: "mem_kai",
      body: "Happy to help on positioning and call structure.",
    });

    const intro = createIntroRequest({
      orgId: "org_wavespark",
      requesterMembershipId: "mem_jules",
      receiverMembershipId: "mem_kai",
      sourceType: "post",
      sourceId: post.id,
      introPurpose: "mentor guidance",
      note: "Would love feedback on the first ten calls.",
      status: "pending",
      suggestedFirstMessage: "Thanks for being open to the intro.",
    });

    const accepted = respondToIntroRequest(intro.id, "accepted")!;

    expect(listCommentsForPost(post.id)).toHaveLength(1);
    expect(listIntroRequestsForMembership("mem_jules").some((request) => request.id === intro.id)).toBe(true);
    expect(accepted.status).toBe("accepted");
    expect(canViewContactDetails("mem_jules", accepted)).toBe(true);
  });
});

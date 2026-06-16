import { beforeEach, describe, expect, it, vi } from "vitest";

import { seedOrganization } from "@/data/seed-data";
import type { ViewerContext } from "@/lib/domain";

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
const revalidatePathMock = vi.hoisted(() => vi.fn());
const afterMock = vi.hoisted(() => vi.fn());
const viewerRef = vi.hoisted(() => ({ current: null as ViewerContext | null }));
const createOrganizationInvitationMock = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_wavesparks";
  process.env.CLERK_SECRET_KEY = "sk_test_wavesparks";
  return vi.fn();
});
const authMock = vi.hoisted(() =>
  vi.fn(async () => ({
    has: vi.fn(({ role }: { role: string }) => role === "org:admin"),
    orgId: "org_clerk_wavespark",
    userId: "user_clerk_admin",
  })),
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/server", () => ({
  after: afterMock,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: vi.fn(async () => ({
    organizations: {
      createOrganizationInvitation: createOrganizationInvitationMock,
    },
  })),
}));

vi.mock("@/lib/auth", () => ({
  getViewerContextForAction: vi.fn(() => viewerRef.current),
}));

import {
  createManagedAccountAction,
  createManualIntroAction,
  moderateCommentAction,
  updatePostModerationAction,
  updateMembershipAction,
  updateProfileFlagsAction,
} from "@/actions/admin";
import {
  createComment,
  getMembershipById,
  getProfileByMembershipId,
  getStore,
  getUserById,
  resetStore,
} from "@/server/store";
import { getNotificationViews } from "@/server/view-models";

async function setAdminViewer() {
  const membership = (await getMembershipById("mem_avery"))!;
  const user = (await getUserById(membership.userId))!;
  const profile = await getProfileByMembershipId(membership.id);

  viewerRef.current = {
    org: seedOrganization,
    user,
    membership,
    profile,
    canAdmin: true,
    scopes: ["org:admin", "org:member"],
  };

  return membership;
}

function formDataFromEntries(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

async function runAfterCallbacks() {
  const callbacks = afterMock.mock.calls.map(
    ([callback]) => callback as () => Promise<void>,
  );

  for (const callback of callbacks) {
    await callback();
  }
}

describe("admin server actions", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    viewerRef.current = null;
  });

  it("creates a managed account before sending the Clerk invitation after the response", async () => {
    await setAdminViewer();
    const formData = formDataFromEntries({
      email: "new.clerk.member@example.com",
      name: "New Clerk Member",
      role: "member",
      status: "approved",
    });

    await expect(
      createManagedAccountAction("wavespark", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/admin/members?status=member_invited");

    const user = getStore().users.find(
      (candidate) => candidate.email === "new.clerk.member@example.com",
    );
    const membership = getStore().memberships.find(
      (candidate) => candidate.userId === user?.id,
    );

    expect(user).toBeDefined();
    expect(membership).toMatchObject({
      role: "member",
      status: "approved",
    });
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/members");

    await runAfterCallbacks();

    expect(createOrganizationInvitationMock).toHaveBeenCalledWith({
      emailAddress: "new.clerk.member@example.com",
      inviterUserId: "user_clerk_admin",
      organizationId: "org_clerk_wavespark",
      redirectUrl: "http://localhost:3000/org/wavespark/signin",
      role: "org:member",
      publicMetadata: {
        orgSlug: "wavespark",
        membershipId: membership?.id,
        membershipRole: "member",
      },
    });
  });

  it("creates a manual intro before writing receiver side effects after the response", async () => {
    const adminMembership = await setAdminViewer();
    const receiverMembership = (await getMembershipById("mem_jules"))!;
    const formData = formDataFromEntries({
      receiver_membership_id: receiverMembership.id,
      intro_purpose: "mentor guidance",
      note: "This intro is curated by an admin.",
    });

    await expect(
      createManualIntroAction("wavespark", adminMembership.id, formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/admin/requests?status=manual_intro_created");

    const intro = getStore().introRequests.find(
      (request) =>
        request.requesterMembershipId === adminMembership.id &&
        request.receiverMembershipId === receiverMembership.id &&
        request.sourceType === "admin_manual",
    );
    expect(intro).toBeDefined();
    expect(
      getStore().analyticsEvents.some(
        (event) =>
          event.eventName === "intro_requested" &&
          event.payload.receiverMembershipId === receiverMembership.id &&
          event.payload.sourceType === "admin_manual",
      ),
    ).toBe(false);
    expect(
      getStore().introRequests.some(
        (request) =>
          request.requesterMembershipId === adminMembership.id &&
          request.receiverMembershipId === receiverMembership.id &&
          request.sourceType === "admin_manual",
      ),
    ).toBe(true);
    await expect(getNotificationViews(receiverMembership.id)).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          title: "An admin created an introduction for you",
          link: "/org/wavespark/requests",
        }),
      ]),
    );
    expect(afterMock).toHaveBeenCalledTimes(3);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/requests");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/requests");

    await runAfterCallbacks();

    await expect(getNotificationViews(receiverMembership.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "An admin created an introduction for you",
          link: "/org/wavespark/requests",
        }),
      ]),
    );
    expect(
      getStore().analyticsEvents.some(
        (event) =>
          event.eventName === "intro_requested" &&
          event.payload.receiverMembershipId === receiverMembership.id &&
          event.payload.sourceType === "admin_manual",
      ),
    ).toBe(true);
  });

  it("updates membership status before recomputing matches after the response", async () => {
    await setAdminViewer();
    const formData = formDataFromEntries({
      status: "approved",
      approval_note: "Approved after profile review.",
    });

    await expect(
      updateMembershipAction("wavespark", "mem_priya", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/admin/members?status=membership_updated");

    await expect(getMembershipById("mem_priya")).resolves.toMatchObject({
      status: "approved",
    });
    await expect(getNotificationViews("mem_priya")).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          body: "Your membership request was approved. You can now access the feed and matches.",
          link: "/org/wavespark/feed",
        }),
      ]),
    );
    expect(afterMock).toHaveBeenCalledTimes(3);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/members");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/pending");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/org/wavespark/matches");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/org/wavespark/admin/matches");

    await runAfterCallbacks();

    await expect(getNotificationViews("mem_priya")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: "Your membership request was approved. You can now access the feed and matches.",
          link: "/org/wavespark/feed",
        }),
      ]),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/matches");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/matches");
  });

  it("updates profile flags before recomputing matches after the response", async () => {
    await setAdminViewer();
    const profile = (await getProfileByMembershipId("mem_jules"))!;
    const formData = formDataFromEntries({
      featured: "true",
      stale: "true",
    });

    await expect(
      updateProfileFlagsAction("wavespark", profile.id, formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/admin/profiles?status=profile_flags_updated");

    await expect(getProfileByMembershipId("mem_jules")).resolves.toMatchObject({
      featured: true,
      stale: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/profiles");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/org/wavespark/matches");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/org/wavespark/admin/matches");
    expect(afterMock).toHaveBeenCalledTimes(1);

    const backgroundTask = afterMock.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    await backgroundTask?.();

    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/matches");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/matches");
  });

  it("moderates opportunity posts with detail and opportunity list revalidation", async () => {
    await setAdminViewer();
    const post = getStore().posts.find((candidate) => candidate.type === "opportunity")!;
    const formData = formDataFromEntries({
      hidden: "true",
    });

    await expect(
      updatePostModerationAction("wavespark", post.id, formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/admin/posts?status=post_moderation_updated");

    expect(getStore().posts.find((candidate) => candidate.id === post.id)).toMatchObject({
      hidden: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/posts");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/org/wavespark/posts/${post.id}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/opportunities");
  });

  it("moderates comments with post detail and affected list revalidation", async () => {
    await setAdminViewer();
    const post = getStore().posts.find((candidate) => candidate.type === "opportunity")!;
    const comment = await createComment(
      {
        postId: post.id,
        authorMembershipId: "mem_jules",
        body: "This comment should be removed from member surfaces.",
      },
      { orgId: seedOrganization.id },
    );

    await expect(
      moderateCommentAction("wavespark", comment.id, "removed"),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/admin/posts?status=comment_moderation_updated");

    expect(getStore().comments.find((candidate) => candidate.id === comment.id)).toMatchObject({
      status: "removed",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/posts");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/org/wavespark/posts/${post.id}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/opportunities");
  });
});

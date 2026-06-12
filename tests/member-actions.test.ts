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

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/server", () => ({
  after: afterMock,
}));

vi.mock("@/lib/auth", () => ({
  getViewerContextForAction: vi.fn(() => viewerRef.current),
}));

import {
  createPostAction,
  followMembershipAction,
  requestIntroAction,
  respondIntroAction,
  saveOnboardingAction,
  unfollowMembershipAction,
} from "@/actions/member";
import {
  createIntroRequest,
  getIntroRequestById,
  getMembershipById,
  getProfileByMembershipId,
  getStore,
  getUserById,
  resetStore,
} from "@/server/store";
import { getNotificationViews } from "@/server/view-models";

async function setViewer(membershipId: string) {
  const membership = (await getMembershipById(membershipId))!;
  const user = (await getUserById(membership.userId))!;
  const profile = await getProfileByMembershipId(membership.id);

  viewerRef.current = {
    org: seedOrganization,
    user,
    membership,
    profile,
    canAdmin: false,
    scopes: ["org:member"],
  };
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

function firstIntroReadyTargetFor(requesterMembershipId: string) {
  const activeReceiverIds = new Set(
    getStore().introRequests
      .filter(
        (request) =>
          request.requesterMembershipId === requesterMembershipId &&
          request.status !== "expired",
      )
      .map((request) => request.receiverMembershipId),
  );

  return getStore().memberships.find((membership) => {
    const profile = getStore().profiles.find(
      (candidate) => candidate.membershipId === membership.id,
    );

    return (
      membership.id !== requesterMembershipId &&
      membership.status === "approved" &&
      profile?.introOptIn &&
      !activeReceiverIds.has(membership.id)
    );
  });
}

function firstFollowReadyTargetFor(followerMembershipId: string) {
  const followedIds = new Set(
    getStore().follows
      .filter((follow) => follow.followerMembershipId === followerMembershipId)
      .map((follow) => follow.followedMembershipId),
  );

  return getStore().memberships.find(
    (membership) =>
      membership.id !== followerMembershipId &&
      membership.status === "approved" &&
      !followedIds.has(membership.id),
  );
}

describe("member server actions", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    viewerRef.current = null;
  });

  it("saves onboarding before scheduling match recompute after the response", async () => {
    await setViewer("mem_jules");
    const formData = formDataFromEntries({
      full_name: "Jules Rivera",
      preferred_name: "Jules",
      headline: "Founder improving activation loops",
      startup_one_liner: "A product for better community activation.",
      startup_description: "We help curated communities turn profiles into useful matches.",
      looking_for_types: "mentor, cofounder",
      desired_roles: "engineering, growth",
      skill_tags: "product, growth",
      email_for_intro: "jules@example.com",
      intro_opt_in: "true",
      profile_visible_in_matching: "true",
      whatsapp_visible_after_accept: "true",
    });

    await expect(
      saveOnboardingAction("wavespark", "mem_jules", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/profile?status=profile_saved");

    await expect(getProfileByMembershipId("mem_jules")).resolves.toMatchObject({
      headline: "Founder improving activation loops",
      startupOneLiner: "A product for better community activation.",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/profile");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/pending");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/org/wavespark/matches");
    expect(afterMock).toHaveBeenCalledTimes(1);

    const backgroundTask = afterMock.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    expect(backgroundTask).toBeTypeOf("function");
    await backgroundTask?.();
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/matches");
  });

  it("creates a post before recording analytics after the response", async () => {
    await setViewer("mem_jules");
    const formData = formDataFromEntries({
      type: "ask",
      title: "Need activation review",
      body: "Looking for feedback on the first-time member journey.",
      tags: "activation, feedback",
    });

    await expect(
      createPostAction("wavespark", "mem_jules", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/feed?status=post_created");

    const post = getStore().posts.find((candidate) => candidate.title === "Need activation review");
    expect(post).toBeDefined();
    const hasPostAnalytics = () =>
      getStore().analyticsEvents.some(
        (event) =>
          event.eventName === "post_created" &&
          event.payload.postId === post?.id,
      );
    expect(hasPostAnalytics()).toBe(false);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/profile");

    const backgroundTask = afterMock.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    await backgroundTask?.();
    expect(hasPostAnalytics()).toBe(true);
  });

  it("refreshes profile activation surfaces after follow and unfollow actions", async () => {
    await setViewer("mem_jules");
    const target = firstFollowReadyTargetFor("mem_jules")!;

    await expect(
      followMembershipAction("wavespark", "mem_jules", target.id),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/matches?status=member_followed");

    expect(
      getStore().follows.some(
        (follow) =>
          follow.followerMembershipId === "mem_jules" &&
          follow.followedMembershipId === target.id,
      ),
    ).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/opportunities");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/matches");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/profile");

    vi.clearAllMocks();

    await expect(
      unfollowMembershipAction("wavespark", "mem_jules", target.id),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/matches?status=member_unfollowed");

    expect(
      getStore().follows.some(
        (follow) =>
          follow.followerMembershipId === "mem_jules" &&
          follow.followedMembershipId === target.id,
      ),
    ).toBe(false);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/opportunities");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/matches");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/profile");
  });

  it("creates an intro request before writing notification side effects after the response", async () => {
    await setViewer("mem_jules");
    const receiver = firstIntroReadyTargetFor("mem_jules")!;
    const formData = formDataFromEntries({
      receiver_membership_id: receiver.id,
      source_type: "match",
      source_id: "mtc_action",
      intro_purpose: "mentor guidance",
      note: "This request should create a notification.",
      suggested_first_message: "Would love to compare notes.",
    });

    await expect(
      requestIntroAction("wavespark", "mem_jules", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/requests?status=intro_requested");

    expect(
      getStore().introRequests.some(
        (request) =>
          request.requesterMembershipId === "mem_jules" &&
          request.receiverMembershipId === receiver.id &&
          request.sourceId === "mtc_action",
      ),
    ).toBe(true);
    await expect(getNotificationViews(receiver.id)).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          title: "A new intro request is waiting",
          link: "/org/wavespark/requests",
        }),
      ]),
    );
    expect(afterMock).toHaveBeenCalledTimes(3);
    await runAfterCallbacks();
    await expect(getNotificationViews(receiver.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "A new intro request is waiting",
          link: "/org/wavespark/requests",
        }),
      ]),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/requests");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/matches");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/profile");
  });

  it("responds to an intro before notifying the requester after the response", async () => {
    await setViewer("mem_jules");
    const intro = await createIntroRequest({
      orgId: seedOrganization.id,
      requesterMembershipId: "mem_marcus",
      receiverMembershipId: "mem_jules",
      sourceType: "post",
      sourceId: "pst_action",
      introPurpose: "co-founder conversation",
      note: "Please accept this intro.",
      status: "pending",
      suggestedFirstMessage: "A focused first message.",
    });

    await expect(
      respondIntroAction("wavespark", intro.id, "mem_jules", "accepted"),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/requests?status=intro_accepted");

    await expect(getIntroRequestById(intro.id)).resolves.toMatchObject({
      status: "accepted",
    });
    await expect(getNotificationViews("mem_marcus")).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          title: "Your intro was accepted",
          link: "/org/wavespark/requests",
        }),
      ]),
    );
    expect(afterMock).toHaveBeenCalledTimes(3);
    await runAfterCallbacks();
    await expect(getNotificationViews("mem_marcus")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Your intro was accepted",
          link: "/org/wavespark/requests",
        }),
      ]),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/requests");
  });
});

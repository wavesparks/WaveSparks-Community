import { beforeEach, describe, expect, it, vi } from "vitest";

import { seedOrganization } from "@/data/seed-data";
import type { MatchRecord, Space, ViewerContext } from "@/lib/domain";

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
  savePostAction,
  saveOnboardingAction,
  unfollowMembershipAction,
  unsavePostAction,
} from "@/actions/member";
import {
  createIntroRequest,
  getIntroRequestById,
  getMembershipById,
  getProfileByMembershipId,
  getStore,
  getUserById,
  listSavedPostIdsForMembership,
  resetStore,
} from "@/server/store";
import { getNotificationViews } from "@/server/view-models";
import { canAccessFeed } from "@/server/permissions";
import { MATCHING_ALGORITHM_VERSION } from "@/server/matching";

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
    isApprovedMentor: membership.mentorStatus === "approved",
    canMentor: membership.mentorStatus === "approved",
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

function addSpace(kind: Space["kind"], id: string) {
  const mainSpace = getStore().spaces.find((space) => space.kind === "main")!;
  const space: Space = {
    ...mainSpace,
    id,
    slug: id,
    kind,
    name: kind === "main" ? "Wavesparks Community" : "Security Test Event",
    eventLabel: kind === "main" ? "Community" : "Security test",
  };
  getStore().spaces.push(space);
  return space;
}

function addMatchSource(input: {
  id: string;
  spaceId: string;
  sourceProfileId: string;
  targetProfileId: string;
}) {
  const now = new Date().toISOString();
  const match: MatchRecord = {
    id: input.id,
    orgId: seedOrganization.id,
    spaceId: input.spaceId,
    sourceProfileId: input.sourceProfileId,
    targetProfileId: input.targetProfileId,
    matchType: "mentor_match",
    score: 91,
    scoreBreakdown: {},
    explanationText: "Action validation fixture.",
    overlapTags: [],
    scoreBand: "high",
    confidence: "high",
    algorithmVersion: MATCHING_ALGORITHM_VERSION,
    surfacedAt: now,
    dismissedBySource: false,
    hiddenByAdmin: false,
    createdAt: now,
    updatedAt: now,
  };
  getStore().matches.push(match);
  return match;
}

describe("member server actions", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    viewerRef.current = null;
  });

  it("rejects account and social writes until the organization account is connected", async () => {
    await setViewer("mem_jules");
    viewerRef.current = {
      ...viewerRef.current!,
      membership: {
        ...viewerRef.current!.membership,
        accountStatus: "invited",
      },
    };

    await expect(
      saveOnboardingAction("wavesparks", "mem_jules", new FormData()),
    ).rejects.toThrow("Connected account required.");
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("saves onboarding before scheduling match recompute after the response", async () => {
    await setViewer("mem_jules");
    const formData = formDataFromEntries({
      full_name: "Jules Rivera",
      preferred_name: "Jules",
      headline: "Founder improving activation loops",
      bio: "I am a product builder who enjoys helping communities learn together.",
      problem_interest: "I care about the trust gap that makes online introductions awkward.",
      current_focus: "Learning how lightweight profiles can start useful conversations.",
      technical_experience_level: "guided",
      technical_experience: "I can prototype product flows and write small scripts with guidance.",
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
      saveOnboardingAction("wavesparks", "mem_jules", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/profile?status=profile_saved");

    await expect(getProfileByMembershipId("mem_jules")).resolves.toMatchObject({
      headline: "Founder improving activation loops",
      bio: "I am a product builder who enjoys helping communities learn together.",
      problemInterest: "I care about the trust gap that makes online introductions awkward.",
      currentFocus: "Learning how lightweight profiles can start useful conversations.",
      technicalExperienceLevel: "guided",
      technicalExperience: "I can prototype product flows and write small scripts with guidance.",
      startupOneLiner: "A product for better community activation.",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/profile");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/pending");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/org/wavesparks/matches");
    expect(afterMock).toHaveBeenCalledTimes(1);

    const backgroundTask = afterMock.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    expect(backgroundTask).toBeTypeOf("function");
    await backgroundTask?.();
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/matches");
  });

  it("saves an incomplete onboarding draft without unlocking member interaction", async () => {
    await setViewer("mem_jules");
    const formData = formDataFromEntries({
      full_name: "Jules Rivera",
      preferred_name: "Jules",
      headline: "",
      bio: "",
      current_focus: "",
      skill_tags: "",
      email_for_intro: "jules@example.com",
      intent: "draft",
      matching_intent_version: "2",
    });

    await expect(saveOnboardingAction("wavesparks", "mem_jules", formData)).rejects.toThrow(
      /NEXT_REDIRECT:\/org\/wavesparks\/onboarding\?status=profile_draft_saved&step=0&missing=/,
    );

    const membership = (await getMembershipById("mem_jules"))!;
    const profile = (await getProfileByMembershipId("mem_jules"))!;
    expect(profile.onboardingComplete).toBe(false);
    expect(profile.headline).toBe("");
    expect(canAccessFeed(membership, profile)).toBe(false);
  });

  it("rejects invalid profile email, links, and field values before saving", async () => {
    await setViewer("mem_jules");
    const before = (await getProfileByMembershipId("mem_jules"))!;
    const formData = formDataFromEntries({
      email_for_intro: "not-an-email",
      linkedin_url: "javascript:alert(1)",
      technical_experience_level: "expert-ish",
      max_mentees: "101",
    });

    await expect(saveOnboardingAction("wavesparks", "mem_jules", formData)).rejects.toThrow(
      /NEXT_REDIRECT:\/org\/wavesparks\/onboarding\?status=profile_invalid&fields=/,
    );

    expect((await getProfileByMembershipId("mem_jules"))?.updatedAt).toBe(before.updatedAt);
    expect(afterMock).not.toHaveBeenCalled();
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
      createPostAction("wavesparks", "mem_jules", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/feed?status=post_created");

    const post = getStore().posts.find((candidate) => candidate.title === "Need activation review");
    expect(post).toBeDefined();
    const hasPostAnalytics = () =>
      getStore().analyticsEvents.some(
        (event) =>
          event.eventName === "post_created" &&
          event.payload.postId === post?.id,
      );
    expect(hasPostAnalytics()).toBe(false);
    expect(afterMock).toHaveBeenCalledTimes(2);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/profile");

    const backgroundTasks = afterMock.mock.calls.map(
      ([task]) => task as () => Promise<void>,
    );
    await Promise.all(backgroundTasks.map((task) => task()));
    expect(hasPostAnalytics()).toBe(true);
    expect(getStore().matchRuns).not.toHaveLength(0);
  });

  it("refreshes profile activation surfaces after follow and unfollow actions", async () => {
    await setViewer("mem_jules");
    const target = firstFollowReadyTargetFor("mem_jules")!;

    await expect(
      followMembershipAction("wavesparks", "mem_jules", target.id),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/matches?status=member_followed");

    expect(
      getStore().follows.some(
        (follow) =>
          follow.followerMembershipId === "mem_jules" &&
          follow.followedMembershipId === target.id,
      ),
    ).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/opportunities");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/matches");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/profile");

    vi.clearAllMocks();

    await expect(
      unfollowMembershipAction("wavesparks", "mem_jules", target.id),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/matches?status=member_unfollowed");

    expect(
      getStore().follows.some(
        (follow) =>
          follow.followerMembershipId === "mem_jules" &&
          follow.followedMembershipId === target.id,
      ),
    ).toBe(false);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/opportunities");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/matches");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/profile");
  });

  it("creates an intro request before writing notification side effects after the response", async () => {
    await setViewer("mem_jules");
    const receiver = firstIntroReadyTargetFor("mem_jules")!;
    const receiverProfile = (await getProfileByMembershipId(receiver.id))!;
    const mainSpace = getStore().spaces.find((space) => space.kind === "main")!;
    const sourceMatch = addMatchSource({
      id: "mtc_action",
      spaceId: mainSpace.id,
      sourceProfileId: viewerRef.current!.profile!.id,
      targetProfileId: receiverProfile.id,
    });
    const formData = formDataFromEntries({
      receiver_membership_id: receiver.id,
      source_type: "match",
      source_id: sourceMatch.id,
      intro_purpose: "mentor guidance",
      note: "This request should create a notification.",
      suggested_first_message: "Would love to compare notes.",
    });

    await expect(
      requestIntroAction("wavesparks", "mem_jules", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/requests?status=mentoring_requested");

    expect(
      getStore().introRequests.some(
        (request) =>
          request.requesterMembershipId === "mem_jules" &&
          request.receiverMembershipId === receiver.id &&
          request.sourceId === sourceMatch.id &&
          request.kind === "mentoring",
      ),
    ).toBe(true);
    await expect(getNotificationViews(receiver.id)).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          title: "New mentoring request in Wavesparks Community",
          link: "/org/wavesparks/mentoring",
        }),
      ]),
    );
    expect(afterMock).toHaveBeenCalledTimes(3);
    await runAfterCallbacks();
    await expect(getNotificationViews(receiver.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: "Someone in Wavesparks Community would like mentoring guidance from you.",
          title: "New mentoring request in Wavesparks Community",
          link: "/org/wavesparks/mentoring",
        }),
      ]),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/requests");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/matches");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/profile");
  });

  it("rejects an Event post source through the legacy Main intro action", async () => {
    await setViewer("mem_jules");
    const receiver = firstIntroReadyTargetFor("mem_jules")!;
    const eventSpace = addSpace("event", "spc_event_intro_post");
    const sourcePost = {
      ...getStore().posts[0]!,
      id: "pst_event_intro_source",
      spaceId: eventSpace.id,
      authorMembershipId: receiver.id,
    };
    getStore().posts.push(sourcePost);
    const formData = formDataFromEntries({
      receiver_membership_id: receiver.id,
      source_type: "post",
      source_id: sourcePost.id,
      intro_purpose: "cross-space attempt",
    });

    await expect(
      requestIntroAction("wavesparks", "mem_jules", formData),
    ).rejects.toThrow(
      "This post does not belong to the selected member in this community or event.",
    );
    expect(
      getStore().introRequests.some((request) => request.sourceId === sourcePost.id),
    ).toBe(false);
  });

  it("rejects an Event match source through the legacy Main intro action", async () => {
    await setViewer("mem_jules");
    const receiver = firstIntroReadyTargetFor("mem_jules")!;
    const receiverProfile = (await getProfileByMembershipId(receiver.id))!;
    const eventSpace = addSpace("event", "spc_event_intro_match");
    const sourceMatch = addMatchSource({
      id: "mtc_event_intro_source",
      spaceId: eventSpace.id,
      sourceProfileId: viewerRef.current!.profile!.id,
      targetProfileId: receiverProfile.id,
    });
    const formData = formDataFromEntries({
      receiver_membership_id: receiver.id,
      source_type: "match",
      source_id: sourceMatch.id,
      intro_purpose: "cross-space attempt",
    });

    await expect(
      requestIntroAction("wavesparks", "mem_jules", formData),
    ).rejects.toThrow(
      "This match does not belong to these members in this community or event.",
    );
    expect(
      getStore().introRequests.some((request) => request.sourceId === sourceMatch.id),
    ).toBe(false);
  });

  it("creates profile-sourced intro requests from member discovery", async () => {
    await setViewer("mem_jules");
    const receiver = firstIntroReadyTargetFor("mem_jules")!;
    const receiverProfile = (await getProfileByMembershipId(receiver.id))!;
    const formData = formDataFromEntries({
      receiver_membership_id: receiver.id,
      source_type: "profile",
      source_id: receiverProfile.id,
      intro_purpose: "profile discovery",
      note: "This profile surfaced through member discovery.",
      suggested_first_message: "Would love to compare notes.",
    });

    await expect(
      requestIntroAction("wavesparks", "mem_jules", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/requests?status=intro_requested");

    expect(
      getStore().introRequests.some(
        (request) =>
          request.requesterMembershipId === "mem_jules" &&
          request.receiverMembershipId === receiver.id &&
          request.sourceType === "profile" &&
          request.sourceId === receiverProfile.id,
      ),
    ).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/people");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/org/wavesparks/people/${receiver.id}`);
  });

  it("rejects a forged mentoring kind for a profile without mentor approval", async () => {
    await setViewer("mem_jules");
    const receiver = (await getMembershipById("mem_rhea"))!;
    const receiverProfile = (await getProfileByMembershipId(receiver.id))!;
    const formData = formDataFromEntries({
      receiver_membership_id: receiver.id,
      source_type: "profile",
      source_id: receiverProfile.id,
      intro_kind: "mentoring",
      intro_purpose: "forged mentoring request",
      note: "A client must not be able to invent mentor approval.",
      suggested_first_message: "This should not be delivered.",
    });

    await expect(
      requestIntroAction("wavesparks", "mem_jules", formData),
    ).rejects.toThrow("This member is not an Approved Mentor.");
    expect(
      getStore().introRequests.some(
        (request) =>
          request.requesterMembershipId === "mem_jules" &&
          request.receiverMembershipId === receiver.id &&
          request.introPurpose === "forged mentoring request",
      ),
    ).toBe(false);
  });

  it("accepts mentoring kind from an Approved Mentor profile entry", async () => {
    await setViewer("mem_jules");
    const receiver = (await getMembershipById("mem_marcus"))!;
    const receiverProfile = (await getProfileByMembershipId(receiver.id))!;
    const formData = formDataFromEntries({
      receiver_membership_id: receiver.id,
      source_type: "profile",
      source_id: receiverProfile.id,
      intro_kind: "mentoring",
      intro_purpose: "mentor profile request",
      note: "This request came from the canonical mentor profile entry.",
      suggested_first_message: "Would you be open to a mentoring conversation?",
    });

    await expect(
      requestIntroAction("wavesparks", "mem_jules", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/requests?status=mentoring_requested");
    expect(
      getStore().introRequests.some(
        (request) =>
          request.requesterMembershipId === "mem_jules" &&
          request.receiverMembershipId === receiver.id &&
          request.kind === "mentoring" &&
          request.sourceType === "profile" &&
          request.sourceId === receiverProfile.id,
      ),
    ).toBe(true);
  });

  it("allows a new general request after a declined introduction becomes history", async () => {
    await setViewer("mem_jules");
    const receiver = (await getMembershipById("mem_rhea"))!;
    const receiverProfile = (await getProfileByMembershipId(receiver.id))!;
    expect(
      getStore().introRequests.some(
        (request) =>
          request.requesterMembershipId === receiver.id &&
          request.receiverMembershipId === "mem_jules" &&
          request.status === "declined",
      ),
    ).toBe(true);
    const formData = formDataFromEntries({
      receiver_membership_id: receiver.id,
      source_type: "profile",
      source_id: receiverProfile.id,
      intro_kind: "general",
      intro_purpose: "reconnect after resolved history",
      note: "The prior request is resolved, so this should be a fresh conversation.",
      suggested_first_message: "Would you be open to reconnecting?",
    });

    await expect(
      requestIntroAction("wavesparks", "mem_jules", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/requests?status=intro_requested");
    expect(
      getStore().introRequests.some(
        (request) =>
          request.requesterMembershipId === "mem_jules" &&
          request.receiverMembershipId === receiver.id &&
          request.status === "pending",
      ),
    ).toBe(true);
  });

  it("keeps general introductions but rejects mentoring after an Approved Mentor pauses the offering", async () => {
    await setViewer("mem_jules");
    const receiver = (await getMembershipById("mem_marcus"))!;
    const receiverProfile = (await getProfileByMembershipId(receiver.id))!;
    receiverProfile.offeringMatchTypes = receiverProfile.offeringMatchTypes.filter(
      (matchType) => matchType !== "mentor_match",
    );
    const mentoringForm = formDataFromEntries({
      receiver_membership_id: receiver.id,
      source_type: "profile",
      source_id: receiverProfile.id,
      intro_kind: "mentoring",
      intro_purpose: "paused mentoring request",
      note: "This should respect the mentor offering.",
      suggested_first_message: "Would you be open to mentoring?",
    });

    await expect(
      requestIntroAction("wavesparks", "mem_jules", mentoringForm),
    ).rejects.toThrow("This mentor is not accepting mentoring requests.");

    const generalForm = formDataFromEntries({
      receiver_membership_id: receiver.id,
      source_type: "profile",
      source_id: receiverProfile.id,
      intro_kind: "general",
      intro_purpose: "general request while mentoring is paused",
      note: "A general introduction should remain available.",
      suggested_first_message: "Would you be open to a general conversation?",
    });

    await expect(
      requestIntroAction("wavesparks", "mem_jules", generalForm),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/requests?status=intro_requested");
    expect(
      getStore().introRequests.find(
        (request) => request.introPurpose === "general request while mentoring is paused",
      ),
    ).toMatchObject({ kind: "general", receiverMembershipId: receiver.id });
  });

  it("rejects a stale mentor match after the mentor pauses the offering", async () => {
    await setViewer("mem_jules");
    const receiver = (await getMembershipById("mem_kai"))!;
    const receiverProfile = (await getProfileByMembershipId(receiver.id))!;
    receiverProfile.offeringMatchTypes = receiverProfile.offeringMatchTypes.filter(
      (matchType) => matchType !== "mentor_match",
    );
    const mainSpace = getStore().spaces.find((space) => space.kind === "main")!;
    const sourceMatch = addMatchSource({
      id: "mtc_paused_mentor_source",
      spaceId: mainSpace.id,
      sourceProfileId: viewerRef.current!.profile!.id,
      targetProfileId: receiverProfile.id,
    });
    const formData = formDataFromEntries({
      receiver_membership_id: receiver.id,
      source_type: "match",
      source_id: sourceMatch.id,
      intro_purpose: "stale mentor match request",
      note: "The offering has been paused.",
      suggested_first_message: "Would you be open to mentoring?",
    });

    await expect(
      requestIntroAction("wavesparks", "mem_jules", formData),
    ).rejects.toThrow("This mentor match is no longer available.");
    expect(
      getStore().introRequests.some((request) => request.sourceId === sourceMatch.id),
    ).toBe(false);
  });

  it("saves and unsaves posts through server actions", async () => {
    await setViewer("mem_jules");
    const formData = formDataFromEntries({
      return_to: "/org/wavesparks/knowledge?mode=saved",
    });

    await expect(
      savePostAction("wavesparks", "mem_jules", "pst_8", formData),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavesparks/knowledge?mode=saved&status=post_saved",
    );
    await expect(
      listSavedPostIdsForMembership("mem_jules", { postIds: ["pst_8"] }),
    ).resolves.toHaveProperty("size", 1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/knowledge");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/posts/pst_8");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/org/wavesparks/s/main/knowledge",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/org/wavesparks/s/main/posts/pst_8",
    );

    vi.clearAllMocks();

    await expect(
      unsavePostAction("wavesparks", "mem_jules", "pst_8", formData),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavesparks/knowledge?mode=saved&status=post_unsaved",
    );
    await expect(
      listSavedPostIdsForMembership("mem_jules", { postIds: ["pst_8"] }),
    ).resolves.toHaveProperty("size", 0);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/knowledge");
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
      respondIntroAction("wavesparks", intro.id, "mem_jules", "accepted"),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/requests?status=intro_accepted");

    await expect(getIntroRequestById(intro.id)).resolves.toMatchObject({
      status: "accepted",
    });
    await expect(getNotificationViews("mem_marcus")).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          title: "Your intro was accepted",
          link: "/org/wavesparks/s/main/requests",
        }),
      ]),
    );
    expect(afterMock).toHaveBeenCalledTimes(3);
    await runAfterCallbacks();
    await expect(getNotificationViews("mem_marcus")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Your intro was accepted",
          link: "/org/wavesparks/s/main/requests",
        }),
      ]),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/requests");
  });
});

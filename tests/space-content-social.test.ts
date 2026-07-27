import { beforeEach, describe, expect, it } from "vitest";

import { buildNotification } from "@/server/notifications";
import {
  addNotification,
  archiveEventSpace,
  createCommentInSpace,
  createEventSpace,
  createIntroRequestInSpace,
  createPostInSpace,
  followMembershipInSpace,
  getPendingIntroRequestBetweenMembershipsInSpace,
  getPostByIdInSpace,
  getPostThreadRecordForSpace,
  getProfileByMembershipId,
  grantSpaceMembership,
  listFollowedMembershipIdsForMembershipInSpace,
  listIntroRequestsForMembershipInSpace,
  listIntroRequestsForMembershipWithSpaceAccess,
  listActiveSpaceMemberRecords,
  listNotificationsForMembershipInSpace,
  listNotificationsForMembershipWithSpaceAccess,
  listPostsForSpace,
  listSavedPostIdsForMembershipInSpace,
  listSpacesForOrg,
  resetStore,
  respondToIntroRequestInSpace,
  savePostForMembershipInSpace,
  setSpaceMembershipAccessStatus,
  updateMembershipAccountStatus,
} from "@/server/store";
import {
  getFeedViewsForSpace,
  getMemberDirectoryViewsForSpace,
} from "@/server/view-models";
import { seedOrganization } from "@/data/seed-data";

async function createTestSpace(name: string) {
  return createEventSpace({
    orgId: seedOrganization.id,
    name,
    lifecycle: "active",
  });
}

async function grant(spaceId: string, membershipId: string) {
  return grantSpaceMembership({
    orgId: seedOrganization.id,
    spaceId,
    membershipId,
    joinedVia: "direct",
  });
}

async function createTestPost(
  spaceId: string,
  authorMembershipId: string,
  title: string,
) {
  return createPostInSpace(
    {
      orgId: seedOrganization.id,
      spaceId,
      authorMembershipId,
      type: "general_update",
      title,
      body: `Body for ${title}`,
      tags: [],
      relatedStartupName: "",
      relatedRolesNeeded: [],
      status: "active",
      featured: false,
      hidden: false,
      commentsLocked: false,
    },
    { recordAnalytics: false },
  );
}

describe("Space-scoped content and social data", () => {
  beforeEach(() => {
    resetStore();
  });

  it("isolates feed, direct post reads, comments, and People by Space", async () => {
    const eventA = await createTestSpace("Event Alpha");
    const eventB = await createTestSpace("Event Beta");
    await Promise.all([
      grant(eventA.id, "mem_jules"),
      grant(eventA.id, "mem_kai"),
      grant(eventB.id, "mem_jules"),
      grant(eventB.id, "mem_marcus"),
    ]);

    const postA = await createTestPost(eventA.id, "mem_kai", "Alpha only");
    const postB = await createTestPost(eventB.id, "mem_marcus", "Beta only");
    await createCommentInSpace(
      eventA.id,
      {
        postId: postA.id,
        authorMembershipId: "mem_jules",
        body: "Visible only with the Alpha thread.",
      },
      { recordAnalytics: false },
    );

    await expect(listPostsForSpace(eventA.id)).resolves.toEqual([
      expect.objectContaining({ id: postA.id, spaceId: eventA.id }),
    ]);
    await expect(getPostByIdInSpace(eventA.id, postB.id)).resolves.toBeUndefined();
    await expect(getPostThreadRecordForSpace(eventB.id, postA.id)).resolves.toBeUndefined();
    await expect(getPostThreadRecordForSpace(eventA.id, postA.id)).resolves.toMatchObject({
      post: { id: postA.id },
      comments: [expect.objectContaining({ comment: expect.objectContaining({ postId: postA.id }) })],
    });

    const feedA = await getFeedViewsForSpace(eventA.id, seedOrganization, {
      viewerMembershipId: "mem_jules",
      viewerProfileId: "pro_jules",
    });
    expect(feedA.map((post) => post.id)).toContain(postA.id);
    expect(feedA.map((post) => post.id)).not.toContain(postB.id);

    const peopleA = await getMemberDirectoryViewsForSpace(
      eventA.id,
      seedOrganization,
      { viewerMembershipId: "mem_jules" },
    );
    expect(peopleA.map((profile) => profile.membershipId)).toEqual(
      expect.arrayContaining(["mem_jules", "mem_kai"]),
    );
    expect(peopleA.map((profile) => profile.membershipId)).not.toContain("mem_marcus");
  });

  it("keeps follows and saved-post reads inside their explicit Space", async () => {
    const eventA = await createTestSpace("Follow Alpha");
    const eventB = await createTestSpace("Follow Beta");
    await Promise.all([
      grant(eventA.id, "mem_jules"),
      grant(eventA.id, "mem_leila"),
      grant(eventB.id, "mem_jules"),
      grant(eventB.id, "mem_leila"),
    ]);
    const postA = await createTestPost(eventA.id, "mem_leila", "Save in Alpha");

    await followMembershipInSpace({
      orgId: seedOrganization.id,
      spaceId: eventA.id,
      followerMembershipId: "mem_jules",
      followedMembershipId: "mem_leila",
    });
    await expect(
      listFollowedMembershipIdsForMembershipInSpace(eventA.id, "mem_jules"),
    ).resolves.toEqual(["mem_leila"]);
    await expect(
      listFollowedMembershipIdsForMembershipInSpace(eventB.id, "mem_jules"),
    ).resolves.toEqual([]);
    await expect(
      followMembershipInSpace({
        orgId: seedOrganization.id,
        spaceId: eventB.id,
        followerMembershipId: "mem_jules",
        followedMembershipId: "mem_leila",
      }),
    ).resolves.toMatchObject({ spaceId: eventB.id });

    await savePostForMembershipInSpace(
      seedOrganization.id,
      eventA.id,
      "mem_jules",
      postA.id,
    );
    await expect(
      listSavedPostIdsForMembershipInSpace(eventA.id, "mem_jules"),
    ).resolves.toHaveProperty("size", 1);
    await expect(
      listSavedPostIdsForMembershipInSpace(eventB.id, "mem_jules", {
        postIds: [postA.id],
      }),
    ).resolves.toEqual(new Map());
    await expect(
      savePostForMembershipInSpace(
        seedOrganization.id,
        eventB.id,
        "mem_jules",
        postA.id,
      ),
    ).rejects.toThrow("Post not found in this community or event.");
  });

  it("allows one pending Intro per unordered pair across the organization", async () => {
    const eventA = await createTestSpace("Intro Alpha");
    const eventB = await createTestSpace("Intro Beta");
    await Promise.all([
      grant(eventA.id, "mem_jules"),
      grant(eventA.id, "mem_leila"),
      grant(eventB.id, "mem_jules"),
      grant(eventB.id, "mem_leila"),
    ]);
    const leilaProfile = (await getProfileByMembershipId("mem_leila"))!;
    const julesProfile = (await getProfileByMembershipId("mem_jules"))!;
    const introInput = {
      orgId: seedOrganization.id,
      requesterMembershipId: "mem_jules",
      receiverMembershipId: "mem_leila",
      sourceType: "profile" as const,
      sourceId: leilaProfile.id,
      introPurpose: "event conversation",
      note: "Same people, separate event context.",
      status: "pending" as const,
      suggestedFirstMessage: "Would love to compare notes.",
    };

    const introA = await createIntroRequestInSpace({
      ...introInput,
      spaceId: eventA.id,
    });
    await expect(
      createIntroRequestInSpace({
        ...introInput,
        spaceId: eventA.id,
        requesterMembershipId: "mem_leila",
        receiverMembershipId: "mem_jules",
        sourceId: julesProfile.id,
      }),
    ).rejects.toThrow(
      "These two people already have a pending introduction request here.",
    );
    await expect(
      createIntroRequestInSpace({ ...introInput, spaceId: eventB.id }),
    ).rejects.toThrow(
      "These two people already have a pending introduction request here.",
    );

    await respondToIntroRequestInSpace(eventA.id, introA.id, "accepted", {
      recordAnalytics: false,
    });
    await expect(
      createIntroRequestInSpace({ ...introInput, spaceId: eventB.id }),
    ).resolves.toMatchObject({ spaceId: eventB.id });

    await expect(
      getPendingIntroRequestBetweenMembershipsInSpace(
        eventA.id,
        "mem_leila",
        "mem_jules",
      ),
    ).resolves.toBeUndefined();
    await expect(
      listIntroRequestsForMembershipInSpace(eventB.id, "mem_jules"),
    ).resolves.toHaveLength(1);
  });

  it("shows account notifications plus only authorized Space notifications", async () => {
    const eventA = await createTestSpace("Notify Alpha");
    const eventB = await createTestSpace("Notify Beta");
    await Promise.all([
      grant(eventA.id, "mem_jules"),
      grant(eventB.id, "mem_jules"),
    ]);
    await addNotification(
      buildNotification(
        "ntf_alpha",
        seedOrganization.id,
        "mem_jules",
        "admin_note",
        "Alpha note",
        "Alpha body",
        `/org/wavesparks/s/${eventA.slug}/requests`,
        eventA.id,
      ),
    );
    await addNotification(
      buildNotification(
        "ntf_beta",
        seedOrganization.id,
        "mem_jules",
        "admin_note",
        "Beta note",
        "Beta body",
        `/org/wavesparks/s/${eventB.slug}/requests`,
        eventB.id,
      ),
    );
    await addNotification(
      buildNotification(
        "ntf_account",
        seedOrganization.id,
        "mem_jules",
        "admin_note",
        "Account note",
        "Account body",
        "/org/wavesparks/profile",
      ),
    );

    const alphaOnly = await listNotificationsForMembershipInSpace(
      eventA.id,
      "mem_jules",
    );
    expect(alphaOnly.map((notification) => notification.id)).toEqual(["ntf_alpha"]);

    const inbox = await listNotificationsForMembershipWithSpaceAccess(
      "mem_jules",
      [eventA.id],
    );
    expect(inbox.map((notification) => notification.id)).toEqual(
      expect.arrayContaining(["ntf_alpha", "ntf_account"]),
    );
    expect(inbox.map((notification) => notification.id)).not.toContain("ntf_beta");
  });

  it("rejects a Space notification whose direct link targets another Space", async () => {
    const eventA = await createTestSpace("Link Owner Alpha");
    const eventB = await createTestSpace("Link Target Beta");
    await Promise.all([
      grant(eventA.id, "mem_jules"),
      grant(eventB.id, "mem_jules"),
    ]);

    await expect(
      addNotification(
        buildNotification(
          "ntf_wrong_space_link",
          seedOrganization.id,
          "mem_jules",
          "admin_note",
          "Wrong direct link",
          "The payload scope and destination disagree.",
          `/org/wavesparks/s/${eventB.slug}/requests`,
          eventA.id,
        ),
      ),
    ).rejects.toThrow("must target its owning Space");
  });

  it("allows only an approved mentor's authoritative pending request to link to Mentoring", async () => {
    const event = await createTestSpace("Mentoring Notification Event");
    await Promise.all([
      grant(event.id, "mem_jules"),
      grant(event.id, "mem_marcus"),
    ]);
    const mentorProfile = (await getProfileByMembershipId("mem_marcus"))!;
    await createIntroRequestInSpace(
      {
        orgId: seedOrganization.id,
        spaceId: event.id,
        requesterMembershipId: "mem_jules",
        receiverMembershipId: "mem_marcus",
        kind: "mentoring",
        sourceType: "profile",
        sourceId: mentorProfile.id,
        introPurpose: "Mentoring guidance",
        note: "A canonical mentoring request.",
        status: "pending",
        suggestedFirstMessage: "Would you be open to a mentoring conversation?",
      },
      { recordAnalytics: false },
    );

    await expect(
      addNotification(
        buildNotification(
          "ntf_mentoring_workspace",
          seedOrganization.id,
          "mem_marcus",
          "intro_requested",
          "New mentoring request",
          "Review this request in Mentoring.",
          "/org/wavesparks/mentoring",
          event.id,
        ),
      ),
    ).resolves.toBeUndefined();

    await expect(
      addNotification(
        buildNotification(
          "ntf_forged_mentoring_workspace",
          seedOrganization.id,
          "mem_jules",
          "intro_requested",
          "Forged mentoring request",
          "This recipient is not an approved mentor.",
          "/org/wavesparks/mentoring",
          event.id,
        ),
      ),
    ).rejects.toThrow("must target its owning Space");
  });

  it("retains completed private Intro history without retaining pending access", async () => {
    const event = await createTestSpace("History Event");
    await Promise.all([
      grant(event.id, "mem_jules"),
      grant(event.id, "mem_leila"),
      grant(event.id, "mem_kai"),
    ]);
    const leilaProfile = (await getProfileByMembershipId("mem_leila"))!;
    const kaiProfile = (await getProfileByMembershipId("mem_kai"))!;
    const completed = await createIntroRequestInSpace({
      orgId: seedOrganization.id,
      spaceId: event.id,
      requesterMembershipId: "mem_jules",
      receiverMembershipId: "mem_leila",
      sourceType: "profile",
      sourceId: leilaProfile.id,
      introPurpose: "completed history",
      note: "This private history survives Space removal.",
      status: "pending",
      suggestedFirstMessage: "Hello Leila.",
    });
    await respondToIntroRequestInSpace(event.id, completed.id, "accepted", {
      recordAnalytics: false,
    });
    const pending = await createIntroRequestInSpace({
      orgId: seedOrganization.id,
      spaceId: event.id,
      requesterMembershipId: "mem_jules",
      receiverMembershipId: "mem_kai",
      sourceType: "profile",
      sourceId: kaiProfile.id,
      introPurpose: "pending history",
      note: "This pending request must disappear with access.",
      status: "pending",
      suggestedFirstMessage: "Hello Kai.",
    });
    await addNotification(
      buildNotification(
        "ntf_removed_space",
        seedOrganization.id,
        "mem_jules",
        "intro_accepted",
        "Accepted in History Event",
        "Space-scoped notification content.",
        `/org/wavesparks/s/${event.slug}/requests`,
        event.id,
      ),
    );

    await setSpaceMembershipAccessStatus({
      orgId: seedOrganization.id,
      spaceId: event.id,
      membershipId: "mem_jules",
      accessStatus: "removed",
    });

    const history = await listIntroRequestsForMembershipWithSpaceAccess(
      "mem_jules",
      [],
    );
    expect(history.map((request) => request.id)).toContain(completed.id);
    expect(history.map((request) => request.id)).not.toContain(pending.id);
    expect(
      (await listNotificationsForMembershipWithSpaceAccess("mem_jules", [])).map(
        (notification) => notification.id,
      ),
    ).not.toContain("ntf_removed_space");
    expect(
      (await listActiveSpaceMemberRecords(event.id)).map(
        (record) => record.membership.id,
      ),
    ).not.toContain("mem_jules");
  });

  it("rechecks saved-post and notification access after Space removal", async () => {
    const event = await createTestSpace("Revoked Content Event");
    await grant(event.id, "mem_jules");
    const post = await createTestPost(event.id, "mem_jules", "Revoked save");
    await savePostForMembershipInSpace(
      seedOrganization.id,
      event.id,
      "mem_jules",
      post.id,
    );
    await addNotification(
      buildNotification(
        "ntf_revoked_content",
        seedOrganization.id,
        "mem_jules",
        "intro_accepted",
        "Revoked content",
        "This must disappear after removal.",
        `/org/wavesparks/s/${event.slug}/requests`,
        event.id,
      ),
    );

    await setSpaceMembershipAccessStatus({
      orgId: seedOrganization.id,
      spaceId: event.id,
      membershipId: "mem_jules",
      accessStatus: "removed",
    });

    await expect(
      listSavedPostIdsForMembershipInSpace(event.id, "mem_jules"),
    ).rejects.toThrow(/active access to this community or event/i);
    await expect(
      listNotificationsForMembershipInSpace(event.id, "mem_jules"),
    ).rejects.toThrow(/active access to this community or event/i);
    await expect(
      listNotificationsForMembershipWithSpaceAccess("mem_jules", [event.id]),
    ).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "ntf_revoked_content" }),
      ]),
    );
  });

  it("fails closed for saved posts and notifications when a Space is archived", async () => {
    const event = await createTestSpace("Archived Content Event");
    await grant(event.id, "mem_jules");
    const post = await createTestPost(event.id, "mem_jules", "Archived save");
    await savePostForMembershipInSpace(
      seedOrganization.id,
      event.id,
      "mem_jules",
      post.id,
    );
    await archiveEventSpace(seedOrganization.id, event.id);

    await expect(
      listSavedPostIdsForMembershipInSpace(event.id, "mem_jules"),
    ).rejects.toThrow("This community or event is not available right now.");
    await expect(
      listNotificationsForMembershipInSpace(event.id, "mem_jules"),
    ).rejects.toThrow("This community or event is not available right now.");
    await expect(
      savePostForMembershipInSpace(
        seedOrganization.id,
        event.id,
        "mem_jules",
        post.id,
      ),
    ).rejects.toThrow("This community or event is not available right now.");
  });

  it("persists invited access notifications but only exposes them after connection", async () => {
    const mainSpace = (await listSpacesForOrg(seedOrganization.id)).find(
      (space) => space.kind === "main",
    )!;
    await updateMembershipAccountStatus("mem_jules", "invited", {
      recomputeMatches: false,
    });
    await expect(
      addNotification(
        buildNotification(
          "ntf_invited_main_access",
          seedOrganization.id,
          "mem_jules",
          "membership_approved",
          "Wavesparks Community access granted",
          "Connect your account to open Wavesparks Community.",
          `/org/wavesparks/s/${mainSpace.slug}`,
          mainSpace.id,
        ),
      ),
    ).resolves.toBeUndefined();
    await expect(
      listNotificationsForMembershipWithSpaceAccess("mem_jules", [mainSpace.id]),
    ).resolves.toEqual([]);

    await updateMembershipAccountStatus("mem_jules", "connected", {
      recomputeMatches: false,
    });
    await expect(
      listNotificationsForMembershipWithSpaceAccess("mem_jules", [mainSpace.id]),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "ntf_invited_main_access" }),
      ]),
    );
  });
});

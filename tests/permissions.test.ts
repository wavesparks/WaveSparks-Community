import { describe, expect, it, beforeEach } from "vitest";

import {
  canAccessFeed,
  canUseMentorFeatures,
  canViewAdminRoute,
  canViewContactDetails,
} from "@/server/permissions";
import { seedOrganization } from "@/data/seed-data";
import {
  addNotification,
  createIntroRequest,
  createManagedAccount,
  ensureMembership,
  getIntroRequestById,
  getMembershipById,
  getMembershipRecordById,
  getProfileByMembershipId,
  getUserById,
  getViewerRecordByEmailAndOrgId,
  hasUnreadNotificationsForMembership,
  listIntroRequestsForMembership,
  listMembershipProfileRecordsByIds,
  listVisibleSpacesForMembership,
  markNotificationsReadForMembership,
  resetStore,
  upsertSessionUser,
} from "@/server/store";
import {
  getAccountIntroHistoryViews,
  getIntroRequestViews,
  getIntroRequestViewsForSpace,
  getNotificationViews,
} from "@/server/view-models";

describe("permission guards", () => {
  beforeEach(() => {
    resetStore();
  });

  it("allows admins onto admin routes and blocks regular members", async () => {
    const adminMembership = (await getMembershipById("mem_avery"))!;
    const adminUser = (await getUserById(adminMembership.userId))!;
    const memberMembership = (await getMembershipById("mem_jules"))!;
    const memberUser = (await getUserById(memberMembership.userId))!;

    expect(canViewAdminRoute(adminUser, adminMembership)).toBe(true);
    expect(canViewAdminRoute(memberUser, memberMembership)).toBe(false);
  });

  it("revokes admin-route access when an admin account is no longer connected", async () => {
    const adminMembership = (await getMembershipById("mem_avery"))!;
    const adminUser = (await getUserById(adminMembership.userId))!;

    expect(
      canViewAdminRoute(adminUser, {
        ...adminMembership,
        accountStatus: "suspended",
      }),
    ).toBe(false);
    expect(
      canViewAdminRoute(adminUser, {
        ...adminMembership,
        accountStatus: "deprovisioned",
      }),
    ).toBe(false);
  });

  it("bootstraps the letsbuild account as an approved admin", async () => {
    const user = await upsertSessionUser({
      email: "letsbuild@wavesparks.co",
      name: "Lets Build",
    });
    const membership = await ensureMembership(user.id, seedOrganization.id, {
      existingUser: user,
    });

    expect(user.platformRole).toBe("platform_owner");
    expect(membership).toMatchObject({
      role: "org_admin",
      status: "approved",
      programName: "Wavesparks Admin",
    });
    expect(canViewAdminRoute(user, membership)).toBe(true);
  });

  it("reuses an unchanged session user without rewriting it", async () => {
    const existing = (await getUserById("usr_jules"))!;
    existing.updatedAt = "2030-01-01T00:00:00.000Z";

    const resolved = await upsertSessionUser(
      {
        clerkUserId: existing.clerkUserId,
        email: existing.email,
        imageUrl: existing.imageUrl,
        name: existing.name,
      },
      { existingUser: existing },
    );

    expect(resolved).toBe(existing);
    expect(resolved.updatedAt).toBe("2030-01-01T00:00:00.000Z");
  });

  it("promotes an existing bootstrap admin membership from known auth context", async () => {
    const user = await upsertSessionUser({
      email: "letsbuild@wavesparks.co",
      name: "Lets Build",
    });
    const existingMembership = await ensureMembership(user.id, seedOrganization.id, {
      existingUser: user,
    });
    Object.assign(existingMembership, {
      role: "member",
      status: "pending",
      approvedAt: undefined,
      approvalNote: undefined,
    });

    const promoted = await ensureMembership(user.id, seedOrganization.id, {
      existingUser: user,
      existingMembership,
    });

    expect(promoted.id).toBe(existingMembership.id);
    expect(promoted).toMatchObject({
      role: "org_admin",
      status: "approved",
      approvalNote: "Approved by bootstrap admin configuration.",
    });
    expect(canViewAdminRoute(user, promoted)).toBe(true);
  });

  it("does not bootstrap admin access from a changed email or Clerk organization role", async () => {
    const membership = (await getMembershipById("mem_jules"))!;
    const user = (await getUserById(membership.userId))!;
    user.email = "letsbuild@wavesparks.co";

    const resolved = await ensureMembership(user.id, seedOrganization.id, {
      clerkRole: "org:admin",
      existingMembership: membership,
      existingUser: user,
    });

    expect(user.platformRole).toBe("standard");
    expect(resolved).toMatchObject({
      role: "member",
      status: "approved",
    });
    expect(canViewAdminRoute(user, resolved)).toBe(false);
  });

  it("creates managed memberships for Clerk-owned account access", async () => {
    const { user, membership } = await createManagedAccount({
      orgId: seedOrganization.id,
      email: "new.member@example.com",
      name: "New Member",
      role: "member",
      status: "approved",
    });

    expect(user.email).toBe("new.member@example.com");
    expect(membership).toMatchObject({ role: "member", status: "approved" });
  });

  it("only grants feed access to approved members with onboarding complete", async () => {
    const approvedMembership = (await getMembershipById("mem_jules"))!;
    const approvedProfile = (await getProfileByMembershipId("mem_jules"))!;
    const pendingMembership = (await getMembershipById("mem_priya"))!;
    const pendingProfile = (await getProfileByMembershipId("mem_priya"))!;

    expect(canAccessFeed(approvedMembership, approvedProfile)).toBe(true);
    expect(canAccessFeed(pendingMembership, pendingProfile)).toBe(false);
  });

  it("lets connected approved mentors use mentor features despite a legacy pending status", async () => {
    const mentor = (await getMembershipById("mem_marcus"))!;

    expect(
      canUseMentorFeatures({
        ...mentor,
        accountStatus: "connected",
        mentorStatus: "approved",
        status: "pending",
      }),
    ).toBe(true);
    expect(
      canUseMentorFeatures({
        ...mentor,
        accountStatus: "invited",
        mentorStatus: "approved",
      }),
    ).toBe(false);
    expect(
      canUseMentorFeatures({
        ...mentor,
        accountStatus: "connected",
        mentorStatus: "needs_review",
      }),
    ).toBe(false);
  });

  it("loads one membership record with user and profile for action authorization", async () => {
    const record = await getMembershipRecordById("mem_jules");

    expect(record?.membership).toMatchObject({
      id: "mem_jules",
      orgId: seedOrganization.id,
    });
    expect(record?.user?.id).toBe(record?.membership.userId);
    expect(record?.profile?.membershipId).toBe("mem_jules");
    await expect(getMembershipRecordById("mem_missing")).resolves.toBeUndefined();
  });

  it("loads a viewer membership record when the organization is already known", async () => {
    const record = await getViewerRecordByEmailAndOrgId(
      seedOrganization.id,
      "JULES@EXAMPLE.COM",
    );

    expect(record.user?.id).toBe("usr_jules");
    expect(record.membership?.id).toBe("mem_jules");
    expect(record.profile?.membershipId).toBe("mem_jules");
    await expect(
      getViewerRecordByEmailAndOrgId(seedOrganization.id, "missing@example.com"),
    ).resolves.toEqual({
      user: undefined,
      membership: undefined,
      profile: undefined,
    });
  });

  it("loads only requested membership records for inbox rendering", async () => {
    const records = await listMembershipProfileRecordsByIds(
      ["mem_jules", "mem_marcus", "mem_jules"],
      { orgId: seedOrganization.id },
    );
    const inboxViews = await getIntroRequestViews("mem_jules", seedOrganization.id);
    const acceptedIntro = inboxViews.find((request) => request.id === "intro_1");

    expect(records.map((record) => record.membership.id).sort()).toEqual([
      "mem_jules",
      "mem_marcus",
    ]);
    expect(records.every((record) => record.user === undefined)).toBe(true);
    await expect(
      listMembershipProfileRecordsByIds(["mem_jules"], { orgId: "org_missing" }),
    ).resolves.toEqual([]);
    expect(acceptedIntro?.otherParty.membershipId).toBe("mem_marcus");
    expect(acceptedIntro?.contactDetails?.email).toContain("@");
  });

  it("honors WhatsApp sharing consent in every accepted-introduction view", async () => {
    const otherProfile = (await getProfileByMembershipId("mem_marcus"))!;
    otherProfile.whatsappVisibleAfterAccept = false;
    const visibleSpaceRecords = await listVisibleSpacesForMembership("mem_jules");
    const visibleSpaces = visibleSpaceRecords.map(({ space }) => space);
    const mainSpace = visibleSpaces.find((space) => space.kind === "main")!;

    const viewCollections = await Promise.all([
      getIntroRequestViews("mem_jules", seedOrganization.id),
      getIntroRequestViewsForSpace(
        mainSpace.id,
        "mem_jules",
        seedOrganization.id,
      ),
      getAccountIntroHistoryViews(
        "mem_jules",
        seedOrganization.id,
        visibleSpaces,
      ),
    ]);

    for (const views of viewCollections) {
      const acceptedIntro = views.find((request) => request.id === "intro_1");
      expect(acceptedIntro?.contactDetails?.email).toContain("@");
      expect(acceptedIntro?.contactDetails?.whatsapp).toBeUndefined();
    }
  });

  it("limits the member notification inbox to the latest records", async () => {
    await Promise.all(
      Array.from({ length: 10 }, async (_, index) =>
        addNotification({
          id: `ntf_limit_${index}`,
          orgId: seedOrganization.id,
          membershipId: "mem_jules",
          type: "admin_note",
          title: `Notification ${index}`,
          body: "Inbox limit coverage.",
          link: `/org/${seedOrganization.slug}/requests`,
          readAt: new Date(Date.UTC(2031, 0, index + 1)).toISOString(),
          createdAt: new Date(Date.UTC(2030, 0, index + 1)).toISOString(),
        }),
      ),
    );
    await addNotification({
      id: "ntf_limit_old_unread",
      orgId: seedOrganization.id,
      membershipId: "mem_jules",
      type: "admin_note",
      title: "Older unread notification",
      body: "Unread coverage outside the latest visible page.",
      link: `/org/${seedOrganization.slug}/requests`,
      createdAt: new Date(Date.UTC(2029, 0, 1)).toISOString(),
    });

    const notifications = await getNotificationViews("mem_jules", { limit: 8 });

    expect(notifications).toHaveLength(8);
    expect(notifications[0].id).toBe("ntf_limit_9");
    expect(notifications.map((notification) => notification.id)).not.toContain("ntf_2");
    expect(notifications.some((notification) => !notification.readAt)).toBe(false);
    await expect(hasUnreadNotificationsForMembership("mem_jules")).resolves.toBe(true);
  });

  it("marks member notifications as read in one inbox action", async () => {
    await addNotification({
      id: "ntf_mark_read",
      orgId: seedOrganization.id,
      membershipId: "mem_jules",
      type: "admin_note",
      title: "Needs attention",
      body: "Mark-read coverage.",
      link: `/org/${seedOrganization.slug}/requests`,
      createdAt: new Date(Date.UTC(2030, 0, 1)).toISOString(),
    });

    await expect(markNotificationsReadForMembership("mem_jules")).resolves.toBeGreaterThan(0);

    const notifications = await getNotificationViews("mem_jules");

    expect(notifications.find((notification) => notification.id === "ntf_mark_read")?.readAt).toBeTruthy();
  });

  it("limits member intro request views to the latest records when requested", async () => {
    const created: string[] = [];

    for (let index = 0; index < 8; index += 1) {
      const intro = await createIntroRequest({
        orgId: seedOrganization.id,
        requesterMembershipId: "mem_jules",
        receiverMembershipId: "mem_marcus",
        sourceType: "match",
        sourceId: `match_limit_${index}`,
        introPurpose: `Limit coverage ${index}`,
        note: "Keep the member inbox bounded.",
        suggestedFirstMessage: "A short first message.",
        status: "pending",
        respondedAt: undefined,
        contactRevealedAt: undefined,
      });
      created.push(intro.id);
    }

    const limitedRequests = await getIntroRequestViews("mem_jules", seedOrganization.id, {
      limit: 3,
    });
    const outgoingPendingRequests = await listIntroRequestsForMembership("mem_jules", {
      direction: "outgoing",
      status: "pending",
    });
    const outgoingPendingViews = await getIntroRequestViews("mem_jules", seedOrganization.id, {
      direction: "outgoing",
      status: "pending",
    });
    const incomingDeclinedViews = await getIntroRequestViews("mem_jules", seedOrganization.id, {
      direction: "incoming",
      status: "declined",
    });
    const fullRequests = await getIntroRequestViews("mem_jules", seedOrganization.id);

    expect(limitedRequests).toHaveLength(3);
    expect(limitedRequests[0].id).toBe(created.at(-1));
    expect(outgoingPendingRequests.length).toBeGreaterThan(0);
    expect(
      outgoingPendingRequests.every(
        (request) =>
          request.requesterMembershipId === "mem_jules" && request.status === "pending",
      ),
    ).toBe(true);
    expect(outgoingPendingViews.length).toBeGreaterThan(0);
    expect(outgoingPendingViews.every((request) => !request.isIncoming)).toBe(true);
    expect(outgoingPendingViews.every((request) => request.status === "pending")).toBe(true);
    expect(incomingDeclinedViews).toHaveLength(1);
    expect(incomingDeclinedViews[0]).toMatchObject({
      isIncoming: true,
      status: "declined",
    });
    expect(fullRequests.length).toBeGreaterThan(limitedRequests.length);
  });

  it("reveals contact details only after an accepted intro and only to the participants", async () => {
    const acceptedIntro = (await getIntroRequestById("intro_1"))!;
    const pendingIntro = (await getIntroRequestById("intro_2"))!;

    expect(canViewContactDetails("mem_jules", acceptedIntro)).toBe(true);
    expect(canViewContactDetails("mem_marcus", acceptedIntro)).toBe(true);
    expect(canViewContactDetails("mem_rhea", acceptedIntro)).toBe(false);
    expect(canViewContactDetails(pendingIntro.requesterMembershipId, pendingIntro)).toBe(false);
    expect(canViewContactDetails(pendingIntro.receiverMembershipId, pendingIntro)).toBe(false);
    await expect(getIntroRequestById("intro_missing")).resolves.toBeUndefined();
  });
});

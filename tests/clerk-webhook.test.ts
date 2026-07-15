import { beforeEach, describe, expect, it, vi } from "vitest";

import { seedOrganization } from "@/data/seed-data";

const eventRef = vi.hoisted(() => ({ current: null as unknown }));
const getUserMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: vi.fn(async () => eventRef.current),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: getUserMock,
    },
  })),
}));

import { POST } from "@/app/api/webhooks/clerk/route";
import {
  createCohort,
  createManagedAccount,
  getMembershipById,
  getOrganizationBySlug,
  getProfileByMembershipId,
  getSpaceMembership,
  getStore,
  getUserById,
  importCohortMembers,
  linkOrganizationToClerkOrg,
  resetStore,
  updateMembershipClerkState,
  upsertSessionUser,
} from "@/server/store";

describe("Clerk webhook handling", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    eventRef.current = null;
  });

  it("preserves active Event access when an organization invitation is accepted", async () => {
    await linkOrganizationToClerkOrg(seedOrganization.id, "org_clerk_wavespark");
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Webhook Cohort",
      createdByMembershipId: "mem_avery",
    });
    const [imported] = await importCohortMembers(seedOrganization.id, cohort.id, [
      { email: "webhook.student@example.com", name: "Webhook Student" },
    ]);
    eventRef.current = {
      type: "organizationInvitation.accepted",
      data: {
        id: "inv_webhook_student",
        email_address: "webhook.student@example.com",
        organization_id: "org_clerk_wavespark",
        public_metadata: { membershipId: imported.membership.id },
        role: "org:member",
      },
    };

    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        headers: { "svix-id": "evt_invitation_accepted" },
      }) as Parameters<typeof POST>[0],
    );
    const membership = await getMembershipById(imported.membership.id);

    expect(response.status).toBe(200);
    expect(membership).toMatchObject({
      clerkInvitationId: "inv_webhook_student",
      clerkInvitationStatus: "accepted",
      status: "pending",
    });
    await expect(getSpaceMembership(cohort.id, imported.membership.id)).resolves.toMatchObject({
      accessStatus: "active",
    });
  });

  it("does not create a local membership for an out-of-band Clerk invitation", async () => {
    await linkOrganizationToClerkOrg(seedOrganization.id, "org_clerk_wavespark");
    eventRef.current = {
      type: "organizationInvitation.created",
      data: {
        id: "inv_dashboard_only",
        email_address: "dashboard.invite@example.com",
        organization_id: "org_clerk_wavespark",
        public_metadata: {},
        role: "org:member",
      },
    };

    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        headers: { "svix-id": "evt_invitation_created" },
      }) as Parameters<typeof POST>[0],
    );
    const user = getStore().users.find(
      (candidate) => candidate.email === "dashboard.invite@example.com",
    );
    const membership = getStore().memberships.find(
      (candidate) => candidate.userId === user?.id,
    );

    expect(response.status).toBe(200);
    expect(user).toBeUndefined();
    expect(membership).toBeUndefined();
  });

  it("tracks pending, revoked, and expired invitation states on the local membership", async () => {
    await linkOrganizationToClerkOrg(seedOrganization.id, "org_clerk_wavespark");
    const { membership } = await createManagedAccount({
      orgId: seedOrganization.id,
      email: "invitation.states@example.com",
      name: "Invitation States",
      role: "member",
      status: "pending",
    });
    const request = (eventId: string) =>
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        headers: { "svix-id": eventId },
      }) as Parameters<typeof POST>[0];

    eventRef.current = {
      type: "organizationInvitation.created",
      data: {
        id: "inv_all_states",
        email_address: "invitation.states@example.com",
        organization_id: "org_clerk_wavespark",
        public_metadata: { membershipId: membership.id, orgSlug: "wavesparks" },
        role: "org:member",
      },
    };
    await expect(POST(request("evt_inv_created"))).resolves.toMatchObject({ status: 200 });
    await expect(getMembershipById(membership.id)).resolves.toMatchObject({
      clerkInvitationId: "inv_all_states",
      clerkInvitationStatus: "pending",
    });

    eventRef.current = {
      type: "organizationInvitation.revoked",
      data: {
        id: "inv_all_states",
        email_address: "invitation.states@example.com",
        organization_id: "org_clerk_wavespark",
        public_metadata: { membershipId: membership.id },
        role: "org:member",
      },
    };
    await expect(POST(request("evt_inv_revoked"))).resolves.toMatchObject({ status: 200 });
    await expect(getMembershipById(membership.id)).resolves.toMatchObject({
      clerkInvitationStatus: "revoked",
    });

    await updateMembershipClerkState(membership.id, {
      clerkInvitationId: "inv_all_states",
      clerkInvitationStatus: "pending",
    });
    eventRef.current = {
      type: "organizationInvitation.expired",
      data: { id: "inv_all_states" },
    };
    await expect(POST(request("evt_inv_expired"))).resolves.toMatchObject({ status: 200 });
    await expect(getMembershipById(membership.id)).resolves.toMatchObject({
      clerkInvitationStatus: "expired",
    });
  });

  it("updates an existing local user from Clerk's selected primary email", async () => {
    const membership = (await getMembershipById("mem_jules"))!;
    const originalUser = (await getUserById(membership.userId))!;
    await upsertSessionUser({
      clerkUserId: "user_primary_email",
      email: originalUser.email,
      imageUrl: originalUser.imageUrl,
      name: originalUser.name,
    });
    eventRef.current = {
      type: "user.updated",
      data: {
        id: "user_primary_email",
        email_addresses: [
          { id: "email_old", email_address: originalUser.email },
          { id: "email_new", email_address: "jules.primary@example.com" },
        ],
        primary_email_address_id: "email_new",
        first_name: "Jules",
        last_name: "Primary",
        image_url: "https://example.com/jules-primary.png",
      },
    };

    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        headers: { "svix-id": "evt_primary_email" },
      }) as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(200);
    await expect(getUserById(originalUser.id)).resolves.toMatchObject({
      clerkUserId: "user_primary_email",
      email: "jules.primary@example.com",
      name: "Jules Primary",
    });
  });

  it("deprovisions the account without changing Space access when Clerk removes the organization membership", async () => {
    await updateMembershipClerkState("mem_jules", {
      clerkMembershipId: "orgmem_removed",
      clerkRole: "org:member",
    });
    eventRef.current = {
      type: "organizationMembership.deleted",
      data: { id: "orgmem_removed" },
    };

    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        headers: { "svix-id": "evt_membership_removed" },
      }) as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(200);
    await expect(getMembershipById("mem_jules")).resolves.toMatchObject({
      clerkMembershipId: undefined,
      clerkRole: undefined,
      accountStatus: "deprovisioned",
      status: "approved",
    });
  });

  it("unlinks a deleted Clerk organization without deleting the local community", async () => {
    await linkOrganizationToClerkOrg(seedOrganization.id, "org_clerk_wavespark");
    eventRef.current = {
      type: "organization.deleted",
      data: { id: "org_clerk_wavespark" },
    };

    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        headers: { "svix-id": "evt_org_deleted" },
      }) as Parameters<typeof POST>[0],
    );

    expect(response.status).toBe(200);
    await expect(getOrganizationBySlug("wavesparks")).resolves.toMatchObject({
      id: seedOrganization.id,
      clerkOrgId: undefined,
    });
  });

  it("retries a failed event because idempotency is recorded after processing", async () => {
    await linkOrganizationToClerkOrg(seedOrganization.id, "org_clerk_wavespark");
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Retry Cohort",
      createdByMembershipId: "mem_avery",
    });
    const [imported] = await importCohortMembers(seedOrganization.id, cohort.id, [
      { email: "retry.student@example.com", name: "Retry Student" },
    ]);
    eventRef.current = {
      type: "organizationMembership.created",
      data: {
        id: "orgmem_retry",
        organization: { id: "org_clerk_wavespark", slug: "wavesparks" },
        public_user_data: { user_id: "user_retry" },
        role: "org:member",
      },
    };
    getUserMock.mockRejectedValueOnce(new Error("Temporary Clerk failure"));
    const request = () =>
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        headers: { "svix-id": "evt_retryable" },
      }) as Parameters<typeof POST>[0];

    await expect(POST(request())).resolves.toMatchObject({ status: 500 });
    getUserMock.mockResolvedValueOnce({
      id: "user_retry",
      emailAddresses: [{ id: "email_retry", emailAddress: "retry.student@example.com" }],
      primaryEmailAddressId: "email_retry",
      firstName: "Retry",
      lastName: "Student",
      fullName: "Retry Student",
      username: null,
      imageUrl: "",
    });

    await expect(POST(request())).resolves.toMatchObject({ status: 200 });
    await expect(getMembershipById(imported.membership.id)).resolves.toMatchObject({
      clerkMembershipId: "orgmem_retry",
    });
    expect(getUserMock).toHaveBeenCalledTimes(2);
  });

  it("anonymizes deleted users while retaining their posts and comments", async () => {
    const originalMembership = await getMembershipById("mem_jules");
    const originalUser = originalMembership
      ? await getUserById(originalMembership.userId)
      : undefined;
    if (!originalMembership || !originalUser) {
      throw new Error("Seed member missing.");
    }
    await upsertSessionUser({
      clerkUserId: "user_deleted",
      email: originalUser.email,
      imageUrl: originalUser.imageUrl,
      name: originalUser.name,
    });
    const authoredPostIds = getStore().posts
      .filter((post) => post.authorMembershipId === originalMembership.id)
      .map((post) => post.id);
    eventRef.current = {
      type: "user.deleted",
      data: { id: "user_deleted" },
    };

    const response = await POST(
      new Request("http://localhost/api/webhooks/clerk", {
        method: "POST",
        headers: { "svix-id": "evt_user_deleted" },
      }) as Parameters<typeof POST>[0],
    );
    const user = await getUserById(originalUser.id);
    const profile = await getProfileByMembershipId(originalMembership.id);

    expect(response.status).toBe(200);
    expect(user).toMatchObject({
      clerkUserId: undefined,
      name: "Former member",
    });
    expect(user?.email).toContain("@deleted.invalid");
    expect(profile).toMatchObject({
      emailForIntro: "",
      introOptIn: false,
      preferredName: "Former member",
    });
    expect(
      getStore().posts.filter((post) => post.authorMembershipId === originalMembership.id),
    ).toHaveLength(authoredPostIds.length);
  });
});

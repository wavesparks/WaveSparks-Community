import { beforeEach, describe, expect, it, vi } from "vitest";

const eventRef = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: vi.fn(async () => eventRef.current),
}));

import { POST } from "@/app/api/webhooks/clerk/route";
import {
  acceptMembershipInvitation,
  createMembershipInvitation,
  getMembershipById,
  getProfileByMembershipId,
  getStore,
  getUserById,
  linkOrganizationToClerkOrg,
  resetStore,
  updateMembershipClerkState,
} from "@/server/store";

function webhookRequest(eventId?: string) {
  const headers = eventId ? { "svix-id": eventId } : undefined;
  return new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers,
  }) as Parameters<typeof POST>[0];
}

describe("Clerk user webhook handling", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    eventRef.current = null;
  });

  it("updates an already-linked local user from Clerk's selected primary email", async () => {
    const membership = (await getMembershipById("mem_jules"))!;
    const originalUser = (await getUserById(membership.userId))!;
    originalUser.clerkUserId = "user_primary_email";
    eventRef.current = {
      type: "user.updated",
      data: {
        id: "user_primary_email",
        email_addresses: [
          {
            id: "email_old",
            email_address: originalUser.email,
            verification: { status: "verified" },
          },
          {
            id: "email_new",
            email_address: "jules.primary@example.com",
            verification: { status: "verified" },
          },
        ],
        primary_email_address_id: "email_new",
        first_name: "Jules",
        last_name: "Primary",
        image_url: "https://example.com/jules-primary.png",
      },
    };

    const response = await POST(webhookRequest("evt_primary_email"));

    expect(response.status).toBe(200);
    await expect(getUserById(originalUser.id)).resolves.toMatchObject({
      clerkUserId: "user_primary_email",
      email: "jules.primary@example.com",
      name: "Jules Primary",
    });
  });

  it("never links a local invitation by matching email", async () => {
    const membership = (await getMembershipById("mem_jules"))!;
    const originalUser = (await getUserById(membership.userId))!;
    eventRef.current = {
      type: "user.created",
      data: {
        id: "user_unbound",
        email_addresses: [
          { id: "email_invited", email_address: originalUser.email },
        ],
        primary_email_address_id: "email_invited",
        first_name: "Email",
        last_name: "Collision",
        image_url: "",
      },
    };

    const response = await POST(webhookRequest("evt_unbound_user"));

    expect(response.status).toBe(200);
    const unchangedUser = await getUserById(originalUser.id);
    expect(unchangedUser).toMatchObject({
      email: originalUser.email,
      name: originalUser.name,
    });
    expect(unchangedUser?.clerkUserId).toBeUndefined();
  });

  it("ignores organization lifecycle events without changing local access", async () => {
    await linkOrganizationToClerkOrg("org_wavesparks", "org_clerk_wavespark");
    await updateMembershipClerkState("mem_jules", {
      clerkMembershipId: "orgmem_removed",
      clerkRole: "org:member",
    });
    eventRef.current = {
      type: "organizationMembership.deleted",
      data: { id: "orgmem_removed" },
    };

    const response = await POST(webhookRequest("evt_org_membership_deleted"));

    expect(response.status).toBe(200);
    await expect(getMembershipById("mem_jules")).resolves.toMatchObject({
      accountStatus: "connected",
      clerkMembershipId: "orgmem_removed",
      clerkRole: "org:member",
    });
  });

  it("deduplicates retries using the Svix event id", async () => {
    const membership = (await getMembershipById("mem_jules"))!;
    const originalUser = (await getUserById(membership.userId))!;
    originalUser.clerkUserId = "user_deduped";
    eventRef.current = {
      type: "user.updated",
      data: {
        id: "user_deduped",
        email_addresses: [{
          id: "email",
          email_address: originalUser.email,
          verification: { status: "verified" },
        }],
        primary_email_address_id: "email",
        first_name: "First",
        last_name: "Delivery",
        image_url: "",
      },
    };
    await POST(webhookRequest("evt_same"));

    eventRef.current = {
      ...(eventRef.current as object),
      data: {
        id: "user_deduped",
        email_addresses: [{
          id: "email",
          email_address: originalUser.email,
          verification: { status: "verified" },
        }],
        primary_email_address_id: "email",
        first_name: "Duplicate",
        last_name: "Delivery",
        image_url: "",
      },
    };
    await POST(webhookRequest("evt_same"));

    await expect(getUserById(originalUser.id)).resolves.toMatchObject({
      name: "First Delivery",
    });
  });

  it("rejects a verified payload that has no Svix id", async () => {
    eventRef.current = { type: "user.deleted", data: { id: "user_missing_id" } };

    const response = await POST(webhookRequest());

    expect(response.status).toBe(400);
  });

  it("ignores unverified webhook emails and never promotes a persisted standard user", async () => {
    const membership = (await getMembershipById("mem_jules"))!;
    const originalUser = (await getUserById(membership.userId))!;
    originalUser.clerkUserId = "user_security";
    eventRef.current = {
      type: "user.updated",
      data: {
        id: "user_security",
        email_addresses: [{
          id: "email_unverified",
          email_address: "letsbuild@wavesparks.co",
          verification: { status: "unverified" },
        }],
        primary_email_address_id: "email_unverified",
        first_name: "Unverified",
        last_name: "Owner",
        image_url: "",
      },
    };

    await expect(POST(webhookRequest("evt_unverified"))).resolves.toMatchObject({
      status: 200,
    });
    await expect(getUserById(originalUser.id)).resolves.toMatchObject({
      email: originalUser.email,
      name: originalUser.name,
      platformRole: "standard",
    });

    eventRef.current = {
      ...(eventRef.current as object),
      data: {
        id: "user_security",
        email_addresses: [{
          id: "email_verified",
          email_address: "letsbuild@wavesparks.co",
          verification: { status: "verified" },
        }],
        primary_email_address_id: "email_verified",
        first_name: "Verified",
        last_name: "Rename",
        image_url: "",
      },
    };
    await expect(POST(webhookRequest("evt_verified_rename"))).resolves.toMatchObject({
      status: 200,
    });
    await expect(getUserById(originalUser.id)).resolves.toMatchObject({
      email: "letsbuild@wavesparks.co",
      platformRole: "standard",
    });
  });

  it("anonymizes deleted users while retaining authored content", async () => {
    const originalMembership = await getMembershipById("mem_jules");
    const originalUser = originalMembership
      ? await getUserById(originalMembership.userId)
      : undefined;
    if (!originalMembership || !originalUser) {
      throw new Error("Seed member missing.");
    }
    originalUser.clerkUserId = "user_deleted";
    const acceptedInvitation = await createMembershipInvitation({
      orgId: originalMembership.orgId,
      membershipId: originalMembership.id,
      email: originalUser.email,
      tokenHash: "e".repeat(64),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      createdByMembershipId: "mem_avery",
    });
    await acceptMembershipInvitation({
      tokenHash: acceptedInvitation.tokenHash,
      clerkUserId: "user_deleted",
      verifiedEmail: originalUser.email,
    });
    await createMembershipInvitation({
      orgId: originalMembership.orgId,
      membershipId: originalMembership.id,
      email: originalUser.email,
      tokenHash: "f".repeat(64),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      createdByMembershipId: "mem_avery",
    });
    const authoredPostIds = getStore().posts
      .filter((post) => post.authorMembershipId === originalMembership.id)
      .map((post) => post.id);
    eventRef.current = {
      type: "user.deleted",
      data: { id: "user_deleted" },
    };

    const response = await POST(webhookRequest("evt_user_deleted"));
    const user = await getUserById(originalUser.id);
    const profile = await getProfileByMembershipId(originalMembership.id);

    expect(response.status).toBe(200);
    expect(user).toMatchObject({ clerkUserId: undefined, name: "Former member" });
    expect(user?.email).toContain("@deleted.invalid");
    expect(
      getStore().membershipInvitations.some(
        (invitation) => invitation.membershipId === originalMembership.id,
      ),
    ).toBe(false);
    expect(profile).toMatchObject({
      emailForIntro: "",
      introOptIn: false,
      preferredName: "Former member",
    });
    expect(
      getStore().posts.filter(
        (post) => post.authorMembershipId === originalMembership.id,
      ),
    ).toHaveLength(authoredPostIds.length);
  });
});

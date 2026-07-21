import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { seedOrganization } from "@/data/seed-data";
import {
  acceptMembershipInvitation,
  createManagedAccount,
  createMembershipInvitation,
  getMembershipInvitationByTokenHash,
  getStore,
  listLatestMembershipInvitationsByMembershipIds,
  listMemberWorkspaceForOrg,
  resetStore,
  rotateMembershipInvitation,
  updateMembershipInvitationDelivery,
} from "@/server/store";

function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function createInvitedMember(email = "invitation.store@example.com") {
  return createManagedAccount({
    orgId: seedOrganization.id,
    email,
    name: "Invitation Store Member",
    role: "member",
    status: "approved",
    invitedByUserId: "usr_avery",
  });
}

describe("app-owned membership invitation store", () => {
  beforeEach(() => {
    resetStore();
  });

  it("normalizes invitation emails and rotates a single pending token", async () => {
    const { membership, user } = await createInvitedMember();
    const first = await createMembershipInvitation({
      orgId: seedOrganization.id,
      membershipId: membership.id,
      email: `  ${user.email.toUpperCase()}  `,
      tokenHash: tokenHash("first invitation"),
      expiresAt: "2026-08-01T00:00:00.000Z",
      createdByMembershipId: "mem_avery",
      createdAt: "2026-07-21T00:00:00.000Z",
    });

    await expect(
      createMembershipInvitation({
        orgId: seedOrganization.id,
        membershipId: membership.id,
        email: user.email,
        tokenHash: tokenHash("duplicate pending invitation"),
        expiresAt: "2026-08-01T00:00:00.000Z",
        createdByMembershipId: "mem_avery",
        createdAt: "2026-07-21T00:01:00.000Z",
      }),
    ).rejects.toThrow("already has a pending invitation");

    const second = await rotateMembershipInvitation({
      orgId: seedOrganization.id,
      membershipId: membership.id,
      email: user.email,
      tokenHash: tokenHash("rotated invitation"),
      expiresAt: "2026-08-02T00:00:00.000Z",
      createdByMembershipId: "mem_avery",
      createdAt: "2026-07-21T00:02:00.000Z",
    });
    const latest = await listLatestMembershipInvitationsByMembershipIds(
      [membership.id],
      { orgId: seedOrganization.id },
    );

    expect(first).toMatchObject({ email: user.email, status: "revoked" });
    expect(first.revokedAt).toBe("2026-07-21T00:02:00.000Z");
    expect(second.status).toBe("pending");
    expect(latest.get(membership.id)?.id).toBe(second.id);
  });

  it("atomically consumes an invitation and binds the Clerk user only once", async () => {
    const { membership, user } = await createInvitedMember("accept.store@example.com");
    const hash = tokenHash("accept once");
    const invitation = await createMembershipInvitation({
      orgId: seedOrganization.id,
      membershipId: membership.id,
      email: user.email,
      tokenHash: hash,
      expiresAt: "2026-08-01T00:00:00.000Z",
      createdByMembershipId: "mem_avery",
      createdAt: "2026-07-21T00:00:00.000Z",
    });

    const results = await Promise.all([
      acceptMembershipInvitation({
        tokenHash: hash,
        clerkUserId: "user_accept_store",
        verifiedEmail: user.email,
        orgId: seedOrganization.id,
        now: "2026-07-21T01:00:00.000Z",
      }),
      acceptMembershipInvitation({
        tokenHash: hash,
        clerkUserId: "user_accept_store",
        verifiedEmail: user.email,
        orgId: seedOrganization.id,
        now: "2026-07-21T01:00:00.000Z",
      }),
    ]);
    const accepted = results.filter((result) => result.ok);
    const rejected = results.filter((result) => !result.ok);

    expect(accepted).toHaveLength(1);
    expect(rejected).toEqual([{ ok: false, reason: "not_pending" }]);
    expect(accepted[0]).toMatchObject({
      invitation: {
        id: invitation.id,
        status: "accepted",
        acceptedByClerkUserId: "user_accept_store",
      },
      membership: { id: membership.id, accountStatus: "connected" },
      user: { id: user.id, clerkUserId: "user_accept_store" },
    });
  });

  it("rejects mismatched identity and expiry without activating membership", async () => {
    const { membership, user } = await createInvitedMember("guard.store@example.com");
    const hash = tokenHash("guard invitation");
    const invitation = await createMembershipInvitation({
      orgId: seedOrganization.id,
      membershipId: membership.id,
      email: user.email,
      tokenHash: hash,
      expiresAt: "2026-07-22T00:00:00.000Z",
      createdByMembershipId: "mem_avery",
      createdAt: "2026-07-21T00:00:00.000Z",
    });

    await expect(
      acceptMembershipInvitation({
        tokenHash: hash,
        clerkUserId: "user_forwarded_link",
        verifiedEmail: "someone-else@example.com",
        now: "2026-07-21T01:00:00.000Z",
      }),
    ).resolves.toEqual({ ok: false, reason: "email_mismatch" });
    expect(invitation.status).toBe("pending");
    expect(membership.accountStatus).toBe("invited");

    await expect(
      acceptMembershipInvitation({
        tokenHash: hash,
        clerkUserId: "user_expired_link",
        verifiedEmail: user.email,
        now: "2026-07-23T00:00:00.000Z",
      }),
    ).resolves.toEqual({ ok: false, reason: "expired" });
    expect(invitation.status).toBe("expired");
    expect(user.clerkUserId).toBeUndefined();
    expect(membership.accountStatus).toBe("invited");
  });

  it("rejects a Clerk identity that is already bound to another local user", async () => {
    await createManagedAccount({
      orgId: seedOrganization.id,
      clerkUserId: "user_already_bound",
      email: "already.bound@example.com",
      name: "Already Bound",
      role: "member",
      status: "approved",
      invitedByUserId: "usr_avery",
    });
    const { membership, user } = await createInvitedMember("identity.guard@example.com");
    const hash = tokenHash("identity guard invitation");
    const invitation = await createMembershipInvitation({
      orgId: seedOrganization.id,
      membershipId: membership.id,
      email: user.email,
      tokenHash: hash,
      expiresAt: "2026-08-01T00:00:00.000Z",
      createdByMembershipId: "mem_avery",
      createdAt: "2026-07-21T00:00:00.000Z",
    });

    await expect(
      acceptMembershipInvitation({
        tokenHash: hash,
        clerkUserId: "user_already_bound",
        verifiedEmail: user.email,
        now: "2026-07-21T01:00:00.000Z",
      }),
    ).resolves.toEqual({ ok: false, reason: "identity_conflict" });
    expect(invitation.status).toBe("pending");
    expect(user.clerkUserId).toBeUndefined();
    expect(membership.accountStatus).toBe("invited");
  });

  it("surfaces local pending and delivery-failed states in the admin workspace", async () => {
    const { membership, user } = await createInvitedMember("workspace.invite@example.com");
    const hash = tokenHash("workspace invitation");
    const invitation = await createMembershipInvitation({
      orgId: seedOrganization.id,
      membershipId: membership.id,
      email: user.email,
      tokenHash: hash,
      expiresAt: "2026-08-01T00:00:00.000Z",
      createdByMembershipId: "mem_avery",
      createdAt: "2026-07-21T00:00:00.000Z",
    });
    const pending = await listMemberWorkspaceForOrg(seedOrganization.id, {
      invitationStatus: "pending",
    });
    await updateMembershipInvitationDelivery(invitation.id, {
      deliveryError: "resend_unavailable",
    });
    const failed = await listMemberWorkspaceForOrg(seedOrganization.id, {
      invitationStatus: "failed",
    });

    expect(pending.records.find((record) => record.membership.id === membership.id)).toMatchObject({
      invitation: { id: invitation.id, status: "pending" },
    });
    expect(
      pending.records.find((record) => record.membership.id === membership.id)?.invitation,
    ).not.toHaveProperty("tokenHash");
    expect(failed.records.find((record) => record.membership.id === membership.id)).toMatchObject({
      invitation: { id: invitation.id, deliveryError: "resend_unavailable" },
    });
    expect((await getMembershipInvitationByTokenHash(hash))?.id).toBe(invitation.id);
    expect(getStore().membershipInvitations).toHaveLength(1);
  });
});

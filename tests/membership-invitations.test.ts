import { beforeEach, describe, expect, it, vi } from "vitest";

import { seedOrganization } from "@/data/seed-data";

const identityInvitationMocks = vi.hoisted(() => ({
  create: vi.fn(async () => ({ id: "inv_identity_test" })),
  revoke: vi.fn(async () => undefined),
}));

vi.mock("@/server/clerk-identity-invitations", () => ({
  createClerkIdentityInvitation: identityInvitationMocks.create,
  revokeClerkIdentityInvitation: identityInvitationMocks.revoke,
}));

import {
  revokeMembershipInvitation,
  sendMembershipInvitation,
} from "@/server/membership-invitations";
import {
  getMembershipById,
  getStore,
  getUserById,
  resetStore,
} from "@/server/store";

async function invitationInput() {
  const membership = (await getMembershipById("mem_priya"))!;
  membership.accountStatus = "invited";
  const user = (await getUserById(membership.userId))!;
  return {
    forceNew: true,
    inviterMembershipId: "mem_avery",
    membership,
    org: seedOrganization,
    user,
  };
}

describe("local membership invitations", () => {
  beforeEach(() => {
    resetStore();
    identityInvitationMocks.create.mockReset();
    identityInvitationMocks.create.mockResolvedValue({ id: "inv_identity_test" });
    identityInvitationMocks.revoke.mockReset();
    identityInvitationMocks.revoke.mockResolvedValue(undefined);
  });

  it("fails closed without logging provider payloads when identity delivery fails", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    identityInvitationMocks.create.mockRejectedValueOnce(
      new Error(
        "Clerk identity invitation delivery is not configured for priya@example.com?token=raw-secret.",
      ),
    );
    const input = await invitationInput();

    await expect(sendMembershipInvitation(input)).rejects.toThrow(
      "The invitation email could not be sent",
    );

    expect(identityInvitationMocks.create).toHaveBeenCalledOnce();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("priya@example.com");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("raw-secret");
    expect(
      getStore().membershipInvitations.find(
        (invitation) => invitation.membershipId === input.membership.id,
      ),
    ).toMatchObject({
      status: "pending",
      sentAt: undefined,
      deliveryError:
        "The invitation email could not be sent. Check the email service, then try again.",
    });
    errorLog.mockRestore();
  });

  it("returns only a safe invitation summary after successful delivery", async () => {
    const result = await sendMembershipInvitation(await invitationInput());

    expect(result.kind).toBe("invitation");
    if (result.kind !== "invitation") throw new Error("Expected an invitation result.");
    expect(result.invitation).toEqual({
      id: expect.any(String),
      status: "pending",
      sentAt: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(result.invitation).not.toHaveProperty("tokenHash");
    expect(result.invitation).not.toHaveProperty("clerkIdentityInvitationId");
    expect(result.invitation).not.toHaveProperty("acceptedByClerkUserId");
    expect(identityInvitationMocks.create).toHaveBeenCalledWith({
      emailAddress: expect.any(String),
      redirectUrl: expect.stringMatching(
        /\/api\/internal\/membership-invitations\/accept\?orgSlug=wavesparks&token=/,
      ),
    });
    expect(
      getStore().membershipInvitations.find(
        (invitation) => invitation.id === result.invitation.id,
      ),
    ).toMatchObject({
      clerkIdentityInvitationId: "inv_identity_test",
      deliveryError: undefined,
      sentAt: expect.any(String),
    });
  });

  it("revokes local authorization even when Clerk cleanup is temporarily unavailable", async () => {
    const input = await invitationInput();
    await sendMembershipInvitation(input);
    identityInvitationMocks.revoke.mockRejectedValueOnce(
      Object.assign(new Error("Provider unavailable"), { status: 503 }),
    );
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      revokeMembershipInvitation({ membership: input.membership, org: input.org }),
    ).resolves.toBe(1);

    expect(
      getStore().membershipInvitations.find(
        (invitation) => invitation.membershipId === input.membership.id,
      ),
    ).toMatchObject({ status: "revoked" });
    expect(errorLog).toHaveBeenCalledWith(
      "[wavesparks] Clerk identity invitation cleanup is pending",
      expect.any(String),
      { providerStatus: 503 },
    );
    errorLog.mockRestore();
  });

  it("revokes a provider ticket when a concurrent resend supersedes its local invitation", async () => {
    const input = await invitationInput();
    let resolveFirst!: (value: { id: string }) => void;
    identityInvitationMocks.create
      .mockImplementationOnce(
        () =>
          new Promise<{ id: string }>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ id: "inv_identity_newer" });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const firstSend = sendMembershipInvitation(input);
    await vi.waitFor(() => {
      expect(identityInvitationMocks.create).toHaveBeenCalledTimes(1);
    });
    const newerSend = sendMembershipInvitation(input);
    await expect(newerSend).resolves.toMatchObject({ kind: "invitation" });

    resolveFirst({ id: "inv_identity_superseded" });
    await expect(firstSend).rejects.toThrow("invitation couldn’t be created");

    expect(identityInvitationMocks.revoke).toHaveBeenCalledWith(
      "inv_identity_superseded",
    );
    const invitations = getStore().membershipInvitations.filter(
      (invitation) => invitation.membershipId === input.membership.id,
    );
    expect(invitations.filter((invitation) => invitation.status === "pending"))
      .toEqual([
        expect.objectContaining({
          clerkIdentityInvitationId: "inv_identity_newer",
          sentAt: expect.any(String),
        }),
      ]);
    expect(invitations.filter((invitation) => invitation.status === "revoked"))
      .toHaveLength(1);
    errorLog.mockRestore();
  });
});

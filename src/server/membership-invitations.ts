import type { Membership, Organization, User } from "@/lib/domain";
import {
  generateMembershipInvitationToken,
  hashMembershipInvitationToken,
} from "@/lib/membership-invitation-token";
import { absoluteAppUrl } from "@/lib/urls";
import {
  createClerkIdentityInvitation,
  revokeClerkIdentityInvitation,
} from "@/server/clerk-identity-invitations";
import {
  listMembershipInvitationsForMembership,
  revokeMembershipInvitation as revokeStoredMembershipInvitation,
  rotateMembershipInvitation,
  updateMembershipInvitationDelivery,
} from "@/server/store";

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1_000;
const inviteableAccountStatuses = new Set<Membership["accountStatus"]>([
  "invited",
  "connected",
]);

export type MembershipInvitationInput = {
  forceNew?: boolean;
  inviterMembershipId: string;
  membership: Membership;
  org: Organization;
  user: User;
};

function invitationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (
    normalized.includes("account is paused") ||
    normalized.includes("suspended") ||
    normalized.includes("deprovisioned")
  ) {
    return "This account is paused. Restore it in member details before continuing.";
  }
  if (
    normalized.includes("rate") ||
    normalized.includes("too many") ||
    normalized.includes("429") ||
    normalized.includes("service is busy")
  ) {
    return "The invitation service is busy. Wait a few minutes, then try again.";
  }
  if (
    normalized.includes("clerk identity invitation") ||
    normalized.includes("email delivery") ||
    normalized.includes("invitation email could not") ||
    normalized.includes("not configured")
  ) {
    return "The invitation email could not be sent. Check the email service, then try again.";
  }
  return "The invitation couldn’t be created. Try again in a few minutes.";
}

function invitationFailureLogMetadata(error: unknown) {
  if (!error || typeof error !== "object") return { providerStatus: "unknown" };
  const rawStatus =
    "status" in error
      ? error.status
      : "statusCode" in error
        ? error.statusCode
        : undefined;
  const providerStatus = Number(rawStatus);
  return {
    providerStatus: Number.isFinite(providerStatus) ? providerStatus : "unknown",
  };
}

function assertInvitationInput(input: MembershipInvitationInput) {
  if (input.membership.orgId !== input.org.id || input.membership.userId !== input.user.id) {
    throw new Error("The invitation does not belong to this organization member.");
  }
  if (!inviteableAccountStatuses.has(input.membership.accountStatus)) {
    throw new Error(
      "This account is paused. Restore it in member details before continuing.",
    );
  }
  if (!input.inviterMembershipId) {
    throw new Error("An administrator membership is required to create an invitation.");
  }
}

async function sendRequiredIdentityInvitation(input: {
  email: string;
  redirectUrl: string;
}) {
  return createClerkIdentityInvitation({
    emailAddress: input.email,
    redirectUrl: input.redirectUrl,
  });
}

async function revokeIdentityInvitationBestEffort(
  identityInvitationId: string | undefined,
  localInvitationId: string,
) {
  try {
    await revokeClerkIdentityInvitation(identityInvitationId);
  } catch (error) {
    console.error(
      "[wavesparks] Clerk identity invitation cleanup is pending",
      localInvitationId,
      invitationFailureLogMetadata(error),
    );
  }
}

export async function sendMembershipInvitation(input: MembershipInvitationInput) {
  assertInvitationInput(input);

  if (input.membership.accountStatus === "connected") {
    return {
      kind: "membership" as const,
      localMembership: input.membership,
    };
  }

  const existingInvitations = await listMembershipInvitationsForMembership(
    input.membership.id,
    { orgId: input.org.id },
  );
  const rawToken = generateMembershipInvitationToken();
  const now = new Date();
  const invitation = await rotateMembershipInvitation({
    orgId: input.org.id,
    membershipId: input.membership.id,
    email: input.user.email.trim().toLowerCase(),
    tokenHash: hashMembershipInvitationToken(rawToken),
    expiresAt: new Date(now.getTime() + invitationLifetimeMs).toISOString(),
    createdByMembershipId: input.inviterMembershipId,
    createdAt: now.toISOString(),
  });
  if (!invitation) {
    throw new Error("The invitation couldn’t be created. Try again in a few minutes.");
  }

  for (const existing of existingInvitations) {
    if (existing.status === "pending") {
      await revokeIdentityInvitationBestEffort(
        existing.clerkIdentityInvitationId,
        existing.id,
      );
    }
  }

  const invitationRedirectUrl = absoluteAppUrl(
    `/api/internal/membership-invitations/accept?orgSlug=${encodeURIComponent(input.org.slug)}&token=${encodeURIComponent(rawToken)}`,
  );
  let clerkIdentityInvitationId: string | undefined;
  try {
    const identityInvitation = await sendRequiredIdentityInvitation({
      email: input.user.email,
      redirectUrl: invitationRedirectUrl,
    });
    clerkIdentityInvitationId = identityInvitation.id;
    const delivered = await updateMembershipInvitationDelivery(invitation.id, {
      sentAt: new Date().toISOString(),
      deliveryError: null,
      clerkIdentityInvitationId,
    });
    if (!delivered) {
      await revokeIdentityInvitationBestEffort(
        clerkIdentityInvitationId,
        invitation.id,
      );
      clerkIdentityInvitationId = undefined;
      throw new Error("This invitation was superseded by a newer request.");
    }
  } catch (error) {
    if (clerkIdentityInvitationId) {
      try {
        await revokeClerkIdentityInvitation(clerkIdentityInvitationId);
      } catch (revokeError) {
        console.error(
          "[wavesparks] Failed to revoke an incomplete Clerk identity invitation",
          invitation.id,
          invitationFailureLogMetadata(revokeError),
        );
      }
    }
    const message = invitationErrorMessage(error);
    console.error(
      "[wavesparks] Member invitation delivery failed",
      invitation.id,
      invitationFailureLogMetadata(error),
    );
    await updateMembershipInvitationDelivery(invitation.id, {
      sentAt: null,
      deliveryError: message,
      clerkIdentityInvitationId: null,
    });
    throw new Error(message);
  }

  return {
    kind: "invitation" as const,
    invitation: {
      id: invitation.id,
      status: invitation.status,
      sentAt: new Date().toISOString(),
      expiresAt: invitation.expiresAt,
    },
    localMembership: input.membership,
  };
}

export type MembershipInvitationBatchOutcome = {
  membershipId: string;
  result?: Awaited<ReturnType<typeof sendMembershipInvitation>>;
  error?: string;
};

export async function sendMembershipInvitationsBulk(
  inputs: MembershipInvitationInput[],
): Promise<MembershipInvitationBatchOutcome[]> {
  if (inputs.length > 100) {
    throw new Error("Bulk invitations are limited to 100 members.");
  }

  const outcomes: MembershipInvitationBatchOutcome[] = [];
  for (let index = 0; index < inputs.length; index += 10) {
    const batch = inputs.slice(index, index + 10);
    const settled = await Promise.allSettled(batch.map(sendMembershipInvitation));
    settled.forEach((result, resultIndex) => {
      const membershipId = batch[resultIndex].membership.id;
      if (result.status === "fulfilled") {
        outcomes.push({ membershipId, result: result.value });
      } else {
        outcomes.push({
          membershipId,
          error: invitationErrorMessage(result.reason),
        });
      }
    });
  }
  return outcomes;
}

export async function revokeMembershipInvitation(input: {
  membership: Membership;
  org: Organization;
}) {
  if (input.membership.orgId !== input.org.id) {
    throw new Error("The invitation does not belong to this organization.");
  }
  const invitations = await listMembershipInvitationsForMembership(
    input.membership.id,
    { orgId: input.org.id },
  );
  const pending = invitations.filter((invitation) => invitation.status === "pending");
  for (const invitation of pending) {
    await revokeStoredMembershipInvitation(invitation.id, { orgId: input.org.id });
    await revokeIdentityInvitationBestEffort(
      invitation.clerkIdentityInvitationId,
      invitation.id,
    );
  }
  return pending.length;
}

export async function syncMembershipInvitationLifecycle(input: {
  forceInvitation?: boolean;
  inviterMembershipId: string;
  membership: Membership;
  org: Organization;
  user: User;
}) {
  if (input.membership.accountStatus === "invited") {
    return sendMembershipInvitation({
      forceNew: input.forceInvitation,
      inviterMembershipId: input.inviterMembershipId,
      membership: input.membership,
      org: input.org,
      user: input.user,
    });
  }

  await revokeMembershipInvitation({
    membership: input.membership,
    org: input.org,
  });
  return {
    kind: "membership" as const,
    localMembership: input.membership,
  };
}

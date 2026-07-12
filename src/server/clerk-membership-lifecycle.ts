import { nanoid } from "nanoid";

import { clerkRoleFromLocalRole } from "@/lib/clerk-roles";
import type { Membership, Organization, User } from "@/lib/domain";
import { isE2ELocalAuthEnabled } from "@/lib/e2e-local-auth";
import { isClerkConfigured } from "@/lib/env";
import { absoluteAppUrl } from "@/lib/urls";
import { resolveClerkOrganizationId } from "@/server/clerk-sync";
import { updateMembershipClerkState, upsertSessionUser } from "@/server/store";

const activeStatuses = new Set(["pending", "waitlist", "approved"]);

function messageForError(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }
  return String(error).slice(0, 1000);
}

async function getClient() {
  const { clerkClient } = await import("@clerk/nextjs/server");
  return clerkClient();
}

async function findClerkUser(email: string) {
  const client = await getClient();
  const result = await client.users.getUserList({ emailAddress: [email], limit: 1 });
  return result.data[0];
}

async function resolveClerkUser(user: User) {
  if (!user.clerkUserId) {
    return findClerkUser(user.email);
  }

  try {
    const client = await getClient();
    return await client.users.getUser(user.clerkUserId);
  } catch {
    // A deleted Clerk user can leave a stale local binding until its webhook is processed.
    return findClerkUser(user.email);
  }
}

async function findClerkMembership(organizationId: string, userId: string) {
  const client = await getClient();
  const result = await client.organizations.getOrganizationMembershipList({
    organizationId,
    userId: [userId],
    limit: 1,
  });
  return result.data[0];
}

async function findPendingInvitation(organizationId: string, email: string) {
  const client = await getClient();
  const result = await client.organizations.getOrganizationInvitationList({
    organizationId,
    status: ["pending"],
    limit: 500,
  });
  return result.data.find(
    (invitation) => invitation.emailAddress.toLowerCase() === email.toLowerCase(),
  );
}

async function persistFailure(membership: Membership, error: unknown) {
  await updateMembershipClerkState(membership.id, {
    clerkInvitationError: messageForError(error),
    clerkInvitationStatus: "failed",
    clerkInvitationUpdatedAt: new Date().toISOString(),
  });
}

async function attachExistingClerkUser(input: {
  clerkUserId: string;
  membership: Membership;
  organizationId: string;
  user: User;
}) {
  const client = await getClient();
  const role = clerkRoleFromLocalRole(input.membership.role);
  const existing = await findClerkMembership(input.organizationId, input.clerkUserId);
  const clerkMembership = existing
    ? existing.role === role
      ? existing
      : await client.organizations.updateOrganizationMembership({
          organizationId: input.organizationId,
          role,
          userId: input.clerkUserId,
        })
    : await client.organizations.createOrganizationMembership({
        organizationId: input.organizationId,
        role,
        userId: input.clerkUserId,
      });

  await upsertSessionUser({
    clerkUserId: input.clerkUserId,
    email: input.user.email,
    imageUrl: input.user.imageUrl,
    name: input.user.name,
  });
  const localMembership = await updateMembershipClerkState(input.membership.id, {
    clerkInvitationError: null,
    clerkInvitationStatus: input.membership.clerkInvitationId ? "accepted" : null,
    clerkInvitationUpdatedAt: new Date().toISOString(),
    clerkMembershipId: clerkMembership.id,
    clerkRole: clerkMembership.role,
  });
  return { kind: "membership" as const, localMembership };
}

export async function sendMembershipInvitation(input: {
  forceNew?: boolean;
  inviterUserId: string;
  membership: Membership;
  org: Organization;
  user: User;
}) {
  if (!activeStatuses.has(input.membership.status)) {
    throw new Error("Inactive members cannot be invited.");
  }
  if (isE2ELocalAuthEnabled() && !isClerkConfigured()) {
    const localMembership = await updateMembershipClerkState(input.membership.id, {
      clerkInvitationError: null,
      clerkInvitationId: `e2e_inv_${nanoid(8)}`,
      clerkInvitationStatus: "pending",
      clerkInvitationUpdatedAt: new Date().toISOString(),
    });
    return { kind: "invitation" as const, localMembership };
  }
  if (!isClerkConfigured()) {
    throw new Error("Clerk is not configured.");
  }

  try {
    const organizationId = await resolveClerkOrganizationId(input.org);
    if (!organizationId) {
      throw new Error("The Wavespark Clerk organization is not linked.");
    }
    const clerkUser = await resolveClerkUser(input.user);
    if (clerkUser) {
      return attachExistingClerkUser({
        clerkUserId: clerkUser.id,
        membership: input.membership,
        organizationId,
        user: input.user,
      });
    }

    const client = await getClient();
    const existingInvitation = await findPendingInvitation(organizationId, input.user.email);
    const targetRole = clerkRoleFromLocalRole(input.membership.role);
    const replaceExistingInvitation = Boolean(
      existingInvitation && (input.forceNew || existingInvitation.role !== targetRole),
    );
    if (existingInvitation && replaceExistingInvitation) {
      await client.organizations.revokeOrganizationInvitation({
        invitationId: existingInvitation.id,
        organizationId,
        requestingUserId: input.inviterUserId,
      });
    }
    const invitation =
      existingInvitation && !replaceExistingInvitation
        ? existingInvitation
        : await client.organizations.createOrganizationInvitation({
            emailAddress: input.user.email,
            inviterUserId: input.inviterUserId,
            organizationId,
            publicMetadata: {
              membershipId: input.membership.id,
              membershipRole: input.membership.role,
              orgSlug: input.org.slug,
            },
            redirectUrl: absoluteAppUrl(`/org/${input.org.slug}/accept-invitation`),
            role: targetRole,
          });
    const localMembership = await updateMembershipClerkState(input.membership.id, {
      clerkInvitationError: null,
      clerkInvitationId: invitation.id,
      clerkInvitationStatus: "pending",
      clerkInvitationUpdatedAt: new Date().toISOString(),
    });
    return { kind: "invitation" as const, localMembership };
  } catch (error) {
    await persistFailure(input.membership, error);
    throw error;
  }
}

export async function removeMembershipFromClerk(input: {
  actorUserId: string;
  membership: Membership;
  org: Organization;
  user: User;
}) {
  if (isE2ELocalAuthEnabled() && !isClerkConfigured()) {
    return updateMembershipClerkState(input.membership.id, {
      clerkInvitationError: null,
      clerkInvitationStatus: input.membership.clerkInvitationId ? "revoked" : null,
      clerkInvitationUpdatedAt: new Date().toISOString(),
      clerkMembershipId: null,
      clerkRole: null,
    });
  }
  if (!isClerkConfigured()) {
    throw new Error("Clerk is not configured.");
  }

  try {
    const organizationId = await resolveClerkOrganizationId(input.org);
    if (!organizationId) {
      throw new Error("The Wavespark Clerk organization is not linked.");
    }
    const client = await getClient();
    const clerkUser = await resolveClerkUser(input.user);
    if (clerkUser) {
      const clerkMembership = await findClerkMembership(organizationId, clerkUser.id);
      if (clerkMembership) {
        await client.organizations.deleteOrganizationMembership({
          organizationId,
          userId: clerkUser.id,
        });
      }
    }
    const invitation = await findPendingInvitation(organizationId, input.user.email);
    if (invitation) {
      await client.organizations.revokeOrganizationInvitation({
        invitationId: invitation.id,
        organizationId,
        requestingUserId: input.actorUserId,
      });
    }
    return updateMembershipClerkState(input.membership.id, {
      clerkInvitationError: null,
      clerkInvitationId: invitation?.id ?? input.membership.clerkInvitationId ?? null,
      clerkInvitationStatus: invitation || input.membership.clerkInvitationId ? "revoked" : null,
      clerkInvitationUpdatedAt: new Date().toISOString(),
      clerkMembershipId: null,
      clerkRole: null,
    });
  } catch (error) {
    await persistFailure(input.membership, error);
    throw error;
  }
}

export async function revokeMembershipInvitation(input: {
  actorUserId: string;
  membership: Membership;
  org: Organization;
  user: User;
}) {
  if (isE2ELocalAuthEnabled() && !isClerkConfigured()) {
    return updateMembershipClerkState(input.membership.id, {
      clerkInvitationError: null,
      clerkInvitationStatus: "revoked",
      clerkInvitationUpdatedAt: new Date().toISOString(),
    });
  }
  if (!isClerkConfigured()) {
    throw new Error("Clerk is not configured.");
  }

  try {
    const organizationId = await resolveClerkOrganizationId(input.org);
    if (!organizationId) {
      throw new Error("The Wavespark Clerk organization is not linked.");
    }
    const invitation = await findPendingInvitation(organizationId, input.user.email);
    if (invitation) {
      const client = await getClient();
      await client.organizations.revokeOrganizationInvitation({
        invitationId: invitation.id,
        organizationId,
        requestingUserId: input.actorUserId,
      });
    }
    return updateMembershipClerkState(input.membership.id, {
      clerkInvitationError: null,
      clerkInvitationId: invitation?.id ?? input.membership.clerkInvitationId ?? null,
      clerkInvitationStatus: "revoked",
      clerkInvitationUpdatedAt: new Date().toISOString(),
    });
  } catch (error) {
    await persistFailure(input.membership, error);
    throw error;
  }
}

export async function syncMembershipClerkLifecycle(input: {
  actorUserId: string;
  forceInvitation?: boolean;
  membership: Membership;
  org: Organization;
  user: User;
}) {
  return activeStatuses.has(input.membership.status)
    ? sendMembershipInvitation({
        forceNew: input.forceInvitation,
        inviterUserId: input.actorUserId,
        membership: input.membership,
        org: input.org,
        user: input.user,
      })
    : removeMembershipFromClerk({
        actorUserId: input.actorUserId,
        membership: input.membership,
        org: input.org,
        user: input.user,
      });
}

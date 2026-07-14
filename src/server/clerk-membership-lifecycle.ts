import { nanoid } from "nanoid";

import { clerkRoleFromLocalRole } from "@/lib/clerk-roles";
import type { Membership, Organization, User } from "@/lib/domain";
import { isE2ELocalAuthEnabled } from "@/lib/e2e-local-auth";
import { isClerkConfigured } from "@/lib/env";
import { absoluteAppUrl } from "@/lib/urls";
import { resolveClerkOrganizationId } from "@/server/clerk-sync";
import { updateMembershipClerkState, upsertSessionUser } from "@/server/store";

const activeStatuses = new Set(["pending", "waitlist", "approved"]);

export type MembershipInvitationInput = {
  forceNew?: boolean;
  inviterUserId: string;
  membership: Membership;
  org: Organization;
  user: User;
};

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
  const invitations = await listPendingInvitations(client, organizationId);
  return invitations.find(
    (invitation) =>
      invitation.emailAddress.toLowerCase() === email.toLowerCase(),
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

export async function sendMembershipInvitation(input: MembershipInvitationInput) {
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

export type MembershipInvitationBatchOutcome = {
  membershipId: string;
  result?: Awaited<ReturnType<typeof sendMembershipInvitation>>;
  error?: string;
};

async function listPendingInvitations(
  client: Awaited<ReturnType<typeof getClient>>,
  organizationId: string,
) {
  const invitations: Awaited<
    ReturnType<typeof client.organizations.getOrganizationInvitationList>
  >["data"] = [];
  const limit = 500;
  let offset = 0;

  do {
    const page = await client.organizations.getOrganizationInvitationList({
      organizationId,
      limit,
      offset,
    });
    invitations.push(
      ...page.data.filter((invitation) => invitation.status === "pending"),
    );
    offset += page.data.length;
    const totalCount = Number.isFinite(page.totalCount)
      ? page.totalCount
      : offset;
    if (!page.data.length || offset >= totalCount) {
      break;
    }
  } while (true);

  return invitations;
}

async function listClerkUsersByEmail(
  client: Awaited<ReturnType<typeof getClient>>,
  emails: string[],
) {
  const usersByEmail = new Map<
    string,
    Awaited<ReturnType<typeof client.users.getUserList>>["data"][number]
  >();

  for (let index = 0; index < emails.length; index += 100) {
    const batch = emails.slice(index, index + 100);
    const response = await client.users.getUserList({
      emailAddress: batch,
      limit: batch.length,
    });
    for (const clerkUser of response.data) {
      for (const emailAddress of clerkUser.emailAddresses) {
        usersByEmail.set(emailAddress.emailAddress.toLowerCase(), clerkUser);
      }
    }
  }

  return usersByEmail;
}

/**
 * Sends up to 100 member invitations while avoiding one Clerk invitation-list
 * lookup per member. Existing Clerk users still follow the direct membership
 * path; only genuinely new organization invitations use Clerk's bulk endpoint.
 */
export async function sendMembershipInvitationsBulk(
  inputs: MembershipInvitationInput[],
): Promise<MembershipInvitationBatchOutcome[]> {
  if (inputs.length > 100) {
    throw new Error("Bulk invitations are limited to 100 members.");
  }
  if (!inputs.length) {
    return [];
  }

  const outcomes = new Map<string, MembershipInvitationBatchOutcome>();
  const recordFailure = async (input: MembershipInvitationInput, error: unknown) => {
    await persistFailure(input.membership, error);
    outcomes.set(input.membership.id, {
      membershipId: input.membership.id,
      error: messageForError(error),
    });
  };

  const activeInputs: MembershipInvitationInput[] = [];
  for (const input of inputs) {
    if (!activeStatuses.has(input.membership.status)) {
      await recordFailure(input, new Error("Inactive members cannot be invited."));
      continue;
    }
    activeInputs.push(input);
  }

  if (!activeInputs.length) {
    return inputs.map((input) => outcomes.get(input.membership.id)!);
  }

  if (isE2ELocalAuthEnabled() && !isClerkConfigured()) {
    for (const input of activeInputs) {
      try {
        const result = await sendMembershipInvitation(input);
        outcomes.set(input.membership.id, {
          membershipId: input.membership.id,
          result,
        });
      } catch (error) {
        outcomes.set(input.membership.id, {
          membershipId: input.membership.id,
          error: messageForError(error),
        });
      }
    }
    return inputs.map((input) => outcomes.get(input.membership.id)!);
  }

  if (!isClerkConfigured()) {
    for (const input of activeInputs) {
      await recordFailure(input, new Error("Clerk is not configured."));
    }
    return inputs.map((input) => outcomes.get(input.membership.id)!);
  }

  const firstOrg = activeInputs[0].org;
  if (activeInputs.some((input) => input.org.id !== firstOrg.id)) {
    throw new Error("Bulk invitations must belong to one organization.");
  }

  let organizationId: string | undefined;
  try {
    organizationId = await resolveClerkOrganizationId(firstOrg);
  } catch (error) {
    for (const input of activeInputs) {
      await recordFailure(input, error);
    }
    return inputs.map((input) => outcomes.get(input.membership.id)!);
  }
  if (!organizationId) {
    for (const input of activeInputs) {
      await recordFailure(input, new Error("The Wavespark Clerk organization is not linked."));
    }
    return inputs.map((input) => outcomes.get(input.membership.id)!);
  }

  let client: Awaited<ReturnType<typeof getClient>>;
  let usersByEmail: Awaited<ReturnType<typeof listClerkUsersByEmail>>;
  let pendingInvitations: Awaited<ReturnType<typeof listPendingInvitations>>;
  try {
    client = await getClient();
    [usersByEmail, pendingInvitations] = await Promise.all([
      listClerkUsersByEmail(
        client,
        activeInputs.map((input) => input.user.email.toLowerCase()),
      ),
      listPendingInvitations(client, organizationId),
    ]);
  } catch (error) {
    for (const input of activeInputs) {
      await recordFailure(input, error);
    }
    return inputs.map((input) => outcomes.get(input.membership.id)!);
  }

  const invitationsByEmail = new Map(
    pendingInvitations.map((invitation) => [
      invitation.emailAddress.toLowerCase(),
      invitation,
    ]),
  );
  const createInputs: MembershipInvitationInput[] = [];

  for (const input of activeInputs) {
    const normalizedEmail = input.user.email.toLowerCase();
    const clerkUser = usersByEmail.get(normalizedEmail);
    if (clerkUser) {
      try {
        const result = await attachExistingClerkUser({
          clerkUserId: clerkUser.id,
          membership: input.membership,
          organizationId,
          user: input.user,
        });
        outcomes.set(input.membership.id, {
          membershipId: input.membership.id,
          result,
        });
      } catch (error) {
        await recordFailure(input, error);
      }
      continue;
    }

    const invitation = invitationsByEmail.get(normalizedEmail);
    const targetRole = clerkRoleFromLocalRole(input.membership.role);
    const shouldReplace = Boolean(
      invitation && (input.forceNew || invitation.role !== targetRole),
    );
    if (invitation && !shouldReplace) {
      const localMembership = await updateMembershipClerkState(input.membership.id, {
        clerkInvitationError: null,
        clerkInvitationId: invitation.id,
        clerkInvitationStatus: "pending",
        clerkInvitationUpdatedAt: new Date().toISOString(),
      });
      outcomes.set(input.membership.id, {
        membershipId: input.membership.id,
        result: { kind: "invitation", localMembership },
      });
      continue;
    }

    if (invitation && shouldReplace) {
      try {
        await client.organizations.revokeOrganizationInvitation({
          invitationId: invitation.id,
          organizationId,
          requestingUserId: input.inviterUserId,
        });
      } catch (error) {
        await recordFailure(input, error);
        continue;
      }
    }
    createInputs.push(input);
  }

  for (let index = 0; index < createInputs.length; index += 10) {
    const batch = createInputs.slice(index, index + 10);
    try {
      const response = await client.organizations.createOrganizationInvitationBulk(
        organizationId,
        batch.map((input) => ({
          emailAddress: input.user.email,
          inviterUserId: input.inviterUserId,
          publicMetadata: {
            membershipId: input.membership.id,
            membershipRole: input.membership.role,
            orgSlug: input.org.slug,
          },
          redirectUrl: absoluteAppUrl(`/org/${input.org.slug}/accept-invitation`),
          role: clerkRoleFromLocalRole(input.membership.role),
        })),
      );
      const createdByEmail = new Map(
        response.data.map((invitation) => [
          invitation.emailAddress.toLowerCase(),
          invitation,
        ]),
      );

      for (const input of batch) {
        const invitation = createdByEmail.get(input.user.email.toLowerCase());
        if (!invitation) {
          await recordFailure(
            input,
            new Error("Clerk did not return a matching invitation."),
          );
          continue;
        }
        const localMembership = await updateMembershipClerkState(input.membership.id, {
          clerkInvitationError: null,
          clerkInvitationId: invitation.id,
          clerkInvitationStatus: "pending",
          clerkInvitationUpdatedAt: new Date().toISOString(),
        });
        outcomes.set(input.membership.id, {
          membershipId: input.membership.id,
          result: { kind: "invitation", localMembership },
        });
      }
    } catch (error) {
      for (const input of batch) {
        await recordFailure(input, error);
      }
    }
  }

  return inputs.map(
    (input) =>
      outcomes.get(input.membership.id) ?? {
        membershipId: input.membership.id,
        error: "Invitation was not processed.",
      },
  );
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

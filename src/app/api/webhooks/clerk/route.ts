import { clerkClient } from "@clerk/nextjs/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

import {
  anonymizeUserByClerkUserId,
  getMembershipByClerkInvitationId,
  getMembershipByClerkMembershipId,
  getMembershipById,
  getMembershipByUserAndOrg,
  getOrganizationByClerkOrgId,
  getOrganizationBySlug,
  getUserByClerkUserId,
  getUserByEmail,
  hasClerkWebhookEvent,
  linkOrganizationToClerkOrg,
  recordClerkWebhookEvent,
  unlinkOrganizationFromClerkOrg,
  updateMembershipClerkState,
  updateMembershipStatus,
  upsertSessionUser,
} from "@/server/store";

function primaryEmail(user: {
  emailAddresses?: Array<{ emailAddress?: string | null; id?: string | null }>;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
  primaryEmailAddressId?: string | null;
}) {
  const primary = user.primaryEmailAddressId
    ? user.emailAddresses?.find((email) => email.id === user.primaryEmailAddressId)
    : undefined;
  return (
    user.primaryEmailAddress?.emailAddress ??
    primary?.emailAddress ??
    user.emailAddresses?.find((email) => email.emailAddress)?.emailAddress
  );
}

function webhookPrimaryEmail(user: {
  email_addresses?: Array<{ email_address?: string | null; id?: string | null }>;
  primary_email_address_id?: string | null;
}) {
  const primary = user.email_addresses?.find(
    (email) => email.id === user.primary_email_address_id,
  );
  return primary?.email_address ?? user.email_addresses?.[0]?.email_address;
}

function displayName(user: {
  emailAddresses?: Array<{ emailAddress?: string | null; id?: string | null }>;
  firstName?: string | null;
  fullName?: string | null;
  lastName?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
  primaryEmailAddressId?: string | null;
  username?: string | null;
}) {
  const email = primaryEmail(user) ?? "";
  const fullName = user.fullName?.trim();
  const firstLastName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || firstLastName || user.username || email;
}

async function upsertExistingLocalUserFromClerkUserId(clerkUserId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const email = primaryEmail(user);
  if (!email) {
    return null;
  }
  const existing =
    (await getUserByClerkUserId(clerkUserId)) ?? (await getUserByEmail(email));
  if (!existing) {
    return null;
  }
  return upsertSessionUser({
    clerkUserId,
    email,
    imageUrl: user.imageUrl,
    name: displayName(user),
  });
}

async function resolveLocalOrganization(clerkOrgId: string, slug?: string | null) {
  return (
    (await getOrganizationByClerkOrgId(clerkOrgId)) ??
    (slug ? await getOrganizationBySlug(slug) : undefined)
  );
}

function stringMetadata(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function localMembershipForInvitation(input: {
  email?: string | null;
  invitationId: string;
  localOrgId: string;
  metadata?: Record<string, unknown> | null;
}) {
  const byInvitationId = await getMembershipByClerkInvitationId(input.invitationId);
  if (byInvitationId?.orgId === input.localOrgId) {
    return byInvitationId;
  }
  const metadataMembershipId = stringMetadata(input.metadata, "membershipId");
  if (metadataMembershipId) {
    const membership = await getMembershipById(metadataMembershipId);
    if (membership?.orgId === input.localOrgId) {
      return membership;
    }
  }
  if (!input.email) {
    return undefined;
  }
  const user = await getUserByEmail(input.email);
  return user ? getMembershipByUserAndOrg(user.id, input.localOrgId) : undefined;
}

export async function POST(req: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(req);
  } catch (error) {
    console.error("[wavesparks] Clerk webhook verification failed", error);
    return new Response("Verification failed", { status: 400 });
  }

  const eventId = req.headers.get("svix-id") ?? `${event.type}:${Date.now()}`;
  if (await hasClerkWebhookEvent(eventId)) {
    return new Response("OK", { status: 200 });
  }

  try {
    if (event.type === "user.created" || event.type === "user.updated") {
      const email = webhookPrimaryEmail(event.data);
      const existing =
        (await getUserByClerkUserId(event.data.id)) ??
        (email ? await getUserByEmail(email) : undefined);
      if (email && existing) {
        await upsertSessionUser({
          clerkUserId: event.data.id,
          email,
          imageUrl: event.data.image_url,
          name:
            [event.data.first_name, event.data.last_name].filter(Boolean).join(" ") ||
            email,
        });
      }
    }

    if (event.type === "user.deleted") {
      if (event.data.id) {
        await anonymizeUserByClerkUserId(event.data.id);
      }
    }

    if (event.type === "organization.created" || event.type === "organization.updated") {
      const slug = event.data.slug;
      if (slug) {
        const org = await getOrganizationBySlug(slug);
        if (org) {
          await linkOrganizationToClerkOrg(org.id, event.data.id);
        }
      }
    }

    if (event.type === "organization.deleted") {
      const org = event.data.id
        ? await getOrganizationByClerkOrgId(event.data.id)
        : undefined;
      if (org) {
        await unlinkOrganizationFromClerkOrg(org.id);
      }
    }

    if (event.type === "organizationInvitation.created") {
      const localOrg = await resolveLocalOrganization(
        event.data.organization_id,
        stringMetadata(event.data.public_metadata, "orgSlug"),
      );
      const membership = localOrg
        ? await localMembershipForInvitation({
            email: event.data.email_address,
            invitationId: event.data.id,
            localOrgId: localOrg.id,
            metadata: event.data.public_metadata,
          })
        : undefined;
      if (membership) {
        await updateMembershipClerkState(membership.id, {
          clerkInvitationError: null,
          clerkInvitationId: event.data.id,
          clerkInvitationStatus: "pending",
          clerkInvitationUpdatedAt: new Date().toISOString(),
        });
      }
    }

    if (
      event.type === "organizationInvitation.accepted" ||
      event.type === "organizationInvitation.revoked"
    ) {
      const localOrg = await resolveLocalOrganization(event.data.organization_id);
      const membership = localOrg
        ? await localMembershipForInvitation({
            email: event.data.email_address,
            invitationId: event.data.id,
            localOrgId: localOrg.id,
            metadata: event.data.public_metadata,
          })
        : undefined;
      if (membership) {
        await updateMembershipClerkState(membership.id, {
          clerkInvitationError: null,
          clerkInvitationId: event.data.id,
          clerkInvitationStatus:
            event.type === "organizationInvitation.accepted" ? "accepted" : "revoked",
          clerkInvitationUpdatedAt: new Date().toISOString(),
        });
      }
    }

    if (String(event.type) === "organizationInvitation.expired") {
      const invitation = event.data as unknown as { id: string };
      const membership = await getMembershipByClerkInvitationId(invitation.id);
      if (membership) {
        await updateMembershipClerkState(membership.id, {
          clerkInvitationError: null,
          clerkInvitationStatus: "expired",
          clerkInvitationUpdatedAt: new Date().toISOString(),
        });
      }
    }

    if (
      event.type === "organizationMembership.created" ||
      event.type === "organizationMembership.updated"
    ) {
      const organizationId = event.data.organization.id;
      const clerkUserId = event.data.public_user_data.user_id;
      const localOrg = await resolveLocalOrganization(
        organizationId,
        event.data.organization.slug,
      );
      const localUser = await upsertExistingLocalUserFromClerkUserId(clerkUserId);
      const membership =
        localOrg && localUser
          ? await getMembershipByUserAndOrg(localUser.id, localOrg.id)
          : undefined;
      if (localOrg && membership) {
        await linkOrganizationToClerkOrg(localOrg.id, organizationId);
        await updateMembershipClerkState(membership.id, {
          clerkInvitationError: null,
          clerkInvitationStatus: membership.clerkInvitationId ? "accepted" : null,
          clerkInvitationUpdatedAt: new Date().toISOString(),
          clerkMembershipId: event.data.id,
          clerkRole: event.data.role,
        });
      }
    }

    if (event.type === "organizationMembership.deleted") {
      const membership = await getMembershipByClerkMembershipId(event.data.id);
      if (membership) {
        const nextMembership =
          membership.status === "rejected" || membership.status === "suspended"
            ? membership
            : await updateMembershipStatus(
                membership.id,
                "suspended",
                "Suspended after removal from Clerk organization.",
                { existingMembership: membership, recomputeMatches: false },
              );
        await updateMembershipClerkState(membership.id, {
          clerkMembershipId: null,
          clerkRole: null,
          clerkInvitationUpdatedAt: new Date().toISOString(),
        }, { existingMembership: nextMembership ?? membership });
      }
    }

    await recordClerkWebhookEvent(eventId, event.type);
  } catch (error) {
    console.error("[wavesparks] Clerk webhook handling failed", event.type, error);
    return new Response("Webhook handling failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}

import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { clerkClient } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

import { localRoleFromClerkRole } from "@/lib/clerk-roles";
import {
  createManagedAccount,
  ensureMembership,
  getMembershipByClerkMembershipId,
  getOrganizationByClerkOrgId,
  getOrganizationBySlug,
  linkOrganizationToClerkOrg,
  recordClerkWebhookEvent,
  updateMembershipStatus,
  upsertSessionUser,
} from "@/server/store";

function primaryEmail(user: {
  emailAddresses?: Array<{ emailAddress?: string | null }>;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
}) {
  return (
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses?.find((email) => email.emailAddress)?.emailAddress
  );
}

function displayName(user: {
  emailAddresses?: Array<{ emailAddress?: string | null }>;
  firstName?: string | null;
  fullName?: string | null;
  lastName?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
  username?: string | null;
}) {
  const email = primaryEmail(user) ?? "";
  const fullName = user.fullName?.trim();
  const firstLastName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  return fullName || firstLastName || user.username || email;
}

async function upsertLocalUserFromClerkUserId(clerkUserId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const email = primaryEmail(user);

  if (!email) {
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

export async function POST(req: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(req);
  } catch (error) {
    console.error("[wavesparks] Clerk webhook verification failed", error);
    return new Response("Verification failed", { status: 400 });
  }

  const eventId = req.headers.get("svix-id") ?? `${event.type}:${Date.now()}`;
  const shouldProcess = await recordClerkWebhookEvent(eventId, event.type);
  if (!shouldProcess) {
    return new Response("OK", { status: 200 });
  }

  try {
    if (event.type === "user.created" || event.type === "user.updated") {
      const email = event.data.email_addresses[0]?.email_address;
      if (email) {
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

    if (event.type === "organization.created" || event.type === "organization.updated") {
      const slug = event.data.slug;
      if (slug) {
        const org = await getOrganizationBySlug(slug);
        if (org) {
          await linkOrganizationToClerkOrg(org.id, event.data.id);
        }
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
      const localUser = await upsertLocalUserFromClerkUserId(clerkUserId);

      if (localOrg && localUser) {
        await linkOrganizationToClerkOrg(localOrg.id, organizationId);
        await ensureMembership(localUser.id, localOrg.id, {
          clerkMembershipId: event.data.id,
          clerkRole: event.data.role,
          existingUser: localUser,
        });
      }
    }

    if (event.type === "organizationMembership.deleted") {
      const membership = await getMembershipByClerkMembershipId(event.data.id);
      if (membership) {
        await updateMembershipStatus(
          membership.id,
          "suspended",
          "Suspended after removal from Clerk organization.",
          { existingMembership: membership, recomputeMatches: false },
        );
      }
    }

    if (event.type === "organizationInvitation.accepted") {
      const organizationId = event.data.organization_id;
      const email = event.data.email_address;
      const localOrg = await resolveLocalOrganization(organizationId);

      if (localOrg && email) {
        await createManagedAccount({
          clerkRole: event.data.role,
          email,
          name: email,
          orgId: localOrg.id,
          role: localRoleFromClerkRole(event.data.role),
          status: localRoleFromClerkRole(event.data.role) === "org_admin" ? "approved" : "pending",
        });
      }
    }
  } catch (error) {
    console.error("[wavesparks] Clerk webhook handling failed", event.type, error);
    return new Response("Webhook handling failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}

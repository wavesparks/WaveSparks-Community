import { after } from "next/server";

import { env } from "@/lib/env";
import type { Notification, NotificationType } from "@/lib/domain";
import {
  hasEffectiveSpaceAccess,
  spaceLifecycleAllowsMemberAccess,
} from "@/server/space-permissions";

type ResendClient = import("resend").Resend;

let resend: ResendClient | undefined;

const spaceScopedNotificationTypes = new Set<NotificationType>([
  "intro_requested",
  "intro_accepted",
  "intro_declined",
  "manual_intro",
]);

function usesMemoryE2EEmailTransport() {
  if (process.env.E2E_EMAIL_TRANSPORT !== "memory") {
    return false;
  }

  const safelyIsolated =
    process.env.E2E_LOCAL_AUTH_ENABLED === "1" &&
    !env.databaseUrl &&
    !env.clerkPublishableKey &&
    !env.clerkSecretKey &&
    !process.env.VERCEL;
  if (!safelyIsolated) {
    throw new Error(
      "The in-memory email transport is restricted to isolated local E2E runs.",
    );
  }
  return true;
}

async function getResend() {
  if (!env.resendApiKey) {
    return undefined;
  }

  if (!resend) {
    const { Resend } = await import("resend");
    resend = new Resend(env.resendApiKey);
  }

  return resend;
}

export async function sendNotificationEmail(input: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}) {
  if (usesMemoryE2EEmailTransport()) {
    return { id: "e2e-memory-email" };
  }

  const client = await getResend();
  if (!client) {
    console.info("[wavesparks] email skipped: provider unconfigured");
    return;
  }

  const message = {
    from: env.resendFromEmail,
    to: input.to,
    subject: input.subject,
    html: input.html,
  };
  const result = input.idempotencyKey
    ? await client.emails.send(message, { idempotencyKey: input.idempotencyKey })
    : await client.emails.send(message);
  if (result.error) {
    throw new Error(`Resend email failed: ${result.error.message}`);
  }
  return result.data;
}

export async function hasCurrentSpaceEmailAccess(input: {
  allowInvited?: boolean;
  membershipId: string;
  spaceId: string;
}) {
  const {
    getMembershipById,
    getSpaceById,
    getSpaceMembership,
  } = await import("@/server/store");
  const [membership, space, spaceMembership] = await Promise.all([
    getMembershipById(input.membershipId),
    getSpaceById(input.spaceId),
    getSpaceMembership(input.spaceId, input.membershipId),
  ]);
  if (!membership || !space || !spaceMembership) return false;
  if (input.allowInvited) {
    return (
      membership.orgId === space.orgId &&
      membership.accountStatus !== "suspended" &&
      membership.accountStatus !== "deprovisioned" &&
      spaceMembership.orgId === membership.orgId &&
      spaceMembership.spaceId === space.id &&
      spaceMembership.membershipId === membership.id &&
      spaceMembership.accessStatus === "active" &&
      spaceLifecycleAllowsMemberAccess(space)
    );
  }
  return hasEffectiveSpaceAccess(membership, space, spaceMembership);
}

export function enqueueNotificationEmail(input: {
  to: string;
  subject: string;
  html: string;
  membershipId?: string;
  spaceId?: string;
  allowInvited?: boolean;
}) {
  if (Boolean(input.membershipId) !== Boolean(input.spaceId)) {
    throw new Error("Space-scoped email requires both membershipId and spaceId.");
  }
  after(async () => {
    try {
      if (
        input.membershipId &&
        input.spaceId &&
        !(await hasCurrentSpaceEmailAccess({
          allowInvited: input.allowInvited,
          membershipId: input.membershipId,
          spaceId: input.spaceId,
        }))
      ) {
        return;
      }
      await sendNotificationEmail(input);
    } catch (error) {
      console.error("[wavesparks] email failed", error);
    }
  });
}

export function buildNotification(
  id: string,
  orgId: string,
  membershipId: string,
  type: NotificationType,
  title: string,
  body: string,
  link: string,
  spaceId?: string,
): Notification {
  if (spaceScopedNotificationTypes.has(type) && !spaceId) {
    throw new Error("Content notifications must belong to a Space.");
  }
  return {
    id,
    orgId,
    spaceId,
    membershipId,
    type,
    title,
    body,
    link,
    createdAt: new Date().toISOString(),
  };
}

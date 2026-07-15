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
}) {
  const client = await getResend();
  if (!client) {
    console.info("[wavesparks] email skipped", input.subject, input.to);
    return;
  }

  const result = await client.emails.send({
    from: env.resendFromEmail,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });
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
      console.error("[wavesparks] email failed", input.subject, input.to, error);
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

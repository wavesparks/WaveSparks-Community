import { after } from "next/server";
import { Resend } from "resend";

import { env } from "@/lib/env";
import type { Notification, NotificationType } from "@/lib/domain";

let resend: Resend | undefined;

function getResend() {
  if (!env.resendApiKey) {
    return undefined;
  }

  if (!resend) {
    resend = new Resend(env.resendApiKey);
  }

  return resend;
}

export async function sendNotificationEmail(input: {
  to: string;
  subject: string;
  html: string;
}) {
  const client = getResend();
  if (!client) {
    console.info("[wavesparks] email skipped", input.subject, input.to);
    return;
  }

  await client.emails.send({
    from: env.resendFromEmail,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });
}

export function enqueueNotificationEmail(input: {
  to: string;
  subject: string;
  html: string;
}) {
  after(async () => {
    try {
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
): Notification {
  return {
    id,
    orgId,
    membershipId,
    type,
    title,
    body,
    link,
    createdAt: new Date().toISOString(),
  };
}

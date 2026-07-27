import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

import {
  anonymizeUserByClerkUserId,
  getUserByClerkUserId,
  hasClerkWebhookEvent,
  recordClerkWebhookEvent,
  upsertSessionUser,
} from "@/server/store";

function webhookPrimaryEmail(user: {
  email_addresses?: Array<{
    email_address?: string | null;
    id?: string | null;
    verification?: { status?: string | null } | null;
  }>;
  primary_email_address_id?: string | null;
}) {
  const isVerified = (email: NonNullable<typeof user.email_addresses>[number]) =>
    email.verification?.status === "verified" && Boolean(email.email_address?.trim());
  const primary = user.email_addresses?.find(
    (email) => email.id === user.primary_email_address_id,
  );
  if (primary && isVerified(primary)) {
    return primary.email_address?.trim();
  }
  return user.email_addresses?.find(isVerified)?.email_address?.trim();
}

export async function POST(req: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(req);
  } catch (error) {
    console.error("[wavesparks] Clerk webhook verification failed", error);
    return new Response("Verification failed", { status: 400 });
  }

  const eventId = req.headers.get("svix-id");
  if (!eventId) {
    console.error("[wavesparks] Clerk webhook missing svix-id", event.type);
    return new Response("Missing event id", { status: 400 });
  }

  if (await hasClerkWebhookEvent(eventId)) {
    return new Response("OK", { status: 200 });
  }

  try {
    if (event.type === "user.created" || event.type === "user.updated") {
      // Never link an invited local account by email here. The one-time invitation
      // acceptance transaction is the only path that may bind a Clerk user ID.
      const existing = await getUserByClerkUserId(event.data.id);
      const email = webhookPrimaryEmail(event.data);
      if (existing && email) {
        await upsertSessionUser(
          {
            clerkUserId: event.data.id,
            email,
            imageUrl: event.data.image_url,
            name:
              [event.data.first_name, event.data.last_name]
                .filter(Boolean)
                .join(" ") || email,
          },
          { existingUser: existing },
        );
      }
    }

    if (event.type === "user.deleted" && event.data.id) {
      await anonymizeUserByClerkUserId(event.data.id);
    }

    // Organization, organization membership, and organization invitation events
    // are intentionally ignored. Neon is the sole source of organization access.
    await recordClerkWebhookEvent(eventId, event.type);
  } catch (error) {
    console.error("[wavesparks] Clerk webhook handling failed", event.type, error);
    return new Response("Webhook handling failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}

import { createClerkClient } from "@clerk/backend";
import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";

let clerk: ReturnType<typeof createClerkClient> | undefined;

function usesMemoryE2ETransport() {
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
      "The in-memory identity invitation transport is restricted to isolated local E2E runs.",
    );
  }
  return true;
}

function getClerk() {
  if (!env.clerkSecretKey) {
    throw new Error("Clerk identity invitation delivery is not configured.");
  }
  clerk ??= createClerkClient({ secretKey: env.clerkSecretKey });
  return clerk;
}

function clerkErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  if ("status" in error) return Number(error.status);
  if ("statusCode" in error) return Number(error.statusCode);
  return undefined;
}

export async function createClerkIdentityInvitation(input: {
  emailAddress: string;
  redirectUrl: string;
}) {
  if (usesMemoryE2ETransport()) {
    return { id: `e2e_identity_invitation_${randomUUID()}` };
  }

  const invitation = await getClerk().invitations.createInvitation({
    emailAddress: input.emailAddress,
    expiresInDays: 7,
    ignoreExisting: true,
    notify: true,
    redirectUrl: input.redirectUrl,
  });
  return { id: invitation.id };
}

export async function revokeClerkIdentityInvitation(invitationId?: string) {
  if (!invitationId || invitationId.startsWith("e2e_identity_invitation_")) {
    return;
  }
  if (usesMemoryE2ETransport()) {
    return;
  }

  try {
    await getClerk().invitations.revokeInvitation(invitationId);
  } catch (error) {
    if (clerkErrorStatus(error) !== 404) {
      throw error;
    }
  }
}

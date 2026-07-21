import { createHash, randomBytes } from "node:crypto";

export const membershipInvitationCookieName = "ws_membership_invite";
export const membershipInvitationCookieMaxAgeSeconds = 15 * 60;

const tokenByteLength = 32;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const orgSlugPattern = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

export interface MembershipInvitationCookieValue {
  orgSlug: string;
  token: string;
}

export function generateMembershipInvitationToken() {
  return randomBytes(tokenByteLength).toString("base64url");
}

export function isValidMembershipInvitationToken(token?: string | null) {
  return Boolean(token && tokenPattern.test(token));
}

export function hashMembershipInvitationToken(token: string) {
  if (!isValidMembershipInvitationToken(token)) {
    throw new Error("Invalid membership invitation token.");
  }

  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function serializeMembershipInvitationCookie(
  value: MembershipInvitationCookieValue,
) {
  if (
    !orgSlugPattern.test(value.orgSlug) ||
    !isValidMembershipInvitationToken(value.token)
  ) {
    throw new Error("Invalid membership invitation cookie value.");
  }

  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function parseMembershipInvitationCookie(
  value?: string | null,
): MembershipInvitationCookieValue | null {
  if (!value || value.length > 512) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      return null;
    }

    const candidate = decoded as Record<string, unknown>;
    const orgSlug =
      typeof candidate.orgSlug === "string" ? candidate.orgSlug : "";
    const token = typeof candidate.token === "string" ? candidate.token : "";
    if (!orgSlugPattern.test(orgSlug) || !isValidMembershipInvitationToken(token)) {
      return null;
    }

    return { orgSlug, token };
  } catch {
    return null;
  }
}

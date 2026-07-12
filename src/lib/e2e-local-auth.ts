import { createHmac, timingSafeEqual } from "node:crypto";

export const e2eLocalAuthCookieName = "wavesparks_e2e_auth";
export const e2eLocalAuthHeaderName = "x-e2e-auth-secret";

export interface E2ELocalAuthPayload {
  email: string;
  name: string;
  imageUrl?: string;
  orgId: string;
  orgRole: string;
  orgSlug: string;
  exp: number;
}

interface CookieLike {
  name: string;
  value: string;
}

function getSecret() {
  return process.env.E2E_LOCAL_AUTH_SECRET?.trim();
}

export function isE2ELocalAuthEnabled() {
  return (
    process.env.E2E_LOCAL_AUTH_ENABLED === "1" &&
    Boolean(getSecret())
  );
}

export function isE2ELocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.startsWith("127.")
  );
}

function sign(value: string) {
  const secret = getSecret();
  if (!secret) {
    return "";
  }

  return createHmac("sha256", secret).update(value).digest("base64url");
}

function signaturesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function e2eLocalAuthSecretMatches(value?: string | null) {
  const secret = getSecret();
  return Boolean(secret && value && signaturesMatch(value, secret));
}

export function createE2ELocalAuthToken(
  input: Omit<E2ELocalAuthPayload, "exp"> & { ttlSeconds?: number },
) {
  const payload: E2ELocalAuthPayload = {
    email: input.email.toLowerCase().trim(),
    imageUrl: input.imageUrl,
    name: input.name.trim() || input.email,
    orgId: input.orgId,
    orgRole: input.orgRole,
    orgSlug: input.orgSlug,
    exp: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? 3600),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function isPayload(value: unknown): value is E2ELocalAuthPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.email === "string" &&
    typeof payload.name === "string" &&
    typeof payload.orgId === "string" &&
    typeof payload.orgRole === "string" &&
    typeof payload.orgSlug === "string" &&
    typeof payload.exp === "number"
  );
}

export function verifyE2ELocalAuthToken(token?: string) {
  if (!isE2ELocalAuthEnabled() || !token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !signaturesMatch(signature, sign(encodedPayload))) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;
    if (!isPayload(payload) || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function getE2ELocalAuthPayloadFromCookies(cookies: CookieLike[]) {
  return verifyE2ELocalAuthToken(
    cookies.find((cookie) => cookie.name === e2eLocalAuthCookieName)?.value,
  );
}

export function getE2ELocalClerkOrganizationContext() {
  if (!isE2ELocalAuthEnabled()) {
    return null;
  }

  return {
    has: ({ role }: { role: string }) => role === "org:admin",
    orgId: "org_e2e_wavespark",
    userId: "user_e2e_admin",
  };
}

import { cookies } from "next/headers";

import { hasPotentialClerkSessionCookie } from "@/lib/clerk-cookies";
import { getE2ELocalAuthPayloadFromCookies } from "@/lib/e2e-local-auth";
import { env, isClerkConfigured } from "@/lib/env";

type ClerkServer = typeof import("@clerk/nextjs/server");
type ClerkAuth = Awaited<ReturnType<ClerkServer["auth"]>>;
type ClerkSessionClaims = NonNullable<ClerkAuth["sessionClaims"]>;
type ClerkJwtClaims = Awaited<ReturnType<ClerkServer["verifyToken"]>>;
type ClerkVerifyTokenOptions = NonNullable<Parameters<ClerkServer["verifyToken"]>[1]>;
type ClerkClaims = ClerkSessionClaims | ClerkJwtClaims;
type ClerkClient = Awaited<ReturnType<ClerkServer["clerkClient"]>>;
type ClerkUser = Awaited<ReturnType<ClerkClient["users"]["getUser"]>>;

export interface AuthIdentity {
  clerkUserId: string;
  clerkOrgId?: string;
  clerkOrgSlug?: string;
  clerkOrgRole?: string;
  canManageOrgMemberships: boolean;
  email: string;
  name: string;
  imageUrl?: string;
  provider: "clerk" | "e2e";
}

export type ClerkOrgIdentity = Pick<
  AuthIdentity,
  "canManageOrgMemberships" | "clerkOrgId" | "clerkOrgRole" | "clerkOrgSlug" | "clerkUserId"
>;

export type KnownClerkIdentity = Pick<AuthIdentity, "email" | "imageUrl" | "name">;

interface CurrentAuthIdentityOptions {
  allowClerkLookupWithoutCookie?: boolean;
  clerkSessionToken?: string;
  resolveKnownClerkIdentity?: (
    identity: ClerkOrgIdentity,
  ) => Promise<KnownClerkIdentity | null | undefined>;
}

function nameForClerkUser(user: NonNullable<ClerkUser>, email: string) {
  const composedName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return user.fullName || composedName || user.username || email;
}

function identityFromClerkUser(
  user: ClerkUser,
  orgIdentity: ClerkOrgIdentity,
): AuthIdentity | null {
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses.at(0)?.emailAddress;

  if (!user || !email) {
    return null;
  }

  return {
    ...orgIdentity,
    email,
    name: nameForClerkUser(user, email),
    imageUrl: user.imageUrl,
    provider: "clerk",
  };
}

function claimValue(claims: ClerkClaims | Record<string, unknown>, key: string) {
  return (claims as Record<string, unknown>)[key];
}

function stringClaim(claims: ClerkClaims | Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = claimValue(claims, key);

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function identityFromClerkClaims(
  claims: ClerkClaims | null | undefined,
  orgIdentity: ClerkOrgIdentity,
): AuthIdentity | null {
  if (!claims) {
    return null;
  }

  const email = stringClaim(claims, [
    "email",
    "email_address",
    "primary_email_address",
  ]);

  if (!email) {
    return null;
  }

  const firstName = stringClaim(claims, ["first_name", "given_name"]);
  const lastName = stringClaim(claims, ["last_name", "family_name"]);
  const composedName = [firstName, lastName].filter(Boolean).join(" ");
  const name =
    stringClaim(claims, ["name", "full_name", "preferred_username", "username"]) ??
    (composedName || email);

  return {
    ...orgIdentity,
    email,
    name,
    imageUrl: stringClaim(claims, ["picture", "image_url", "imageUrl"]),
    provider: "clerk",
  };
}

function recordClaim(claims: ClerkClaims, key: string) {
  const value = claimValue(claims, key);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function orgRoleFromCompactClaim(role?: string) {
  if (!role) {
    return undefined;
  }

  return role.startsWith("org:") ? role : `org:${role}`;
}

function orgIdentityFromClerkClaims(
  claims: ClerkClaims,
  clerkUserId: string,
): ClerkOrgIdentity {
  const compactOrg = recordClaim(claims, "o");
  const compactOrgRole = orgRoleFromCompactClaim(
    compactOrg ? stringClaim(compactOrg, ["rol"]) : undefined,
  );
  const orgRole = compactOrgRole ?? stringClaim(claims, ["org_role"]);

  return {
    clerkUserId,
    clerkOrgId:
      (compactOrg ? stringClaim(compactOrg, ["id"]) : undefined) ??
      stringClaim(claims, ["org_id"]),
    clerkOrgSlug:
      (compactOrg ? stringClaim(compactOrg, ["slg"]) : undefined) ??
      stringClaim(claims, ["org_slug"]),
    clerkOrgRole: orgRole,
    canManageOrgMemberships: orgRole === "org:admin",
  };
}

function clerkSessionTokenVerificationOptions(): ClerkVerifyTokenOptions | null {
  if (env.clerkJwtKey) {
    return { jwtKey: env.clerkJwtKey };
  }

  if (env.clerkSecretKey) {
    return { secretKey: env.clerkSecretKey };
  }

  return null;
}

function verificationMode() {
  return env.clerkJwtKey ? "jwtKey" : "secretKey";
}

function authErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message.slice(0, 240),
      name: error.name,
    };
  }

  return {
    message: String(error).slice(0, 240),
    name: typeof error,
  };
}

async function identityFromClerkSessionToken(
  clerkSessionToken: string,
  server: Pick<ClerkServer, "clerkClient" | "verifyToken">,
) {
  const verifyOptions = clerkSessionTokenVerificationOptions();

  if (!verifyOptions) {
    console.warn("auth_clerk_session_token_verification_unconfigured", {
      hasJwtKey: Boolean(env.clerkJwtKey),
      hasSecretKey: Boolean(env.clerkSecretKey),
    });
    return null;
  }

  let claims: ClerkJwtClaims;
  try {
    claims = await server.verifyToken(clerkSessionToken, verifyOptions);
  } catch (error) {
    console.warn("auth_clerk_session_token_verification_failed", {
      ...authErrorMessage(error),
      hasJwtKey: Boolean(env.clerkJwtKey),
      hasSecretKey: Boolean(env.clerkSecretKey),
      verificationMode: verificationMode(),
    });
    return null;
  }

  const clerkUserId = stringClaim(claims, ["sub"]);

  if (!clerkUserId) {
    console.warn("auth_clerk_session_token_missing_subject", {
      verificationMode: verificationMode(),
    });
    return null;
  }

  const orgIdentity = orgIdentityFromClerkClaims(claims, clerkUserId);
  const claimsIdentity = identityFromClerkClaims(claims, orgIdentity);

  if (claimsIdentity) {
    return claimsIdentity;
  }

  const client = await server.clerkClient();
  return identityFromClerkUser(
    await client.users.getUser(clerkUserId),
    orgIdentity,
  );
}

export async function getCurrentAuthIdentity(
  options: CurrentAuthIdentityOptions = {},
): Promise<AuthIdentity | null> {
  const cookieStore = await cookies();
  const requestCookies = cookieStore.getAll();
  const e2ePayload = getE2ELocalAuthPayloadFromCookies(requestCookies);
  if (e2ePayload) {
    return {
      canManageOrgMemberships: e2ePayload.orgRole === "org:admin",
      clerkOrgId: e2ePayload.orgId,
      clerkOrgRole: e2ePayload.orgRole,
      clerkOrgSlug: e2ePayload.orgSlug,
      clerkUserId: `e2e:${e2ePayload.email}`,
      email: e2ePayload.email,
      imageUrl: e2ePayload.imageUrl,
      name: e2ePayload.name,
      provider: "e2e",
    };
  }

  if (!isClerkConfigured()) {
    return null;
  }

  if (
    !options.allowClerkLookupWithoutCookie &&
    !hasPotentialClerkSessionCookie(requestCookies)
  ) {
    return null;
  }

  const { auth, clerkClient, verifyToken } = await import("@clerk/nextjs/server");
  const clerkSessionToken = options.clerkSessionToken?.trim();

  if (clerkSessionToken) {
    const tokenIdentity = await identityFromClerkSessionToken(
      clerkSessionToken,
      { clerkClient, verifyToken },
    );

    if (tokenIdentity) {
      return tokenIdentity;
    }
  }

  let clerkAuth: ClerkAuth;
  try {
    clerkAuth = await auth();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("clerkMiddleware")
    ) {
      return null;
    }

    throw error;
  }

  if (!clerkAuth.userId) {
    return null;
  }

  const orgIdentity: ClerkOrgIdentity = {
    clerkUserId: clerkAuth.userId,
    clerkOrgId: clerkAuth.orgId ?? undefined,
    clerkOrgSlug: clerkAuth.orgSlug ?? undefined,
    clerkOrgRole: clerkAuth.orgRole ?? undefined,
    canManageOrgMemberships: Boolean(clerkAuth.has?.({ role: "org:admin" })),
  };

  const claimsIdentity = identityFromClerkClaims(
    clerkAuth.sessionClaims,
    orgIdentity,
  );

  if (claimsIdentity) {
    return claimsIdentity;
  }

  const knownIdentity = await options.resolveKnownClerkIdentity?.(orgIdentity);
  if (knownIdentity) {
    return {
      ...orgIdentity,
      ...knownIdentity,
      provider: "clerk",
    };
  }

  const client = await clerkClient();
  return identityFromClerkUser(
    await client.users.getUser(clerkAuth.userId),
    orgIdentity,
  );
}

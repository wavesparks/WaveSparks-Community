import { cookies } from "next/headers";

import { hasPotentialClerkSessionCookie } from "@/lib/clerk-cookies";
import { getE2ELocalAuthPayloadFromCookies } from "@/lib/e2e-local-auth";
import { env, isClerkConfigured } from "@/lib/env";

type ClerkServer = typeof import("@clerk/nextjs/server");
type ClerkAuth = Awaited<ReturnType<ClerkServer["auth"]>>;
type ClerkJwtClaims = Awaited<ReturnType<ClerkServer["verifyToken"]>>;
type ClerkVerifyTokenOptions = NonNullable<Parameters<ClerkServer["verifyToken"]>[1]>;
type ClerkClient = Awaited<ReturnType<ClerkServer["clerkClient"]>>;
type ClerkUser = Awaited<ReturnType<ClerkClient["users"]["getUser"]>>;

export interface AuthIdentity {
  clerkUserId: string;
  email: string;
  name: string;
  imageUrl?: string;
  provider: "clerk" | "e2e";
}

export type ClerkUserIdentity = Pick<AuthIdentity, "clerkUserId">;

export type KnownClerkIdentity = Pick<AuthIdentity, "email" | "imageUrl" | "name">;

interface CurrentAuthIdentityOptions {
  allowClerkLookupWithoutCookie?: boolean;
  clerkSessionToken?: string;
  resolveKnownClerkIdentity?: (
    identity: ClerkUserIdentity,
  ) => Promise<KnownClerkIdentity | null | undefined>;
}

function nameForClerkUser(user: NonNullable<ClerkUser>, email: string) {
  const composedName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return user.fullName || composedName || user.username || email;
}

function verifiedEmailForClerkUser(user: NonNullable<ClerkUser>) {
  type ClerkEmailAddress = (typeof user.emailAddresses)[number];
  const isVerified = (
    email: ClerkEmailAddress | null | undefined,
  ): email is ClerkEmailAddress =>
    email?.verification?.status === "verified" && Boolean(email.emailAddress.trim());
  const primary = user.primaryEmailAddress;

  if (isVerified(primary)) {
    return primary.emailAddress.trim();
  }

  const primaryById = user.primaryEmailAddressId
    ? user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)
    : undefined;
  if (isVerified(primaryById)) {
    return primaryById.emailAddress.trim();
  }

  return user.emailAddresses.find(isVerified)?.emailAddress.trim();
}

function identityFromClerkUser(
  user: ClerkUser,
  clerkUserId: string,
): AuthIdentity | null {
  if (!user) {
    return null;
  }
  const email = verifiedEmailForClerkUser(user);
  if (!email) return null;

  return {
    clerkUserId,
    email,
    name: nameForClerkUser(user, email),
    imageUrl: user.imageUrl,
    provider: "clerk",
  };
}

function claimValue(claims: ClerkJwtClaims | Record<string, unknown>, key: string) {
  return (claims as Record<string, unknown>)[key];
}

function stringClaim(claims: ClerkJwtClaims | Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = claimValue(claims, key);

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
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
  resolveKnownClerkIdentity?: CurrentAuthIdentityOptions["resolveKnownClerkIdentity"],
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

  const knownIdentity = await resolveKnownClerkIdentity?.({ clerkUserId });
  if (knownIdentity) {
    return {
      clerkUserId,
      ...knownIdentity,
      provider: "clerk" as const,
    };
  }

  const client = await server.clerkClient();
  return identityFromClerkUser(
    await client.users.getUser(clerkUserId),
    clerkUserId,
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
      options.resolveKnownClerkIdentity,
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

  const clerkUserIdentity: ClerkUserIdentity = {
    clerkUserId: clerkAuth.userId,
  };

  const knownIdentity = await options.resolveKnownClerkIdentity?.(clerkUserIdentity);
  if (knownIdentity) {
    return {
      ...clerkUserIdentity,
      ...knownIdentity,
      provider: "clerk",
    };
  }

  const client = await clerkClient();
  return identityFromClerkUser(
    await client.users.getUser(clerkAuth.userId),
    clerkAuth.userId,
  );
}

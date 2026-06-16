import { isClerkConfigured } from "@/lib/env";

type ClerkServer = typeof import("@clerk/nextjs/server");
type ClerkAuth = Awaited<ReturnType<ClerkServer["auth"]>>;
type ClerkSessionClaims = NonNullable<ClerkAuth["sessionClaims"]>;
type ClerkClient = Awaited<ReturnType<ClerkServer["clerkClient"]>>;
type ClerkUser = Awaited<ReturnType<ClerkClient["users"]["getUser"]>>;

export interface AuthIdentity {
  email: string;
  name: string;
  imageUrl?: string;
  provider: "clerk";
}

function nameForClerkUser(user: NonNullable<ClerkUser>, email: string) {
  const composedName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return user.fullName || composedName || user.username || email;
}

function identityFromClerkUser(user: ClerkUser): AuthIdentity | null {
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses.at(0)?.emailAddress;

  if (!user || !email) {
    return null;
  }

  return {
    email,
    name: nameForClerkUser(user, email),
    imageUrl: user.imageUrl,
    provider: "clerk",
  };
}

function stringClaim(
  claims: ClerkSessionClaims,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = claims[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function identityFromClerkClaims(
  claims: ClerkSessionClaims | null | undefined,
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
    email,
    name,
    imageUrl: stringClaim(claims, ["picture", "image_url", "imageUrl"]),
    provider: "clerk",
  };
}

export async function getCurrentAuthIdentity(): Promise<AuthIdentity | null> {
  if (!isClerkConfigured()) {
    return null;
  }

  const { auth, clerkClient } = await import("@clerk/nextjs/server");
  const clerkAuth = await auth();

  if (!clerkAuth.userId) {
    return null;
  }

  const claimsIdentity = identityFromClerkClaims(clerkAuth.sessionClaims);

  if (claimsIdentity) {
    return claimsIdentity;
  }

  const client = await clerkClient();
  return identityFromClerkUser(await client.users.getUser(clerkAuth.userId));
}

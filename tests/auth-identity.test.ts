import { beforeEach, describe, expect, it, vi } from "vitest";

const clerkAuthMock = vi.hoisted(() => vi.fn());
const verifyTokenMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());
const getAllCookiesMock = vi.hoisted(() => vi.fn());
const clerkClientMock = vi.hoisted(() =>
  vi.fn(async () => ({
    users: {
      getUser: getUserMock,
    },
  })),
);

async function loadAuthIdentity() {
  vi.resetModules();
  vi.doMock("next/headers", () => ({
    cookies: vi.fn(async () => ({
      getAll: getAllCookiesMock,
    })),
  }));
  vi.doMock("@clerk/nextjs/server", () => ({
    auth: clerkAuthMock,
    clerkClient: clerkClientMock,
    verifyToken: verifyTokenMock,
  }));

  return import("@/lib/auth-identity");
}

describe("current auth identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_JWT_KEY;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.E2E_LOCAL_AUTH_ENABLED;
    delete process.env.E2E_LOCAL_AUTH_SECRET;
    delete process.env.VERCEL_ENV;
    getAllCookiesMock.mockReturnValue([{ name: "__session", value: "session" }]);
    clerkAuthMock.mockResolvedValue({ userId: null, sessionClaims: null });
    verifyTokenMock.mockRejectedValue(new Error("No token mock configured."));
    getUserMock.mockResolvedValue(null);
  });

  it("returns null when Clerk is not configured", async () => {
    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(getCurrentAuthIdentity()).resolves.toBeNull();
    expect(clerkAuthMock).not.toHaveBeenCalled();
  });

  it("uses a signed local E2E cookie without calling Clerk", async () => {
    process.env.E2E_LOCAL_AUTH_ENABLED = "1";
    process.env.E2E_LOCAL_AUTH_SECRET = "local-e2e-auth-secret";
    const { createE2ELocalAuthToken, e2eLocalAuthCookieName } = await import(
      "@/lib/e2e-local-auth"
    );
    getAllCookiesMock.mockReturnValue([
      {
        name: e2eLocalAuthCookieName,
        value: createE2ELocalAuthToken({
          email: "avery@wavesparks.co",
          name: "Avery Tan",
          orgId: "org_e2e_wavespark",
          orgRole: "org:admin",
          orgSlug: "wavesparks",
        }),
      },
    ]);
    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(getCurrentAuthIdentity()).resolves.toEqual({
      canManageOrgMemberships: true,
      clerkOrgId: "org_e2e_wavespark",
      clerkOrgRole: "org:admin",
      clerkOrgSlug: "wavesparks",
      clerkUserId: "e2e:avery@wavesparks.co",
      email: "avery@wavesparks.co",
      imageUrl: undefined,
      name: "Avery Tan",
      provider: "e2e",
    });
    expect(clerkAuthMock).not.toHaveBeenCalled();
  });

  it("returns null when Clerk has no signed-in user", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_wavesparks";
    process.env.CLERK_SECRET_KEY = "sk_live_wavesparks";

    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(getCurrentAuthIdentity()).resolves.toBeNull();
    expect(clerkAuthMock).toHaveBeenCalled();
  });

  it("returns null without calling Clerk when no session cookie is present", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_wavesparks";
    process.env.CLERK_SECRET_KEY = "sk_live_wavesparks";
    getAllCookiesMock.mockReturnValue([{ name: "theme", value: "light" }]);

    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(getCurrentAuthIdentity()).resolves.toBeNull();
    expect(clerkAuthMock).not.toHaveBeenCalled();
  });

  it("can ask Clerk directly when protected routes need auth during OAuth handoff", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_wavesparks";
    process.env.CLERK_SECRET_KEY = "sk_live_wavesparks";
    getAllCookiesMock.mockReturnValue([{ name: "theme", value: "light" }]);

    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(
      getCurrentAuthIdentity({ allowClerkLookupWithoutCookie: true }),
    ).resolves.toBeNull();
    expect(clerkAuthMock).toHaveBeenCalled();
  });

  it("uses a verified Clerk bearer token without requiring a session cookie", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_wavesparks";
    process.env.CLERK_SECRET_KEY = "sk_live_wavesparks";
    getAllCookiesMock.mockReturnValue([{ name: "theme", value: "light" }]);
    verifyTokenMock.mockResolvedValue({
      email: "clerk@example.com",
      name: "Clerk Member",
      o: {
        id: "org_clerk",
        rol: "admin",
        slg: "wavesparks",
      },
      picture: "https://example.com/clerk.png",
      sub: "clerk_user",
      v: 2,
    });

    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(
      getCurrentAuthIdentity({
        allowClerkLookupWithoutCookie: true,
        clerkSessionToken: "session_token",
      }),
    ).resolves.toEqual({
      canManageOrgMemberships: true,
      clerkOrgId: "org_clerk",
      clerkOrgRole: "org:admin",
      clerkOrgSlug: "wavesparks",
      clerkUserId: "clerk_user",
      email: "clerk@example.com",
      name: "Clerk Member",
      imageUrl: "https://example.com/clerk.png",
      provider: "clerk",
    });
    expect(verifyTokenMock).toHaveBeenCalledWith("session_token", {
      secretKey: "sk_live_wavesparks",
    });
    expect(clerkAuthMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("prefers a Clerk JWT key when verifying bearer tokens", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_wavesparks";
    process.env.CLERK_SECRET_KEY = "sk_live_wavesparks";
    process.env.CLERK_JWT_KEY = "clerk_jwt_key";
    getAllCookiesMock.mockReturnValue([{ name: "theme", value: "light" }]);
    verifyTokenMock.mockResolvedValue({
      email: "clerk@example.com",
      name: "Clerk Member",
      org_id: "org_clerk",
      org_role: "org:member",
      org_slug: "wavesparks",
      sub: "clerk_user",
    });

    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(
      getCurrentAuthIdentity({
        allowClerkLookupWithoutCookie: true,
        clerkSessionToken: "session_token",
      }),
    ).resolves.toMatchObject({
      clerkUserId: "clerk_user",
      email: "clerk@example.com",
      provider: "clerk",
    });
    expect(verifyTokenMock).toHaveBeenCalledWith("session_token", {
      jwtKey: "clerk_jwt_key",
    });
  });

  it("loads the Clerk user when a verified bearer token has no email claim", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_wavesparks";
    process.env.CLERK_SECRET_KEY = "sk_live_wavesparks";
    getAllCookiesMock.mockReturnValue([{ name: "theme", value: "light" }]);
    verifyTokenMock.mockResolvedValue({
      org_id: "org_clerk",
      org_role: "org:member",
      org_slug: "wavesparks",
      sub: "clerk_user",
    });
    getUserMock.mockResolvedValue({
      firstName: "Clerk",
      lastName: "Member",
      fullName: null,
      username: null,
      imageUrl: "https://example.com/clerk.png",
      primaryEmailAddress: {
        emailAddress: "clerk@example.com",
      },
      emailAddresses: [],
    });

    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(
      getCurrentAuthIdentity({
        allowClerkLookupWithoutCookie: true,
        clerkSessionToken: "session_token",
      }),
    ).resolves.toEqual({
      canManageOrgMemberships: false,
      clerkOrgId: "org_clerk",
      clerkOrgRole: "org:member",
      clerkOrgSlug: "wavesparks",
      clerkUserId: "clerk_user",
      email: "clerk@example.com",
      name: "Clerk Member",
      imageUrl: "https://example.com/clerk.png",
      provider: "clerk",
    });
    expect(clerkAuthMock).not.toHaveBeenCalled();
    expect(getUserMock).toHaveBeenCalledWith("clerk_user");
  });

  it("treats Clerk middleware detection errors as an anonymous request", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_wavesparks";
    process.env.CLERK_SECRET_KEY = "sk_live_wavesparks";
    clerkAuthMock.mockRejectedValue(
      new Error("Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware()."),
    );

    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(getCurrentAuthIdentity()).resolves.toBeNull();
  });

  it("uses Clerk claims when a Clerk user is signed in", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_wavesparks";
    process.env.CLERK_SECRET_KEY = "sk_live_wavesparks";
    clerkAuthMock.mockResolvedValue({
      has: vi.fn(() => false),
      orgId: "org_clerk",
      orgRole: "org:member",
      orgSlug: "wavesparks",
      userId: "clerk_user",
      sessionClaims: {
        email: "clerk@example.com",
        name: "Clerk Member",
        picture: "https://example.com/clerk.png",
      },
    });

    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(getCurrentAuthIdentity()).resolves.toEqual({
      canManageOrgMemberships: false,
      clerkOrgId: "org_clerk",
      clerkOrgRole: "org:member",
      clerkOrgSlug: "wavesparks",
      clerkUserId: "clerk_user",
      email: "clerk@example.com",
      name: "Clerk Member",
      imageUrl: "https://example.com/clerk.png",
      provider: "clerk",
    });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("loads the Clerk user when claims do not include an email", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_wavesparks";
    process.env.CLERK_SECRET_KEY = "sk_live_wavesparks";
    clerkAuthMock.mockResolvedValue({
      has: vi.fn(() => true),
      orgId: "org_clerk",
      orgRole: "org:admin",
      orgSlug: "wavesparks",
      userId: "clerk_user",
      sessionClaims: {},
    });
    getUserMock.mockResolvedValue({
      firstName: "Clerk",
      lastName: "Member",
      fullName: null,
      username: null,
      imageUrl: "https://example.com/clerk.png",
      primaryEmailAddress: {
        emailAddress: "clerk@example.com",
      },
      emailAddresses: [],
    });

    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(getCurrentAuthIdentity()).resolves.toEqual({
      canManageOrgMemberships: true,
      clerkOrgId: "org_clerk",
      clerkOrgRole: "org:admin",
      clerkOrgSlug: "wavesparks",
      clerkUserId: "clerk_user",
      email: "clerk@example.com",
      name: "Clerk Member",
      imageUrl: "https://example.com/clerk.png",
      provider: "clerk",
    });
  });
});

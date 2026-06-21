import { beforeEach, describe, expect, it, vi } from "vitest";

const clerkAuthMock = vi.hoisted(() => vi.fn());
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
  }));

  return import("@/lib/auth-identity");
}

describe("current auth identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    getAllCookiesMock.mockReturnValue([{ name: "__session", value: "session" }]);
    clerkAuthMock.mockResolvedValue({ userId: null, sessionClaims: null });
    getUserMock.mockResolvedValue(null);
  });

  it("returns null when Clerk is not configured", async () => {
    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(getCurrentAuthIdentity()).resolves.toBeNull();
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

  it("uses Clerk claims when a Clerk user is signed in", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_wavesparks";
    process.env.CLERK_SECRET_KEY = "sk_live_wavesparks";
    clerkAuthMock.mockResolvedValue({
      has: vi.fn(() => false),
      orgId: "org_clerk",
      orgRole: "org:member",
      orgSlug: "wavespark",
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
      clerkOrgSlug: "wavespark",
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
      orgSlug: "wavespark",
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
      clerkOrgSlug: "wavespark",
      clerkUserId: "clerk_user",
      email: "clerk@example.com",
      name: "Clerk Member",
      imageUrl: "https://example.com/clerk.png",
      provider: "clerk",
    });
  });
});

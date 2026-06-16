import { beforeEach, describe, expect, it, vi } from "vitest";

const clerkAuthMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());
const clerkClientMock = vi.hoisted(() =>
  vi.fn(async () => ({
    users: {
      getUser: getUserMock,
    },
  })),
);

async function loadAuthIdentity() {
  vi.resetModules();
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

  it("uses Clerk claims when a Clerk user is signed in", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_wavesparks";
    process.env.CLERK_SECRET_KEY = "sk_live_wavesparks";
    clerkAuthMock.mockResolvedValue({
      userId: "clerk_user",
      sessionClaims: {
        email: "clerk@example.com",
        name: "Clerk Member",
        picture: "https://example.com/clerk.png",
      },
    });

    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(getCurrentAuthIdentity()).resolves.toEqual({
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
      email: "clerk@example.com",
      name: "Clerk Member",
      imageUrl: "https://example.com/clerk.png",
      provider: "clerk",
    });
  });
});

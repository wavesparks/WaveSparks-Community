import { beforeEach, describe, expect, it, vi } from "vitest";

const clerkAuthMock = vi.hoisted(() => vi.fn());
const clerkClientMock = vi.hoisted(() => vi.fn());
const getServerSessionMock = vi.hoisted(() => vi.fn());

async function loadAuthIdentity() {
  vi.resetModules();
  vi.doMock("@clerk/nextjs/server", () => ({
    auth: clerkAuthMock,
    clerkClient: clerkClientMock,
  }));
  vi.doMock("next-auth", () => ({
    getServerSession: getServerSessionMock,
  }));

  return import("@/lib/auth-identity");
}

describe("current auth identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    process.env.AUTH_DEV_DEMO_ENABLED = "false";
    getServerSessionMock.mockResolvedValue(null);
    clerkAuthMock.mockResolvedValue({ userId: null, sessionClaims: null });
    clerkClientMock.mockResolvedValue({
      users: {
        getUser: vi.fn(),
      },
    });
  });

  it("uses the email/password session even when demo access is disabled", async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        email: "member@example.com",
        name: "Member Example",
        image: "https://example.com/avatar.png",
      },
    });

    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(getCurrentAuthIdentity()).resolves.toEqual({
      email: "member@example.com",
      name: "Member Example",
      imageUrl: "https://example.com/avatar.png",
      provider: "password",
    });
  });

  it("falls back to the email/password session when Clerk has no user", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_wavesparks";
    process.env.CLERK_SECRET_KEY = "sk_live_wavesparks";
    getServerSessionMock.mockResolvedValue({
      user: {
        email: "fallback@example.com",
        name: "Fallback Member",
      },
    });

    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(getCurrentAuthIdentity()).resolves.toEqual({
      email: "fallback@example.com",
      name: "Fallback Member",
      imageUrl: undefined,
      provider: "password",
    });
    expect(clerkAuthMock).toHaveBeenCalled();
  });

  it("prefers Clerk claims when a Clerk user is signed in", async () => {
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
    getServerSessionMock.mockResolvedValue({
      user: {
        email: "fallback@example.com",
        name: "Fallback Member",
      },
    });

    const { getCurrentAuthIdentity } = await loadAuthIdentity();

    await expect(getCurrentAuthIdentity()).resolves.toEqual({
      email: "clerk@example.com",
      name: "Clerk Member",
      imageUrl: "https://example.com/clerk.png",
      provider: "clerk",
    });
    expect(getServerSessionMock).not.toHaveBeenCalled();
  });
});

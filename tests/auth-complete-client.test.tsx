import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  getToken: vi.fn(),
  isLoaded: true,
  isSignedIn: true,
  orgId: "org_clerk_wavespark",
  setActive: vi.fn(),
  signOut: vi.fn(),
}));
const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    getToken: clerk.getToken,
    isLoaded: clerk.isLoaded,
    isSignedIn: clerk.isSignedIn,
    orgId: clerk.orgId,
  }),
  useClerk: () => ({
    setActive: clerk.setActive,
    signOut: clerk.signOut,
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import { AuthCompleteClient } from "@/components/auth/auth-complete-client";

describe("AuthCompleteClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clerk.isLoaded = true;
    clerk.isSignedIn = true;
    clerk.orgId = "org_clerk_wavespark";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("refreshes the token once after a 401 and skips redundant organization activation", async () => {
    clerk.getToken
      .mockResolvedValueOnce("stale-session-token")
      .mockResolvedValueOnce("fresh-session-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({
          clerkOrgId: "org_clerk_wavespark",
          state: "ready",
          target: "/org/wavesparks/feed",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthCompleteClient slug="wavesparks" />);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/org/wavesparks/feed");
    });
    expect(clerk.getToken).toHaveBeenNthCalledWith(1, { skipCache: false });
    expect(clerk.getToken).toHaveBeenNthCalledWith(2, { skipCache: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(clerk.setActive).not.toHaveBeenCalled();
  });

  it("fails after two missing-token attempts without a fixed retry delay", async () => {
    clerk.getToken.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthCompleteClient slug="wavesparks" />);

    expect(
      await screen.findByText("We couldn’t confirm your sign-in. Please try again."),
    ).toBeInTheDocument();
    expect(clerk.getToken).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

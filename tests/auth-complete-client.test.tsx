import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => ({
  getToken: vi.fn(),
  isLoaded: true,
  isSignedIn: true,
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
  }),
  useClerk: () => ({
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
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("refreshes the token once after an invitation acceptance 401", async () => {
    clerk.getToken
      .mockResolvedValueOnce("stale-session-token")
      .mockResolvedValueOnce("fresh-session-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({
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
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/internal/membership-invitations/accept?orgSlug=wavesparks",
      expect.objectContaining({ method: "POST" }),
    );
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

  it("stops when the signed-in account does not own the invitation", async () => {
    clerk.getToken.mockResolvedValue("session-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ error: "Email mismatch." }, { status: 403 }),
      ),
    );

    render(<AuthCompleteClient slug="wavesparks" />);

    expect(
      await screen.findByText(
        "This invitation belongs to a different email address. Sign out and use the address that received the invitation.",
      ),
    ).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

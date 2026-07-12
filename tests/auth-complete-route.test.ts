import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAuthCompletionViewerContextMock = vi.hoisted(() => vi.fn());
const canAccessFeedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getAuthCompletionViewerContext: getAuthCompletionViewerContextMock,
}));

vi.mock("@/server/permissions", () => ({
  canAccessFeed: canAccessFeedMock,
}));

import { GET } from "@/app/api/internal/auth/complete/route";

describe("auth completion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    canAccessFeedMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects requests without Clerk credentials before resolving viewer context", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/internal/auth/complete?orgSlug=wavespark"),
    );

    expect(response.status).toBe(401);
    expect(getAuthCompletionViewerContextMock).not.toHaveBeenCalled();
  });

  it("passes Clerk bearer tokens into the auth completion context", async () => {
    getAuthCompletionViewerContextMock.mockResolvedValue({
      clerkOrgId: "org_clerk_wavespark",
      state: "ready",
      status: "authenticated",
      viewer: {
        membership: { status: "approved" },
        profile: {},
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/internal/auth/complete?orgSlug=wavespark", {
        headers: {
          authorization: "Bearer session_token",
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      clerkOrgId: "org_clerk_wavespark",
      state: "ready",
      target: "/org/wavespark/feed",
    });
    expect(response.status).toBe(200);
    expect(getAuthCompletionViewerContextMock).toHaveBeenCalledWith(
      "wavespark",
      { clerkSessionToken: "session_token" },
    );
  });

  it("returns 403 when the Clerk account has no local membership", async () => {
    getAuthCompletionViewerContextMock.mockResolvedValue({
      status: "forbidden",
      viewer: null,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/internal/auth/complete?orgSlug=wavespark", {
        headers: { authorization: "Bearer session_token" },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This account does not have a Wavespark invitation.",
    });
  });
});

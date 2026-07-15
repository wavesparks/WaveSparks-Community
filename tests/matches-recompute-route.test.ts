import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentAuthIdentityMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-identity", () => ({
  getCurrentAuthIdentity: getCurrentAuthIdentityMock,
}));

vi.mock("@/lib/env", () => ({
  env: {
    cronSecret: "test-cron-secret",
  },
}));

import { GET, POST } from "@/app/api/internal/matches/recompute/route";
import { resetStore } from "@/server/store";

describe("match recompute internal route", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    getCurrentAuthIdentityMock.mockResolvedValue(null);
  });

  it("never authorizes a GET mutation through an admin browser session", async () => {
    getCurrentAuthIdentityMock.mockResolvedValue({
      email: "avery@wavesparks.co",
      name: "Avery Tan",
      provider: "clerk",
    });

    const response = await GET(
      new Request("http://localhost/api/internal/matches/recompute?orgSlug=wavesparks"),
    );

    expect(response.status).toBe(401);
    expect(getCurrentAuthIdentityMock).not.toHaveBeenCalled();
  });

  it("accepts a secret-authenticated cron GET", async () => {
    const response = await GET(
      new Request("http://localhost/api/internal/matches/recompute?orgSlug=wavesparks", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(getCurrentAuthIdentityMock).not.toHaveBeenCalled();
  });

  it("keeps connected admin sessions on POST", async () => {
    getCurrentAuthIdentityMock.mockResolvedValue({
      email: "avery@wavesparks.co",
      name: "Avery Tan",
      provider: "clerk",
    });

    const response = await POST(
      new Request("http://localhost/api/internal/matches/recompute", {
        body: JSON.stringify({ orgSlug: "wavesparks" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(getCurrentAuthIdentityMock).toHaveBeenCalledTimes(1);
  });
});

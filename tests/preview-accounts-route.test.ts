import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentAuthIdentityMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-identity", () => ({
  getCurrentAuthIdentity: getCurrentAuthIdentityMock,
}));

import { POST } from "@/app/api/internal/preview-accounts/route";
import { resetStore } from "@/server/store";

function request() {
  return new Request("http://localhost/api/internal/preview-accounts", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

describe("preview accounts internal route", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    getCurrentAuthIdentityMock.mockResolvedValue(null);
  });

  it("rejects unauthenticated callers", async () => {
    const response = await POST(request());

    expect(response.status).toBe(401);
  });

  it("rejects non-admin members", async () => {
    getCurrentAuthIdentityMock.mockResolvedValue({
      email: "jules@example.com",
      name: "Jules Park",
      provider: "clerk",
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
  });

  it("provisions the three preview accounts for an admin", async () => {
    getCurrentAuthIdentityMock.mockResolvedValue({
      email: "avery@wavesparks.co",
      name: "Avery Tan",
      provider: "clerk",
    });

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.accounts).toHaveLength(3);
    expect(payload.expectedKinds.sort()).toEqual(["admin", "founder", "mentor"]);
    expect(payload.accounts.map((account: { kind: string }) => account.kind).sort()).toEqual([
      "admin",
      "founder",
      "mentor",
    ]);
  });
});

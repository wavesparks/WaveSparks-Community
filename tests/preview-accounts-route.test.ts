import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentAuthIdentityMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-identity", () => ({
  getCurrentAuthIdentity: getCurrentAuthIdentityMock,
}));

import { POST } from "@/app/api/internal/preview-accounts/route";
import { previewAccountSpecs } from "@/server/preview-accounts";
import { authorizePasswordUser, resetStore } from "@/server/store";

function request(password = "preview-password-123") {
  return new Request("http://localhost/api/internal/preview-accounts", {
    method: "POST",
    body: JSON.stringify({ password }),
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
      provider: "password",
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
  });

  it("provisions the three preview accounts for an admin", async () => {
    const password = "preview-password-123";
    getCurrentAuthIdentityMock.mockResolvedValue({
      email: "avery@wavespark.co",
      name: "Avery Tan",
      provider: "password",
    });

    const response = await POST(request(password));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.accounts).toHaveLength(3);
    expect(payload.expectedKinds.sort()).toEqual(["admin", "founder", "mentor"]);
    expect(payload.accounts.map((account: { kind: string }) => account.kind).sort()).toEqual([
      "admin",
      "founder",
      "mentor",
    ]);

    for (const spec of previewAccountSpecs) {
      await expect(
        authorizePasswordUser({
          email: spec.email,
          password,
        }),
      ).resolves.toMatchObject({ email: spec.email });
    }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: mocks.createClient,
}));

vi.mock("@/lib/env", () => ({
  env: {
    clerkPublishableKey: undefined,
    clerkSecretKey: "sk_test_identity_invitations",
    databaseUrl: undefined,
  },
}));

import {
  createClerkIdentityInvitation,
  revokeClerkIdentityInvitation,
} from "@/server/clerk-identity-invitations";

describe("Clerk application identity invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.E2E_EMAIL_TRANSPORT;
    delete process.env.E2E_LOCAL_AUTH_ENABLED;
    mocks.createInvitation.mockResolvedValue({ id: "inv_application_test" });
    mocks.revokeInvitation.mockResolvedValue({ id: "inv_application_test" });
    mocks.createClient.mockReturnValue({
      invitations: {
        createInvitation: mocks.createInvitation,
        revokeInvitation: mocks.revokeInvitation,
      },
    });
  });

  it("creates an application invitation without any Organization API", async () => {
    await expect(
      createClerkIdentityInvitation({
        emailAddress: "invited@example.com",
        redirectUrl:
          "https://app.wavesparks.co/api/internal/membership-invitations/accept?orgSlug=wavesparks&token=secret",
      }),
    ).resolves.toEqual({ id: "inv_application_test" });

    expect(mocks.createInvitation).toHaveBeenCalledWith({
      emailAddress: "invited@example.com",
      expiresInDays: 7,
      ignoreExisting: true,
      notify: true,
      redirectUrl:
        "https://app.wavesparks.co/api/internal/membership-invitations/accept?orgSlug=wavesparks&token=secret",
    });
  });

  it("revokes an application invitation and treats an already-missing invite as success", async () => {
    await expect(
      revokeClerkIdentityInvitation("inv_application_test"),
    ).resolves.toBeUndefined();
    expect(mocks.revokeInvitation).toHaveBeenCalledWith("inv_application_test");

    mocks.revokeInvitation.mockRejectedValueOnce(
      Object.assign(new Error("Not found"), { status: 404 }),
    );
    await expect(
      revokeClerkIdentityInvitation("inv_application_missing"),
    ).resolves.toBeUndefined();
  });
});

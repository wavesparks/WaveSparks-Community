import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.hoisted(() => vi.fn());
const afterState = vi.hoisted(() => ({
  callbacks: [] as Array<() => Promise<void>>,
}));

vi.mock("next/server", () => ({
  after: vi.fn((callback: () => Promise<void>) => {
    afterState.callbacks.push(callback);
  }),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendEmailMock };
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    resendApiKey: "re_test_wavesparks",
    resendFromEmail: "Wavesparks <notification@wavesparks.co>",
  },
  isBootstrapAdminEmail: vi.fn(() => false),
}));

import { seedOrganization } from "@/data/seed-data";
import {
  buildNotification,
  enqueueNotificationEmail,
  sendNotificationEmail,
} from "@/server/notifications";
import {
  listSpacesForOrg,
  resetStore,
  setSpaceMembershipAccessStatus,
  updateMembershipAccountStatus,
} from "@/server/store";

describe("notification email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterState.callbacks.length = 0;
  });

  it("requires content notifications to carry a Space", () => {
    expect(() =>
      buildNotification(
        "ntf_missing_space",
        seedOrganization.id,
        "mem_jules",
        "intro_requested",
        "Missing scope",
        "This content notification is invalid.",
        "/org/wavesparks/requests",
      ),
    ).toThrow("must belong to a Space");
  });

  it("returns the accepted Resend message", async () => {
    sendEmailMock.mockResolvedValue({ data: { id: "email_123" }, error: null });

    await expect(
      sendNotificationEmail({
        to: "delivered@resend.dev",
        subject: "Delivery check",
        html: "<p>Ready</p>",
      }),
    ).resolves.toEqual({ id: "email_123" });
    expect(sendEmailMock).toHaveBeenCalledWith({
      from: "Wavesparks <notification@wavesparks.co>",
      to: "delivered@resend.dev",
      subject: "Delivery check",
      html: "<p>Ready</p>",
    });
  });

  it("throws when Resend returns an API error without rejecting", async () => {
    sendEmailMock.mockResolvedValue({
      data: null,
      error: { message: "Domain is not verified", name: "validation_error" },
    });

    await expect(
      sendNotificationEmail({
        to: "delivered@resend.dev",
        subject: "Delivery check",
        html: "<p>Ready</p>",
      }),
    ).rejects.toThrow("Resend email failed: Domain is not verified");
  });

  it("drops a queued content email when Space access is removed before delivery", async () => {
    resetStore();
    const mainSpace = (await listSpacesForOrg(seedOrganization.id)).find(
      (space) => space.kind === "main",
    )!;
    sendEmailMock.mockResolvedValue({ data: { id: "email_late" }, error: null });
    enqueueNotificationEmail({
      to: "jules@example.com",
      subject: "Scoped update",
      html: `<a href="https://app.example.com/org/wavesparks/s/${mainSpace.slug}/requests">Open</a>`,
      membershipId: "mem_jules",
      spaceId: mainSpace.id,
    });
    await setSpaceMembershipAccessStatus({
      orgId: seedOrganization.id,
      spaceId: mainSpace.id,
      membershipId: "mem_jules",
      accessStatus: "removed",
    });

    await afterState.callbacks[0]?.();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("allows queued access mail for an invited member with active entitlement", async () => {
    resetStore();
    const mainSpace = (await listSpacesForOrg(seedOrganization.id)).find(
      (space) => space.kind === "main",
    )!;
    await updateMembershipAccountStatus("mem_jules", "invited", {
      recomputeMatches: false,
    });
    sendEmailMock.mockResolvedValue({ data: { id: "email_invited" }, error: null });
    enqueueNotificationEmail({
      to: "jules@example.com",
      subject: "Main access granted",
      html: `<a href="https://app.example.com/org/wavesparks/s/${mainSpace.slug}">Open</a>`,
      membershipId: "mem_jules",
      spaceId: mainSpace.id,
      allowInvited: true,
    });

    await afterState.callbacks[0]?.();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Main access granted",
        to: "jules@example.com",
      }),
    );
  });
});

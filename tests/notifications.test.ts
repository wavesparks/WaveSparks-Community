import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("next/server", () => ({ after: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendEmailMock };
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    resendApiKey: "re_test_wavesparks",
    resendFromEmail: "Wavesparks <hello@wavesparks.co>",
  },
}));

import { sendNotificationEmail } from "@/server/notifications";

describe("notification email delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      from: "Wavesparks <hello@wavesparks.co>",
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
});

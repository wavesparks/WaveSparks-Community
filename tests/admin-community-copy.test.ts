import { describe, expect, it } from "vitest";

import {
  adminFriendlyMessage,
  adminInvitationIssue,
  adminSpaceName,
  adminSpaceOptionLabel,
  WAVESPARKS_COMMUNITY_NAME,
} from "@/components/admin/admin-community-copy";

describe("admin community product copy", () => {
  it("always presents the main destination as Wavesparks Community", () => {
    const main = { kind: "main" as const, name: "Main Community" };

    expect(adminSpaceName(main)).toBe(WAVESPARKS_COMMUNITY_NAME);
    expect(adminSpaceOptionLabel(main)).toBe(WAVESPARKS_COMMUNITY_NAME);
  });

  it("labels Events without exposing the internal Space model", () => {
    const event = { kind: "event" as const, name: "Founder Lab" };

    expect(adminSpaceName(event)).toBe("Founder Lab");
    expect(adminSpaceOptionLabel(event)).toBe("Founder Lab · Event");
  });

  it("translates server messages into product language before showing them", () => {
    const message = adminFriendlyMessage(
      "Archived Spaces cannot accept new members. Add to Main Community from the Event Space; the Main entitlement remains separate.",
    );

    expect(message).toBe(
      "Archived Events cannot accept new members. Add to Wavesparks Community from the Event; the Wavesparks Community access remains separate.",
    );
    expect(message).not.toMatch(/\b(Main Community|Spaces?|entitlements?|scopes?|pools?)\b/i);
  });

  it("keeps invitation provider errors out of the member details UI", () => {
    expect(adminInvitationIssue("rate_limited")).toContain("Wait a few minutes");
    expect(adminInvitationIssue("Invitation email failed: Resend unavailable")).toBe(
      "The account was updated, but the notification email could not be sent. Try again.",
    );
    expect(adminInvitationIssue("Clerk did not return an invitation")).not.toMatch(
      /Clerk|Resend/,
    );
  });
});

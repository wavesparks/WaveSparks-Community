import { describe, expect, it } from "vitest";

import {
  generateMembershipInvitationToken,
  hashMembershipInvitationToken,
  isValidMembershipInvitationToken,
  parseMembershipInvitationCookie,
  serializeMembershipInvitationCookie,
} from "@/lib/membership-invitation-token";

describe("membership invitation tokens", () => {
  it("generates a 256-bit URL-safe token and hashes it without storing the raw value", () => {
    const token = generateMembershipInvitationToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isValidMembershipInvitationToken(token)).toBe(true);
    expect(hashMembershipInvitationToken(token)).toMatch(/^[a-f\d]{64}$/);
    expect(hashMembershipInvitationToken(token)).not.toContain(token);
  });

  it("round-trips only valid invitation cookie values", () => {
    const token = generateMembershipInvitationToken();
    const serialized = serializeMembershipInvitationCookie({
      orgSlug: "wavesparks",
      token,
    });

    expect(parseMembershipInvitationCookie(serialized)).toEqual({
      orgSlug: "wavesparks",
      token,
    });
    expect(parseMembershipInvitationCookie("not-a-cookie")).toBeNull();
    expect(isValidMembershipInvitationToken("too-short")).toBe(false);
  });
});

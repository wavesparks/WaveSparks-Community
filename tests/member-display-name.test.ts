import { describe, expect, it } from "vitest";

import { getMemberDisplayName } from "@/lib/member-display-name";

describe("getMemberDisplayName", () => {
  it("prefers a real preferred name", () => {
    expect(
      getMemberDisplayName({
        email: "alex.chen@example.com",
        name: "Alexandra Chen",
        preferredName: "Alex",
      }),
    ).toBe("Alex");
  });

  it("uses the account name when the profile name is an email", () => {
    expect(
      getMemberDisplayName({
        email: "alex.chen@example.com",
        name: "Alexandra Chen",
        preferredName: "alex.chen@example.com",
      }),
    ).toBe("Alexandra Chen");
  });

  it("turns an email local-part into a natural name", () => {
    expect(
      getMemberDisplayName({
        email: "alex_chen+event@example.com",
        name: "alex_chen+event@example.com",
        preferredName: "alex_chen+event@example.com",
      }),
    ).toBe("Alex Chen");
  });

  it("falls back without exposing a malformed email", () => {
    expect(
      getMemberDisplayName({
        email: "@example.com",
        name: "@example.com",
      }),
    ).toBe("Member");
  });
});

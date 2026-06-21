import { describe, expect, it } from "vitest";

import { hasPotentialClerkSessionCookie } from "@/lib/clerk-cookies";

describe("Clerk session cookie detection", () => {
  it("detects Clerk session and client cookies", () => {
    expect(hasPotentialClerkSessionCookie([{ name: "__session" }])).toBe(true);
    expect(hasPotentialClerkSessionCookie([{ name: "__session_abc12345" }])).toBe(true);
    expect(hasPotentialClerkSessionCookie([{ name: "__client_uat" }])).toBe(true);
    expect(hasPotentialClerkSessionCookie([{ name: "__client_uat_abc12345" }])).toBe(true);
    expect(hasPotentialClerkSessionCookie([{ name: "__clerk_db_jwt" }])).toBe(true);
    expect(hasPotentialClerkSessionCookie([{ name: "clerk_state" }])).toBe(true);
  });

  it("ignores unrelated cookies", () => {
    expect(
      hasPotentialClerkSessionCookie([
        { name: "theme" },
        { name: "next-instant-navigation-testing" },
      ]),
    ).toBe(false);
  });
});

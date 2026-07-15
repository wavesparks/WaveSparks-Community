import { describe, expect, it } from "vitest";

import { containsPrelaunchQaContactIdentifier } from "../scripts/prelaunch-qa-core";

describe("prelaunch QA core contact safety gate", () => {
  it.each([
    "portfolio.me",
    "name.dev/foo",
    "foo.xyz",
    "foo.tech",
    "例子.公司/路径",
    "xn--fsqu00a.xn--55qx5d",
    "9123-4567",
    "person@example.test",
    "https://example.test/profile",
    "@sample_handle",
    "LinkedIn: public-person",
    "GitHub profile",
  ])("rejects contact or link value %s", (value) => {
    expect(containsPrelaunchQaContactIdentifier(value)).toBe(true);
  });

  it.each([
    "Product research and service design",
    "Singapore startup ecosystem",
    "R&D, Ph.D. research, and API strategy",
    "Early-stage mentoring for community teams",
  ])("allows safe profile prose %s", (value) => {
    expect(containsPrelaunchQaContactIdentifier(value)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { pathWithQuery } from "@/lib/feed-filters";

describe("feed query helpers", () => {
  it("builds safe return paths without stale status params", () => {
    expect(
      pathWithQuery("/org/wavesparks/feed", {
        q: "mentor",
        status: "member_followed",
        type: "ask",
        tag: undefined,
      }),
    ).toBe("/org/wavesparks/feed?q=mentor&type=ask");
  });
});

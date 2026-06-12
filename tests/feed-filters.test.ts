import { describe, expect, it } from "vitest";

import { pathWithQuery } from "@/lib/feed-filters";

describe("feed query helpers", () => {
  it("builds safe return paths without stale status params", () => {
    expect(
      pathWithQuery("/org/wavespark/feed", {
        q: "mentor",
        status: "member_followed",
        type: "ask",
        tag: undefined,
      }),
    ).toBe("/org/wavespark/feed?q=mentor&type=ask");
  });
});

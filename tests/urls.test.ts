import { describe, expect, it } from "vitest";

import { env } from "@/lib/env";
import {
  getPostCommentRevalidationPaths,
  getPostListPathForType,
  getPostListRevalidationPaths,
} from "@/lib/post-action-routing";
import { absoluteAppUrl } from "@/lib/urls";

describe("absoluteAppUrl", () => {
  it("builds deploy-safe URLs for app paths", () => {
    const baseOrigin = new URL(env.appUrl).origin;
    const withSlash = new URL(absoluteAppUrl("/org/wavespark/requests"));
    const withoutSlash = new URL(absoluteAppUrl("org/wavespark/requests"));

    expect(withSlash.origin).toBe(baseOrigin);
    expect(withSlash.pathname).toBe("/org/wavespark/requests");
    expect(withoutSlash.toString()).toBe(withSlash.toString());
  });

  it("routes post mutations to only the affected member surfaces", () => {
    expect(getPostListPathForType("wavespark", "ask")).toBe("/org/wavespark/feed");
    expect(getPostListRevalidationPaths("wavespark", "ask")).toEqual([
      "/org/wavespark/feed",
    ]);
    expect(getPostCommentRevalidationPaths("wavespark", "pst_1", "ask")).toEqual([
      "/org/wavespark/posts/pst_1",
      "/org/wavespark/feed",
    ]);

    expect(getPostListPathForType("wavespark", "opportunity")).toBe(
      "/org/wavespark/opportunities",
    );
    expect(getPostListRevalidationPaths("wavespark", "opportunity")).toEqual([
      "/org/wavespark/feed",
      "/org/wavespark/opportunities",
    ]);
    expect(getPostCommentRevalidationPaths("wavespark", "pst_2", "opportunity")).toEqual([
      "/org/wavespark/posts/pst_2",
      "/org/wavespark/feed",
      "/org/wavespark/opportunities",
    ]);
  });
});

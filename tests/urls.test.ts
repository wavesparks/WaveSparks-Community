import { describe, expect, it } from "vitest";

import { env } from "@/lib/env";
import {
  getPostCommentRevalidationPaths,
  getPostListPathForType,
  getPostListRevalidationPaths,
  getSpacePostCommentRevalidationPaths,
} from "@/lib/post-action-routing";
import { absoluteAppUrl } from "@/lib/urls";

describe("absoluteAppUrl", () => {
  it("builds deploy-safe URLs for app paths", () => {
    const baseOrigin = new URL(env.appUrl).origin;
    const withSlash = new URL(absoluteAppUrl("/org/wavesparks/requests"));
    const withoutSlash = new URL(absoluteAppUrl("org/wavesparks/requests"));

    expect(withSlash.origin).toBe(baseOrigin);
    expect(withSlash.pathname).toBe("/org/wavesparks/requests");
    expect(withoutSlash.toString()).toBe(withSlash.toString());
  });

  it("routes post mutations to only the affected member surfaces", () => {
    expect(getPostListPathForType("wavesparks", "ask")).toBe("/org/wavesparks/feed");
    expect(getPostListRevalidationPaths("wavesparks", "ask")).toEqual([
      "/org/wavesparks/feed",
    ]);
    expect(getPostCommentRevalidationPaths("wavesparks", "pst_1", "ask")).toEqual([
      "/org/wavesparks/posts/pst_1",
      "/org/wavesparks/feed",
    ]);

    expect(getPostListPathForType("wavesparks", "opportunity")).toBe(
      "/org/wavesparks/opportunities",
    );
    expect(getPostListRevalidationPaths("wavesparks", "opportunity")).toEqual([
      "/org/wavesparks/feed",
      "/org/wavesparks/opportunities",
    ]);
    expect(getPostCommentRevalidationPaths("wavesparks", "pst_2", "opportunity")).toEqual([
      "/org/wavesparks/posts/pst_2",
      "/org/wavesparks/feed",
      "/org/wavesparks/opportunities",
    ]);
    expect(
      getSpacePostCommentRevalidationPaths(
        "wavesparks",
        "summit",
        "pst_2",
        "opportunity",
      ),
    ).toEqual([
      "/org/wavesparks/s/summit/posts/pst_2",
      "/org/wavesparks/s/summit/feed",
      "/org/wavesparks/s/summit/opportunities",
      "/org/wavesparks/s/summit/knowledge",
    ]);
  });
});

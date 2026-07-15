import { describe, expect, it } from "vitest";

import { postStatusLabel, postTypeLabel } from "@/lib/post-copy";

describe("post product copy", () => {
  it("uses natural names for post types", () => {
    expect(postTypeLabel("ask")).toBe("Question");
    expect(postTypeLabel("general_update")).toBe("Update");
    expect(postTypeLabel("looking_for_cofounder")).toBe("Looking for a co-founder");
  });

  it("uses readable status labels", () => {
    expect(postStatusLabel("active")).toBe("Open");
    expect(postStatusLabel("archived")).toBe("Archived");
  });
});

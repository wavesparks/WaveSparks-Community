import { describe, expect, it } from "vitest";

import {
  WAVESPARKS_COMMUNITY_NAME,
  getCommunityDisplayName,
  getCommunityPeopleLabels,
} from "@/lib/community-copy";

describe("member-facing community names", () => {
  it("always uses the Wavesparks name for the main community", () => {
    expect(
      getCommunityDisplayName({ kind: "main", name: "Main Community" }),
    ).toBe(WAVESPARKS_COMMUNITY_NAME);
  });

  it("uses the activity name for an event and falls back to Event", () => {
    expect(
      getCommunityDisplayName({ kind: "event", name: "  Climate Founders Week  " }),
    ).toBe("Climate Founders Week");
    expect(getCommunityDisplayName({ kind: "event", name: "  " })).toBe("Event");
  });

  it("calls people members in the community and participants in events", () => {
    expect(getCommunityPeopleLabels({ kind: "main" })).toEqual({
      plural: "members",
      singular: "member",
    });
    expect(getCommunityPeopleLabels({ kind: "event" })).toEqual({
      plural: "participants",
      singular: "participant",
    });
  });
});

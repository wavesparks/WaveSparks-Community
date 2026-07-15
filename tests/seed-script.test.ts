import { describe, expect, it } from "vitest";

import * as seedData from "@/data/seed-data";
import { buildSeedRows } from "../scripts/seed";

const expectedMainSpaceId = "spc_main_32cc651c8dd0f38f85f74995122fcb06";
const accountScopedNotificationTypes = new Set(["membership_approved", "admin_note"]);

describe("Space-aware database seed", () => {
  it("creates a deterministic Main Community and active access only for connected approved accounts", () => {
    const rows = buildSeedRows(seedData);
    const eligibleMembershipIds = seedData.seedMemberships
      .filter(
        (membership) =>
          membership.orgId === seedData.seedOrganization.id &&
          membership.accountStatus === "connected" &&
          membership.status === "approved",
      )
      .map((membership) => membership.id)
      .sort();

    expect(rows.seededSpaces).toEqual([
      expect.objectContaining({
        id: expectedMainSpaceId,
        orgId: seedData.seedOrganization.id,
        slug: "main",
        kind: "main",
        lifecycle: "active",
        matchingEnabled: true,
      }),
    ]);
    expect(rows.seededSpaceMemberships.map((row) => row.membershipId).sort()).toEqual(
      eligibleMembershipIds,
    );
    expect(rows.seededSpaceMemberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          spaceId: expectedMainSpaceId,
          accessStatus: "active",
          joinedVia: "migration",
        }),
      ]),
    );
    expect(rows.seededSpaceIntents.map((row) => row.membershipId).sort()).toEqual(
      eligibleMembershipIds,
    );
    expect(rows.seededSpaceIntents.every((row) => row.spaceId === expectedMainSpaceId)).toBe(
      true,
    );
    expect(rows.seededSpaceIntents.every((row) => row.embeddingStatus === "pending")).toBe(
      true,
    );

    const activeMainMembershipIds = new Set(
      rows.seededSpaceMemberships.map((row) => row.membershipId),
    );
    expect(activeMainMembershipIds.has("mem_priya")).toBe(false);
    expect(activeMainMembershipIds.has("mem_nora")).toBe(false);
  });

  it("assigns every seeded Space resource to Main while keeping account notifications unscoped", () => {
    const rows = buildSeedRows(seedData);

    expect(rows.seededPosts.every((row) => row.spaceId === expectedMainSpaceId)).toBe(true);
    expect(rows.seededPosts.every((row) => row.visibility === "space_only")).toBe(true);
    expect(rows.seededFollows.every((row) => row.spaceId === expectedMainSpaceId)).toBe(true);
    expect(rows.seededIntroRequests.every((row) => row.spaceId === expectedMainSpaceId)).toBe(
      true,
    );
    expect(rows.seededAnalyticsEvents.every((row) => row.spaceId === expectedMainSpaceId)).toBe(
      true,
    );

    for (const notification of rows.seededNotifications) {
      if (accountScopedNotificationTypes.has(notification.type)) {
        expect(notification.spaceId).toBeNull();
      } else {
        expect(notification.spaceId).toBe(expectedMainSpaceId);
        expect(notification.link).toContain("/org/wavesparks/s/main/");
      }
    }
  });

  it("keeps generated Space relationship identifiers stable across repeated seed runs", () => {
    const first = buildSeedRows(seedData);
    const second = buildSeedRows(seedData);

    expect(second.seededSpaces.map((row) => row.id)).toEqual(
      first.seededSpaces.map((row) => row.id),
    );
    expect(second.seededSpaceMemberships.map((row) => row.id)).toEqual(
      first.seededSpaceMemberships.map((row) => row.id),
    );
    expect(second.seededSpaceIntents.map((row) => row.id)).toEqual(
      first.seededSpaceIntents.map((row) => row.id),
    );
  });
});

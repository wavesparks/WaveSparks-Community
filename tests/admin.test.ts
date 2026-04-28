import { beforeEach, describe, expect, it } from "vitest";

import { fullProfilesToCsv } from "@/server/csv";
import {
  createIntroRequest,
  getAnalyticsSnapshot,
  getMembershipById,
  listMembershipsForOrg,
  listProfilesForOrg,
  recomputeMatchesForOrg,
  resetStore,
  updatePostModeration,
  updateProfileFlags,
} from "@/server/store";
import { toFullAdminProfile } from "@/server/view-models";

describe("admin operations", () => {
  beforeEach(() => {
    resetStore();
  });

  it("supports moderation toggles and match recompute", async () => {
    const post = await updatePostModeration("pst_1", { hidden: true, featured: false });
    const profile = await updateProfileFlags("pro_jules", { stale: true });
    const matches = await recomputeMatchesForOrg("org_wavespark");

    expect(post?.hidden).toBe(true);
    expect(profile?.stale).toBe(true);
    expect(matches.length).toBeGreaterThan(20);
  });

  it("creates admin-friendly exports and analytics snapshots", async () => {
    await createIntroRequest({
      orgId: "org_wavespark",
      requesterMembershipId: "mem_avery",
      receiverMembershipId: "mem_leila",
      sourceType: "admin_manual",
      sourceId: "manual_testing",
      introPurpose: "general connection",
      note: "Making a manual intro for a likely mentor relationship.",
      status: "pending",
      suggestedFirstMessage: "Excited to compare notes.",
    });

    const memberships = await listMembershipsForOrg("org_wavespark");
    const profiles = (await listProfilesForOrg("org_wavespark"))
      .map((profile) => {
        const membership = memberships.find((candidate) => candidate.id === profile.membershipId);
        return membership ? toFullAdminProfile(profile, membership) : null;
      })
      .filter(Boolean);

    const csv = fullProfilesToCsv(profiles as NonNullable<(typeof profiles)[number]>[]);
    const analytics = await getAnalyticsSnapshot("org_wavespark");

    expect(csv).toContain("Display Name");
    expect(analytics.introRequestsSent).toBeGreaterThan(0);
    await expect(getMembershipById("mem_avery")).resolves.toMatchObject({ role: "org_admin" });
  });
});

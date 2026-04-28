import { describe, expect, it, beforeEach } from "vitest";

import { canAccessFeed, canViewAdminRoute, canViewContactDetails } from "@/server/permissions";
import {
  getMembershipById,
  getProfileByMembershipId,
  getUserById,
  listIntroRequestsForMembership,
  resetStore,
} from "@/server/store";

describe("permission guards", () => {
  beforeEach(() => {
    resetStore();
  });

  it("allows admins onto admin routes and blocks regular members", async () => {
    const adminMembership = (await getMembershipById("mem_avery"))!;
    const adminUser = (await getUserById(adminMembership.userId))!;
    const memberMembership = (await getMembershipById("mem_jules"))!;
    const memberUser = (await getUserById(memberMembership.userId))!;

    expect(canViewAdminRoute(adminUser, adminMembership)).toBe(true);
    expect(canViewAdminRoute(memberUser, memberMembership)).toBe(false);
  });

  it("only grants feed access to approved members with onboarding complete", async () => {
    const approvedMembership = (await getMembershipById("mem_jules"))!;
    const approvedProfile = (await getProfileByMembershipId("mem_jules"))!;
    const pendingMembership = (await getMembershipById("mem_priya"))!;
    const pendingProfile = (await getProfileByMembershipId("mem_priya"))!;

    expect(canAccessFeed(approvedMembership, approvedProfile)).toBe(true);
    expect(canAccessFeed(pendingMembership, pendingProfile)).toBe(false);
  });

  it("reveals contact details only after an accepted intro and only to the participants", async () => {
    const acceptedIntro = (await listIntroRequestsForMembership("mem_jules")).find(
      (request) => request.id === "intro_1",
    )!;

    expect(canViewContactDetails("mem_jules", acceptedIntro)).toBe(true);
    expect(canViewContactDetails("mem_marcus", acceptedIntro)).toBe(true);
    expect(canViewContactDetails("mem_rhea", acceptedIntro)).toBe(false);
  });
});

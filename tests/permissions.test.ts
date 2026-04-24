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

  it("allows admins onto admin routes and blocks regular members", () => {
    const adminMembership = getMembershipById("mem_avery")!;
    const adminUser = getUserById(adminMembership.userId)!;
    const memberMembership = getMembershipById("mem_jules")!;
    const memberUser = getUserById(memberMembership.userId)!;

    expect(canViewAdminRoute(adminUser, adminMembership)).toBe(true);
    expect(canViewAdminRoute(memberUser, memberMembership)).toBe(false);
  });

  it("only grants feed access to approved members with onboarding complete", () => {
    const approvedMembership = getMembershipById("mem_jules")!;
    const approvedProfile = getProfileByMembershipId("mem_jules")!;
    const pendingMembership = getMembershipById("mem_priya")!;
    const pendingProfile = getProfileByMembershipId("mem_priya")!;

    expect(canAccessFeed(approvedMembership, approvedProfile)).toBe(true);
    expect(canAccessFeed(pendingMembership, pendingProfile)).toBe(false);
  });

  it("reveals contact details only after an accepted intro and only to the participants", () => {
    const acceptedIntro = listIntroRequestsForMembership("mem_jules").find(
      (request) => request.id === "intro_1",
    )!;

    expect(canViewContactDetails("mem_jules", acceptedIntro)).toBe(true);
    expect(canViewContactDetails("mem_marcus", acceptedIntro)).toBe(true);
    expect(canViewContactDetails("mem_rhea", acceptedIntro)).toBe(false);
  });
});

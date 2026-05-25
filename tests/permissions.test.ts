import { describe, expect, it, beforeEach } from "vitest";

import { canAccessFeed, canViewAdminRoute, canViewContactDetails } from "@/server/permissions";
import { seedOrganization } from "@/data/seed-data";
import {
  authorizePasswordUser,
  createManagedAccount,
  ensureMembership,
  getMembershipById,
  getProfileByMembershipId,
  getUserById,
  listIntroRequestsForMembership,
  resetStore,
  upsertSessionUser,
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

  it("bootstraps the letsbuild account as an approved admin", async () => {
    const user = await upsertSessionUser({
      email: "letsbuild@wavesparks.co",
      name: "Lets Build",
    });
    const membership = await ensureMembership(user.id, seedOrganization.id);

    expect(user.platformRole).toBe("platform_owner");
    expect(membership).toMatchObject({
      role: "org_admin",
      status: "approved",
      programName: "Wavespark Admin",
    });
    expect(canViewAdminRoute(user, membership)).toBe(true);
  });

  it("authenticates the bootstrap admin with the built-in password provider", async () => {
    const user = await authorizePasswordUser({
      email: "letsbuild@wavesparks.co",
      password: "wavespark-admin-dev",
    });

    expect(user).toMatchObject({
      email: "letsbuild@wavesparks.co",
      platformRole: "platform_owner",
    });
  });

  it("creates managed accounts that can sign in with email and password", async () => {
    const { user, membership } = await createManagedAccount({
      orgId: seedOrganization.id,
      email: "new.member@example.com",
      name: "New Member",
      password: "temporary-password",
      role: "member",
      status: "approved",
    });

    const authenticated = await authorizePasswordUser({
      email: "new.member@example.com",
      password: "temporary-password",
    });

    expect(user.email).toBe("new.member@example.com");
    expect(membership).toMatchObject({ role: "member", status: "approved" });
    expect(authenticated?.id).toBe(user.id);
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

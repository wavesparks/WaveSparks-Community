import { beforeEach, describe, expect, it } from "vitest";

import { seedOrganization } from "@/data/seed-data";
import { mainCommunityRedirectForViewer } from "@/lib/access-routing";
import type { ViewerContext } from "@/lib/domain";
import {
  createManagedAccount,
  getMembershipById,
  getProfileByMembershipId,
  getUserById,
  resetStore,
} from "@/server/store";

async function viewerForMembership(membershipId: string): Promise<ViewerContext> {
  const membership = (await getMembershipById(membershipId))!;
  const user = (await getUserById(membership.userId))!;
  const profile = await getProfileByMembershipId(membership.id);

  return {
    org: seedOrganization,
    user,
    membership,
    profile,
    canAdmin: false,
    isApprovedMentor: membership.mentorStatus === "approved",
    canMentor: membership.mentorStatus === "approved",
    scopes: ["org:member"],
  };
}

describe("main community access routing", () => {
  beforeEach(() => {
    resetStore();
  });

  it("keeps anonymous public reading open", () => {
    expect(mainCommunityRedirectForViewer("wavesparks", null)).toBeUndefined();
  });

  it("sends pending and waitlist members to pending access", async () => {
    const pendingViewer = await viewerForMembership("mem_priya");
    const { membership } = await createManagedAccount({
      orgId: seedOrganization.id,
      email: "waitlist-routing@example.com",
      name: "Waitlist Routing",
      role: "member",
      status: "waitlist",
    });
    const waitlistViewer = await viewerForMembership(membership.id);

    expect(mainCommunityRedirectForViewer("wavesparks", pendingViewer)).toBe(
      "/org/wavesparks/pending",
    );
    expect(mainCommunityRedirectForViewer("wavesparks", waitlistViewer)).toBe(
      "/org/wavesparks/pending",
    );
  });

  it("sends approved members without onboarding to onboarding", async () => {
    const viewer = await viewerForMembership("mem_jules");

    expect(
      mainCommunityRedirectForViewer("wavesparks", {
        ...viewer,
        profile: viewer.profile
          ? { ...viewer.profile, onboardingComplete: false }
          : viewer.profile,
      }),
    ).toBe("/org/wavesparks/onboarding");
  });

  it("allows approved members with onboarding complete", async () => {
    await expect(
      mainCommunityRedirectForViewer(
        "wavesparks",
        await viewerForMembership("mem_jules"),
      ),
    ).toBeUndefined();
  });
});

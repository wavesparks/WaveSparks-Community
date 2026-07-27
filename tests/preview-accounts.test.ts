import { beforeEach, describe, expect, it } from "vitest";

import { canAccessFeed, canViewAdminRoute } from "@/server/permissions";
import {
  previewAccountSpecs,
  provisionPreviewAccounts,
} from "@/server/preview-accounts";
import {
  getProfileByMembershipId,
  getStore,
  resetStore,
} from "@/server/store";

describe("preview account provisioning", () => {
  beforeEach(() => {
    resetStore();
  });

  it("creates all four account-permission and mentor-designation combinations", async () => {
    const accounts = await provisionPreviewAccounts({
      reviewedByMembershipId: "mem_maya",
    });

    expect(accounts.map(({ spec }) => spec.kind).sort()).toEqual([
      "admin",
      "admin_mentor",
      "founder",
      "mentor",
    ]);
    expect(accounts).toHaveLength(4);
    expect(previewAccountSpecs).toHaveLength(4);

    for (const { spec, user, membership } of accounts) {
      expect(user.email).toBe(spec.email);

      const profile = await getProfileByMembershipId(membership.id);
      expect(profile?.onboardingComplete).toBe(true);
      expect(canAccessFeed(membership, profile)).toBe(true);

      if (spec.kind === "admin" || spec.kind === "admin_mentor") {
        expect(membership.role).toBe("org_admin");
        expect(canViewAdminRoute(user, membership)).toBe(true);
      } else {
        expect(membership.role).toBe("member");
        expect(canViewAdminRoute(user, membership)).toBe(false);
      }

      if (spec.kind === "mentor" || spec.kind === "admin_mentor") {
        expect(membership.mentorStatus).toBe("approved");
        expect(membership.mentorReviewedByMembershipId).toBe("mem_maya");
        expect(membership.archetypes).toContain("mentor");
      }

      if (spec.kind === "admin") {
        expect(membership.mentorStatus).toBe("not_mentor");
        expect(membership.archetypes).not.toContain("mentor");
      }

      if (spec.kind === "mentor") {
        expect(membership.affiliationType).toBe("mentor");
      }

      if (spec.kind === "founder") {
        expect(membership.mentorStatus).toBe("not_mentor");
        expect(membership.affiliationType).toBe("current participant");
        expect(membership.archetypes).toContain("founder");
      }
    }
  });

  it("rejects a reviewer outside the target organization before provisioning", async () => {
    await expect(
      provisionPreviewAccounts({
        orgId: "org_other",
        reviewedByMembershipId: "mem_maya",
      }),
    ).rejects.toThrow("organization administrator");

    expect(
      getStore().users.some((user) =>
        previewAccountSpecs.some((spec) => spec.email === user.email),
      ),
    ).toBe(false);
  });
});

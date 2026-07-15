import { beforeEach, describe, expect, it } from "vitest";

import { canAccessFeed, canViewAdminRoute } from "@/server/permissions";
import {
  previewAccountSpecs,
  provisionPreviewAccounts,
} from "@/server/preview-accounts";
import {
  getProfileByMembershipId,
  resetStore,
} from "@/server/store";

describe("preview account provisioning", () => {
  beforeEach(() => {
    resetStore();
  });

  it("creates admin, mentor, and founder preview memberships for Clerk users", async () => {
    const accounts = await provisionPreviewAccounts({});

    expect(accounts.map(({ spec }) => spec.kind).sort()).toEqual([
      "admin",
      "founder",
      "mentor",
    ]);
    expect(accounts).toHaveLength(3);
    expect(previewAccountSpecs).toHaveLength(3);

    for (const { spec, user, membership } of accounts) {
      expect(user.email).toBe(spec.email);

      const profile = await getProfileByMembershipId(membership.id);
      expect(profile?.onboardingComplete).toBe(true);
      expect(canAccessFeed(membership, profile)).toBe(true);

      if (spec.kind === "admin") {
        expect(membership.role).toBe("org_admin");
        expect(canViewAdminRoute(user, membership)).toBe(true);
      } else {
        expect(membership.role).toBe("member");
        expect(canViewAdminRoute(user, membership)).toBe(false);
      }

      if (spec.kind === "mentor") {
        expect(membership.affiliationType).toBe("mentor");
        expect(membership.archetypes).toContain("mentor");
      }

      if (spec.kind === "founder") {
        expect(membership.affiliationType).toBe("current participant");
        expect(membership.archetypes).toContain("founder");
      }
    }
  });
});

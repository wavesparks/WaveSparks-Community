import { beforeEach, describe, expect, it } from "vitest";

import { canAccessFeed, canViewAdminRoute } from "@/server/permissions";
import {
  previewAccountSpecs,
  provisionPreviewAccounts,
} from "@/server/preview-accounts";
import {
  authorizePasswordUser,
  getProfileByMembershipId,
  resetStore,
} from "@/server/store";

describe("preview account provisioning", () => {
  beforeEach(() => {
    resetStore();
  });

  it("creates password-backed admin, mentor, and founder preview accounts", async () => {
    const password = "preview-password-123";
    const accounts = await provisionPreviewAccounts({ password });

    expect(accounts.map(({ spec }) => spec.kind).sort()).toEqual([
      "admin",
      "founder",
      "mentor",
    ]);
    expect(accounts).toHaveLength(3);
    expect(previewAccountSpecs).toHaveLength(3);

    for (const { spec, user, membership } of accounts) {
      await expect(
        authorizePasswordUser({
          email: spec.email,
          password,
        }),
      ).resolves.toMatchObject({ id: user.id, email: spec.email });

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

import { beforeEach, describe, expect, it } from "vitest";

import { seedOrganization, seedMemberships, seedProfiles } from "@/data/seed-data";
import { computeMatchBreakdown, recomputeMatchesForProfiles } from "@/server/matching";
import { resetStore } from "@/server/store";

describe("matching engine", () => {
  beforeEach(() => {
    resetStore();
  });

  it("generates explainable matches while excluding non-approved members", () => {
    const matches = recomputeMatchesForProfiles(
      seedOrganization,
      seedMemberships,
      seedProfiles,
    );

    expect(matches.length).toBeGreaterThan(20);
    expect(matches.some((match) => match.targetProfileId === "pro_priya")).toBe(false);
    expect(matches.some((match) => match.targetProfileId === "pro_nora")).toBe(false);
  });

  it("can scope recomputation to one profile", () => {
    const scopedMatches = recomputeMatchesForProfiles(
      seedOrganization,
      seedMemberships,
      seedProfiles,
      { profileIds: ["pro_jules"], limit: null },
    );

    expect(scopedMatches.length).toBeGreaterThan(0);
    expect(
      scopedMatches.every(
        (match) =>
          match.sourceProfileId === "pro_jules" || match.targetProfileId === "pro_jules",
      ),
    ).toBe(true);
  });

  it("produces weighted breakdowns for cofounder matching", () => {
    const source = seedProfiles.find((profile) => profile.id === "pro_jules")!;
    const target = seedProfiles.find((profile) => profile.id === "pro_rhea")!;
    const breakdown = computeMatchBreakdown(source, target, "cofounder_match");

    expect(breakdown.role_complementarity).toBeGreaterThan(0);
    expect(breakdown.skill_complementarity).toBeGreaterThan(0);
    expect(breakdown.semantic_similarity).toBeGreaterThan(0);
  });
});

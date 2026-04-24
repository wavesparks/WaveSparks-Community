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

  it("produces weighted breakdowns for cofounder matching", () => {
    const source = seedProfiles.find((profile) => profile.id === "pro_jules")!;
    const target = seedProfiles.find((profile) => profile.id === "pro_rhea")!;
    const breakdown = computeMatchBreakdown(source, target, "cofounder_match");

    expect(breakdown.role_complementarity).toBeGreaterThan(0);
    expect(breakdown.skill_complementarity).toBeGreaterThan(0);
    expect(breakdown.semantic_similarity).toBeGreaterThan(0);
  });
});

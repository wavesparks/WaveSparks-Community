import { describe, expect, it } from "vitest";

import {
  matchTypeSlug,
  stableDefaultMatchTypeConfigs,
  validateMatchTypeConfig,
} from "@/lib/match-config";

describe("matching type configuration", () => {
  it("ships valid defaults whose factor weights total 100", () => {
    const configs = stableDefaultMatchTypeConfigs("org_test");

    expect(configs.map((config) => config.slug)).toEqual([
      "cofounder_match",
      "mentor_match",
      "collaborator_match",
    ]);
    for (const config of configs) {
      expect(Object.values(config.weights).reduce((sum, value) => sum + value, 0)).toBe(100);
      expect(validateMatchTypeConfig(config)).toEqual([]);
    }
  });

  it("supports non-Latin names in stable URL-safe slugs", () => {
    expect(matchTypeSlug("投资人 / Investor")).toBe("投资人_investor");
  });

  it("rejects invalid directions, thresholds, and weight totals", () => {
    const [config] = stableDefaultMatchTypeConfigs("org_test");
    const errors = validateMatchTypeConfig({
      ...config,
      direction: "sideways",
      minimumScore: 20,
      weights: { ...config.weights, semantic: 31 },
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        "Direction must be mutual or seeker-to-provider.",
        "Minimum score must be a whole number from 35 to 80.",
        "Factor weights must total 100.",
      ]),
    );
  });
});

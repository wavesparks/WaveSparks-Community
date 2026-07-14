import { beforeEach, describe, expect, it } from "vitest";

import {
  seedMatchTypeConfigs,
  seedMemberships,
  seedOrganization,
  seedPosts,
  seedProfiles,
} from "@/data/seed-data";
import type { MatchTypeConfig } from "@/lib/domain";
import {
  buildMatchingEmbeddingTexts,
  cosineSimilarity,
  computeMatchBreakdown,
  recomputeMatchesForProfiles,
} from "@/server/matching";
import { buildLocalEmbedding } from "@/server/embeddings";
import {
  getMatchFeedbackSummaryForOrg,
  getStore,
  recordMatchFeedback,
  recomputeMatchesForOrg,
  resetStore,
} from "@/server/store";

describe("matching engine", () => {
  beforeEach(() => {
    resetStore();
  });

  it("generates explainable matches while excluding non-approved members", () => {
    const matches = recomputeMatchesForProfiles(
      seedOrganization,
      seedMemberships,
      seedProfiles,
      seedMatchTypeConfigs,
    );

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((match) => match.targetProfileId === "pro_priya")).toBe(false);
    expect(matches.some((match) => match.targetProfileId === "pro_nora")).toBe(false);

    const profiles = new Map(seedProfiles.map((profile) => [profile.id, profile]));
    const configs = new Map(seedMatchTypeConfigs.map((config) => [config.slug, config]));
    for (const match of matches) {
      const source = profiles.get(match.sourceProfileId)!;
      const target = profiles.get(match.targetProfileId)!;
      const config = configs.get(match.matchType)!;
      expect(source.seekingMatchTypes).toContain(config.slug);
      expect(target.offeringMatchTypes).toContain(config.slug);
      if (config.direction === "mutual") {
        expect(source.offeringMatchTypes).toContain(config.slug);
        expect(target.seekingMatchTypes).toContain(config.slug);
      }
      expect(Object.keys(match.scoreBreakdown)).toEqual([
        "semantic",
        "skills",
        "venture",
        "availability",
        "work_style",
        "location",
      ]);
      expect(match.algorithmVersion).toBe("hybrid-v2");
    }
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

  it("produces weighted, explainable factor scores", () => {
    const source = seedProfiles.find((profile) => profile.id === "pro_jules")!;
    const target = seedProfiles.find((profile) => profile.id === "pro_rhea")!;
    const breakdown = computeMatchBreakdown(source, target, "cofounder_match");

    expect(breakdown.skills).toBeGreaterThan(0);
    expect(breakdown.semantic).toBeGreaterThan(0);
    expect(Object.values(breakdown).reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(
      100,
    );
  });

  it("does not give unrelated fallback text an inflated semantic score", () => {
    const left = buildLocalEmbedding("quantum optics satellite calibration");
    const right = buildLocalEmbedding("restaurant payroll tax compliance");

    expect(cosineSimilarity(left, right)).toBeLessThan(0.2);
  });

  it("supports an admin-defined seeker-to-provider match type", () => {
    const source = seedProfiles.find((profile) => profile.id === "pro_jules")!;
    const target = seedProfiles.find((profile) => profile.id === "pro_rhea")!;
    const customConfig: MatchTypeConfig = {
      ...seedMatchTypeConfigs[1],
      id: "mtc_org_wavespark_investor_match",
      slug: "investor_match",
      name: "Investor",
      direction: "seeker_provider",
      seekerLabel: "I am looking for an investor",
      providerLabel: "I can invest",
      minimumScore: 35,
      weights: {
        semantic: 100,
        skills: 0,
        venture: 0,
        availability: 0,
        work_style: 0,
        location: 0,
      },
    };
    const profiles = seedProfiles.map((profile) => {
      if (profile.id === source.id) {
        return {
          ...profile,
          seekingMatchTypes: [customConfig.slug],
          offeringMatchTypes: [],
          seekingEmbedding: target.offeringEmbedding,
        };
      }
      if (profile.id === target.id) {
        return {
          ...profile,
          seekingMatchTypes: [],
          offeringMatchTypes: [customConfig.slug],
        };
      }
      return { ...profile, seekingMatchTypes: [], offeringMatchTypes: [] };
    });

    const matches = recomputeMatchesForProfiles(
      seedOrganization,
      seedMemberships,
      profiles,
      [customConfig],
      { limit: null },
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      sourceProfileId: source.id,
      targetProfileId: target.id,
      matchType: customConfig.slug,
      score: 100,
    });
  });

  it("uses at most five active intent posts from the last 90 days", () => {
    const source = seedProfiles.find((profile) => profile.id === "pro_jules")!;
    const basePost = seedPosts[0];
    const now = new Date("2026-07-14T00:00:00.000Z");
    const recentPosts = Array.from({ length: 6 }, (_, index) => ({
      ...basePost,
      id: `post_recent_${index}`,
      type: "ask" as const,
      title: `Recent intent ${index}`,
      createdAt: new Date(now.getTime() - index * 24 * 60 * 60 * 1000).toISOString(),
      status: "active" as const,
      hidden: false,
    }));
    const excludedPosts = [
      {
        ...basePost,
        id: "post_old",
        type: "ask" as const,
        title: "Old intent",
        createdAt: "2026-03-01T00:00:00.000Z",
        status: "active" as const,
        hidden: false,
      },
      {
        ...basePost,
        id: "post_discussion",
        type: "general_update" as const,
        title: "Discussion signal",
        createdAt: now.toISOString(),
        status: "active" as const,
        hidden: false,
      },
      {
        ...basePost,
        id: "post_hidden",
        type: "ask" as const,
        title: "Hidden intent",
        createdAt: now.toISOString(),
        status: "active" as const,
        hidden: true,
      },
    ];

    const result = buildMatchingEmbeddingTexts(
      source,
      [...recentPosts, ...excludedPosts],
      now,
    );

    expect(result.recentIntentText).toContain("Recent intent 0");
    expect(result.recentIntentText).toContain("Recent intent 4");
    expect(result.recentIntentText).not.toContain("Recent intent 5");
    expect(result.recentIntentText).not.toContain("Old intent");
    expect(result.recentIntentText).not.toContain("Discussion signal");
    expect(result.recentIntentText).not.toContain("Hidden intent");
  });

  it("preserves private dismissal feedback when a match disappears and returns", async () => {
    const store = getStore();
    const originalMatch = store.matches[0]!;
    const source = store.profiles.find(
      (profile) => profile.id === originalMatch.sourceProfileId,
    )!;
    const originalSeekingTypes = [...source.seekingMatchTypes];

    const feedback = await recordMatchFeedback({
      orgId: originalMatch.orgId,
      matchId: originalMatch.id,
      sourceProfileId: originalMatch.sourceProfileId,
      value: "not_relevant",
      reasons: ["wrong_intent", "not_allowed"],
    });
    expect(feedback).toMatchObject({
      matchType: originalMatch.matchType,
      algorithmVersion: originalMatch.algorithmVersion,
      score: originalMatch.score,
      reasons: ["wrong_intent"],
    });

    source.seekingMatchTypes = source.seekingMatchTypes.filter(
      (matchType) => matchType !== originalMatch.matchType,
    );
    await recomputeMatchesForOrg(originalMatch.orgId);
    expect(getStore().matches.some((match) => match.id === originalMatch.id)).toBe(false);

    source.seekingMatchTypes = originalSeekingTypes;
    await recomputeMatchesForOrg(originalMatch.orgId);
    expect(getStore().matches.find((match) => match.id === originalMatch.id)).toMatchObject({
      dismissedBySource: true,
    });

    const summary = await getMatchFeedbackSummaryForOrg(originalMatch.orgId);
    expect(summary).toMatchObject({ total: 1, helpful: 0, notRelevant: 1 });
    expect(summary.reasons).toContainEqual({ reason: "wrong_intent", count: 1 });

    await recordMatchFeedback({
      orgId: originalMatch.orgId,
      matchId: originalMatch.id,
      sourceProfileId: originalMatch.sourceProfileId,
      value: "helpful",
      reasons: [],
    });
    expect(getStore().matches.find((match) => match.id === originalMatch.id)).toMatchObject({
      dismissedBySource: false,
    });
    await expect(getMatchFeedbackSummaryForOrg(originalMatch.orgId)).resolves.toMatchObject({
      total: 1,
      helpful: 1,
      notRelevant: 0,
      reasons: [],
    });
  });
});

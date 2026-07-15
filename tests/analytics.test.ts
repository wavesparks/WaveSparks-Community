import { describe, expect, it } from "vitest";

import {
  seedAnalyticsEvents,
  seedComments,
  seedIntroRequests,
  seedMemberships,
  seedPosts,
  seedProfiles,
} from "@/data/seed-data";
import { buildDailySeriesFromCounts, buildOrgAnalyticsSnapshot } from "@/server/analytics";

function totalSeriesField(
  snapshot: ReturnType<typeof buildOrgAnalyticsSnapshot>,
  field: keyof ReturnType<typeof buildOrgAnalyticsSnapshot>["dailySeries"][number],
) {
  return snapshot.dailySeries.reduce((total, entry) => {
    const value = entry[field];
    return total + (typeof value === "number" ? value : 0);
  }, 0);
}

describe("organization analytics", () => {
  it("aggregates daily activity into the visible 30 day series", () => {
    const snapshot = buildOrgAnalyticsSnapshot({
      memberships: seedMemberships.map((membership) => ({ status: membership.status })),
      profiles: seedProfiles.map((profile) => ({
        onboardingComplete: profile.onboardingComplete,
      })),
      posts: seedPosts.map((post) => ({
        authorMembershipId: post.authorMembershipId,
        createdAt: post.createdAt,
      })),
      comments: seedComments.map((comment) => ({ createdAt: comment.createdAt })),
      introRequests: seedIntroRequests.map((intro) => ({
        createdAt: intro.createdAt,
        introPurpose: intro.introPurpose,
        respondedAt: intro.respondedAt,
        status: intro.status,
      })),
      analyticsEvents: seedAnalyticsEvents.map((event) => ({ eventName: event.eventName })),
    });
    const visibleDates = new Set(snapshot.dailySeries.map((entry) => entry.date));

    expect(totalSeriesField(snapshot, "posts")).toBe(
      seedPosts.filter((post) => visibleDates.has(post.createdAt.slice(0, 10))).length,
    );
    expect(totalSeriesField(snapshot, "comments")).toBe(
      seedComments.filter((comment) => visibleDates.has(comment.createdAt.slice(0, 10))).length,
    );
    expect(totalSeriesField(snapshot, "introRequests")).toBe(
      seedIntroRequests.filter((intro) => visibleDates.has(intro.createdAt.slice(0, 10))).length,
    );
    expect(totalSeriesField(snapshot, "acceptedIntros")).toBe(
      seedIntroRequests.filter(
        (intro) =>
          intro.status === "accepted" &&
          Boolean(intro.respondedAt && visibleDates.has(intro.respondedAt.slice(0, 10))),
      ).length,
    );
    expect(snapshot.dailySeries).toHaveLength(30);
  });

  it("builds the same daily series from pre-aggregated counts", () => {
    const snapshot = buildOrgAnalyticsSnapshot({
      memberships: [],
      profiles: [],
      posts: seedPosts.map((post) => ({
        authorMembershipId: post.authorMembershipId,
        createdAt: post.createdAt,
      })),
      comments: seedComments.map((comment) => ({ createdAt: comment.createdAt })),
      introRequests: seedIntroRequests.map((intro) => ({
        createdAt: intro.createdAt,
        introPurpose: intro.introPurpose,
        respondedAt: intro.respondedAt,
        status: intro.status,
      })),
      analyticsEvents: [],
    });
    const countByDate = <T extends { createdAt?: string; respondedAt?: string }>(
      items: T[],
      getDate: (item: T) => string | undefined,
    ) =>
      items.reduce((counts, item) => {
        const date = getDate(item)?.slice(0, 10);
        if (date) {
          counts.set(date, (counts.get(date) ?? 0) + 1);
        }
        return counts;
      }, new Map<string, number>());

    const series = buildDailySeriesFromCounts({
      posts: countByDate(seedPosts, (post) => post.createdAt),
      comments: countByDate(seedComments, (comment) => comment.createdAt),
      introRequests: countByDate(seedIntroRequests, (intro) => intro.createdAt),
      acceptedIntros: countByDate(
        seedIntroRequests.filter((intro) => intro.status === "accepted"),
        (intro) => intro.respondedAt,
      ),
    });

    expect(series).toEqual(snapshot.dailySeries);
  });
});

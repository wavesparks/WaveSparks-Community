import type {
  AnalyticsEvent,
  Comment,
  IntroRequest,
  Membership,
  OrgAnalyticsSnapshot,
  Post,
  Profile,
} from "@/lib/domain";

type AnalyticsMembershipInput = Pick<Membership, "status">;
type AnalyticsProfileInput = Pick<Profile, "onboardingComplete">;
type AnalyticsPostInput = Pick<Post, "authorMembershipId" | "createdAt">;
type AnalyticsCommentInput = Pick<Comment, "createdAt">;
type AnalyticsIntroRequestInput = Pick<
  IntroRequest,
  "createdAt" | "introPurpose" | "kind" | "respondedAt" | "status"
>;
type AnalyticsEventInput = Pick<AnalyticsEvent, "eventName">;

export interface OrgAnalyticsInput {
  memberships: AnalyticsMembershipInput[];
  profiles: AnalyticsProfileInput[];
  posts: AnalyticsPostInput[];
  comments: AnalyticsCommentInput[];
  introRequests: AnalyticsIntroRequestInput[];
  analyticsEvents: AnalyticsEventInput[];
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function dateKey(isoString?: string) {
  return isoString?.slice(0, 10);
}

function countByDate<T>(items: T[], getDate: (item: T) => string | undefined) {
  return items.reduce((counts, item) => {
    const key = dateKey(getDate(item));
    if (!key) {
      return counts;
    }

    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

export interface DailySeriesCountMaps {
  posts: Map<string, number>;
  comments: Map<string, number>;
  introRequests: Map<string, number>;
  acceptedIntros: Map<string, number>;
}

export function buildDailySeriesFromCounts(
  counts: DailySeriesCountMaps,
  referenceDate = new Date(),
): OrgAnalyticsSnapshot["dailySeries"] {
  const today = startOfDay(referenceDate);

  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (29 - index));
    const iso = date.toISOString().slice(0, 10);

    return {
      date: iso,
      posts: counts.posts.get(iso) ?? 0,
      comments: counts.comments.get(iso) ?? 0,
      introRequests: counts.introRequests.get(iso) ?? 0,
      acceptedIntros: counts.acceptedIntros.get(iso) ?? 0,
    };
  });
}

export function dailySeriesStartDate(referenceDate = new Date()) {
  const start = startOfDay(referenceDate);
  start.setDate(start.getDate() - 29);
  return start;
}

export function buildOrgAnalyticsSnapshot(input: OrgAnalyticsInput): OrgAnalyticsSnapshot {
  const postCountsByDate = countByDate(input.posts, (post) => post.createdAt);
  const commentCountsByDate = countByDate(input.comments, (comment) => comment.createdAt);
  const introCountsByDate = countByDate(input.introRequests, (intro) => intro.createdAt);
  const acceptedIntroCountsByDate = countByDate(
    input.introRequests.filter((intro) => intro.status === "accepted"),
    (intro) => intro.respondedAt,
  );
  const series = buildDailySeriesFromCounts({
    posts: postCountsByDate,
    comments: commentCountsByDate,
    introRequests: introCountsByDate,
    acceptedIntros: acceptedIntroCountsByDate,
  });

  return {
    approvedMembers: input.memberships.filter((membership) => membership.status === "approved")
      .length,
    completedProfiles: input.profiles.filter((profile) => profile.onboardingComplete).length,
    activeWeeklyPosters: new Set(
      input.posts
        .filter(
          (post) =>
            new Date(post.createdAt).getTime() >
            Date.now() - 1000 * 60 * 60 * 24 * 7,
        )
        .map((post) => post.authorMembershipId),
    ).size,
    introRequestsSent: input.introRequests.length,
    introRequestsAccepted: input.introRequests.filter((intro) => intro.status === "accepted")
      .length,
    cofounderMatchesAccepted: input.introRequests.filter(
      (intro) =>
        intro.status === "accepted" && intro.introPurpose === "co-founder conversation",
    ).length,
    mentorMatchesAccepted: input.introRequests.filter(
      (intro) => intro.status === "accepted" && intro.kind === "mentoring",
    ).length,
    teamsFormed: input.analyticsEvents.filter((event) => event.eventName === "team_formed")
      .length,
    startupsLaunched: input.analyticsEvents.filter(
      (event) => event.eventName === "startup_launched",
    ).length,
    dailySeries: series,
  };
}

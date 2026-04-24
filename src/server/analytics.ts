import type {
  AnalyticsEvent,
  Comment,
  IntroRequest,
  MatchRecord,
  Membership,
  OrgAnalyticsSnapshot,
  Post,
  Profile,
} from "@/lib/domain";

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function buildOrgAnalyticsSnapshot(input: {
  memberships: Membership[];
  profiles: Profile[];
  posts: Post[];
  comments: Comment[];
  introRequests: IntroRequest[];
  matches: MatchRecord[];
  analyticsEvents: AnalyticsEvent[];
}): OrgAnalyticsSnapshot {
  const today = startOfDay(new Date());
  const series = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (29 - index));
    const iso = date.toISOString().slice(0, 10);

    const posts = input.posts.filter((post) => post.createdAt.slice(0, 10) === iso).length;
    const comments = input.comments.filter(
      (comment) => comment.createdAt.slice(0, 10) === iso,
    ).length;
    const introRequests = input.introRequests.filter(
      (intro) => intro.createdAt.slice(0, 10) === iso,
    ).length;
    const acceptedIntros = input.introRequests.filter(
      (intro) => intro.respondedAt?.slice(0, 10) === iso && intro.status === "accepted",
    ).length;

    return {
      date: iso,
      posts,
      comments,
      introRequests,
      acceptedIntros,
    };
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
      (intro) => intro.status === "accepted" && intro.introPurpose === "mentor guidance",
    ).length,
    teamsFormed: input.analyticsEvents.filter((event) => event.eventName === "team_formed")
      .length,
    startupsLaunched: input.analyticsEvents.filter(
      (event) => event.eventName === "startup_launched",
    ).length,
    dailySeries: series,
  };
}

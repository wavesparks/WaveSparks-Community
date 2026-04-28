import {
  canViewContactDetails,
  getProfileVisibilityForMember,
} from "@/server/permissions";
import {
  getMembershipById,
  getProfileByMembershipId,
  getProfileById,
  isFollowingMembership,
  listCommentsForPost,
  listFollowsForMembership,
  listIntroRequestsForMembership,
  listMatchesForMembership,
  listNotificationsForMembership,
  listPostsForOrg,
  listProfilesForOrg,
  listProfileLinks,
} from "@/server/store";
import type {
  FeedPostView,
  FullAdminProfile,
  IntroRequestView,
  LimitedProfileCard,
  MatchCardView,
  Membership,
  NotificationView,
  OpportunitySource,
  Organization,
  Post,
  PostType,
  Profile,
  ProfileLink,
} from "@/lib/domain";

const opportunityTypes: PostType[] = [
  "opportunity",
  "looking_for_cofounder",
  "looking_for_mentor",
];

export interface FeedFilters {
  q?: string;
  postType?: PostType | "all";
  tag?: string;
  authorAffiliation?: string;
  authorStage?: string;
  authorIndustry?: string;
  roleNeeded?: string;
  opportunitySource?: OpportunitySource | "all";
  recommendedOnly?: boolean;
}

export interface FeedViewOptions {
  viewerMembershipId?: string;
  filters?: FeedFilters;
  onlyOpportunities?: boolean;
}

interface FeedEntry {
  view: FeedPostView;
  membership: Membership;
  profile: Profile;
  post: Post;
}

function normalized(value?: string) {
  return value?.toLowerCase().trim() ?? "";
}

function includesNormalized(values: string[], candidate?: string) {
  const needle = normalized(candidate);
  if (!needle) {
    return true;
  }

  return values.some((value) => value.toLowerCase().includes(needle));
}

async function matchedMembershipIdsForViewer(viewerMembershipId?: string) {
  if (!viewerMembershipId) {
    return new Set<string>();
  }

  const matches = await listMatchesForMembership(viewerMembershipId);
  const targetMembershipIds = await Promise.all(
    matches.map(async (match) => (await getProfileById(match.targetProfileId))?.membershipId),
  );

  return new Set(
    targetMembershipIds.filter((membershipId): membershipId is string => Boolean(membershipId)),
  );
}

async function followedMembershipIdsForViewer(viewerMembershipId?: string) {
  if (!viewerMembershipId) {
    return new Set<string>();
  }

  return new Set(
    (await listFollowsForMembership(viewerMembershipId)).map(
      (follow) => follow.followedMembershipId,
    ),
  );
}

function displayName(profile: Profile) {
  if (profile.displayNamePreference === "first_name_last_initial") {
    const [firstName, lastName] = profile.fullName.split(" ");
    return `${firstName} ${lastName?.charAt(0) ?? ""}.`.trim();
  }

  return profile.preferredName || profile.fullName;
}

export function toLimitedProfileCard(profile: Profile, membership: Membership): LimitedProfileCard {
  return {
    membershipId: membership.id,
    profileId: profile.id,
    displayName: displayName(profile),
    photo: profile.profilePhoto,
    headline: profile.headline,
    currentStatus: profile.currentStatus,
    whatTheyAreBuilding: profile.startupOneLiner,
    whatTheyNeed: profile.lookingForTypes,
    keyTags: [...profile.industryTags, ...profile.skillTags].slice(0, 5),
    affiliationLabel: membership.affiliationType,
    location: [profile.city, profile.country].filter(Boolean).join(", "),
  };
}

export function toFullAdminProfile(profile: Profile, membership: Membership): FullAdminProfile {
  return {
    ...toLimitedProfileCard(profile, membership),
    ...getProfileVisibilityForMember(profile, membership),
    emailForIntro: profile.emailForIntro,
    whatsappNumber: profile.whatsappNumber,
    longBio: profile.longBio,
    startupDescription: profile.startupDescription,
    desiredRoles: profile.desiredRoles,
    mentorOffers: profile.mentorOffers,
    featured: profile.featured,
    stale: profile.stale,
  };
}

export async function getFeedViewsForOrg(org: Organization, options: FeedViewOptions = {}) {
  const filters = options.filters ?? {};
  const normalizedQuery = normalized(filters.q);
  const followedIds = await followedMembershipIdsForViewer(options.viewerMembershipId);
  const matchedIds = await matchedMembershipIdsForViewer(options.viewerMembershipId);

  const entries = await Promise.all(
    (await listPostsForOrg(org.id))
    .filter((post) => !post.hidden)
    .filter((post) =>
      options.onlyOpportunities
        ? opportunityTypes.includes(post.type)
        : true,
    )
    .map(async (post) => {
      const membership = await getMembershipById(post.authorMembershipId);
      const profile = membership ? await getProfileByMembershipId(membership.id) : undefined;

      if (!membership || !profile) {
        return null;
      }

      const recommendationReasons: FeedPostView["recommendationReasons"] = [];
      if (followedIds.has(membership.id)) {
        recommendationReasons.push("Followed");
      }
      if (matchedIds.has(membership.id)) {
        recommendationReasons.push("Matched");
      }

      const view: FeedPostView = {
        id: post.id,
        type: post.type,
        opportunitySource: post.opportunitySource,
        title: post.title,
        body: post.body,
        tags: post.tags,
        relatedRolesNeeded: post.relatedRolesNeeded,
        status: post.status,
        featured: post.featured,
        createdAt: post.createdAt,
        author: toLimitedProfileCard(profile, membership),
        commentCount: (await listCommentsForPost(post.id)).length,
        isFollowingAuthor: options.viewerMembershipId
          ? await isFollowingMembership(options.viewerMembershipId, membership.id)
          : false,
        isRecommended: recommendationReasons.length > 0,
        recommendationReasons,
      };

      return { view, membership, profile, post };
    }),
  );

  return entries
    .filter((entry): entry is FeedEntry => Boolean(entry))
    .filter(({ view, membership, profile, post }) => {
      if (filters.recommendedOnly && !view.isRecommended) {
        return false;
      }

      if (filters.postType && filters.postType !== "all" && post.type !== filters.postType) {
        return false;
      }

      if (
        filters.opportunitySource &&
        filters.opportunitySource !== "all" &&
        post.opportunitySource !== filters.opportunitySource
      ) {
        return false;
      }

      if (
        filters.authorAffiliation &&
        membership.affiliationType !== filters.authorAffiliation
      ) {
        return false;
      }

      if (filters.authorStage && profile.stage !== filters.authorStage) {
        return false;
      }

      if (!includesNormalized(profile.industryTags, filters.authorIndustry)) {
        return false;
      }

      if (!includesNormalized(post.relatedRolesNeeded, filters.roleNeeded)) {
        return false;
      }

      if (!includesNormalized(post.tags, filters.tag)) {
        return false;
      }

      if (normalizedQuery) {
        const haystack = [
          post.title,
          post.body,
          post.tags.join(" "),
          post.relatedRolesNeeded.join(" "),
          profile.preferredName,
          profile.headline,
          profile.industryTags.join(" "),
          membership.affiliationType,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedQuery);
      }

      return true;
    })
    .map((entry) => entry.view);
}

export async function getMatchViews(membershipId: string, matchRecords: Array<{
  id: string;
  matchType: MatchCardView["matchType"];
  score: number;
  scoreBand: MatchCardView["scoreBand"];
  explanationText: string;
  overlapTags: string[];
  targetProfileId: string;
}>) {
  const sourceMembership = await getMembershipById(membershipId);
  const orgProfiles = sourceMembership ? await listProfilesForOrg(sourceMembership.orgId) : [];
  const views = await Promise.all(
    matchRecords.map(async (match) => {
      const profile = orgProfiles.find(
        (candidate) => candidate.id === match.targetProfileId,
      );
      if (!profile) {
        return null;
      }
      const membership = await getMembershipById(profile.membershipId);
      if (!membership) {
        return null;
      }

      return {
        id: match.id,
        matchType: match.matchType,
        score: match.score,
        scoreBand: match.scoreBand,
        explanationText: match.explanationText,
        overlapTags: match.overlapTags,
        target: toLimitedProfileCard(profile, membership),
      } satisfies MatchCardView;
    }),
  );

  return views.filter(Boolean) as MatchCardView[];
}

export async function getIntroRequestViews(membershipId: string) {
  return Promise.all((await listIntroRequestsForMembership(membershipId)).map(async (request) => {
    const isIncoming = request.receiverMembershipId === membershipId;
    const otherMembership = await getMembershipById(
      isIncoming ? request.requesterMembershipId : request.receiverMembershipId,
    );
    const otherProfile = otherMembership
      ? await getProfileByMembershipId(otherMembership.id)
      : undefined;

    if (!otherMembership || !otherProfile) {
      throw new Error("Intro request references a missing member.");
    }

    return {
      id: request.id,
      status: request.status,
      introPurpose: request.introPurpose,
      note: request.note,
      sourceType: request.sourceType,
      createdAt: request.createdAt,
      respondedAt: request.respondedAt,
      contactDetails: canViewContactDetails(membershipId, request)
        ? {
            email: otherProfile.emailForIntro,
            whatsapp: otherProfile.whatsappNumber,
          }
        : undefined,
      otherParty: toLimitedProfileCard(otherProfile, otherMembership),
      isIncoming,
      suggestedFirstMessage: request.suggestedFirstMessage,
    } satisfies IntroRequestView;
  }));
}

export async function getNotificationViews(membershipId: string) {
  return (await listNotificationsForMembership(membershipId)).map(
    (notification) =>
      ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        createdAt: notification.createdAt,
        link: notification.link,
        readAt: notification.readAt,
      }) satisfies NotificationView,
  );
}

export async function getProfileLinks(profileId: string): Promise<ProfileLink[]> {
  return listProfileLinks(profileId);
}

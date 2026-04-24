import {
  canViewContactDetails,
  getProfileVisibilityForMember,
} from "@/server/permissions";
import {
  getMembershipById,
  getProfileByMembershipId,
  listCommentsForPost,
  listIntroRequestsForMembership,
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
  Organization,
  Profile,
  ProfileLink,
} from "@/lib/domain";

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

export function getFeedViewsForOrg(org: Organization, search?: string, onlyOpportunities = false) {
  const normalizedQuery = search?.toLowerCase().trim();
  return listPostsForOrg(org.id)
    .filter((post) => !post.hidden)
    .filter((post) =>
      onlyOpportunities
        ? ["opportunity", "looking_for_cofounder", "looking_for_mentor"].includes(post.type)
        : true,
    )
    .filter((post) => {
      if (!normalizedQuery) {
        return true;
      }

      const haystack = `${post.title} ${post.body} ${post.tags.join(" ")}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .map((post) => {
      const membership = getMembershipById(post.authorMembershipId);
      const profile = membership ? getProfileByMembershipId(membership.id) : undefined;

      if (!membership || !profile) {
        return null;
      }

      return {
        id: post.id,
        type: post.type,
        title: post.title,
        body: post.body,
        tags: post.tags,
        status: post.status,
        featured: post.featured,
        createdAt: post.createdAt,
        author: toLimitedProfileCard(profile, membership),
        commentCount: listCommentsForPost(post.id).length,
      } satisfies FeedPostView;
    })
    .filter(Boolean) as FeedPostView[];
}

export function getMatchViews(membershipId: string, matchRecords: Array<{
  id: string;
  matchType: MatchCardView["matchType"];
  score: number;
  scoreBand: MatchCardView["scoreBand"];
  explanationText: string;
  overlapTags: string[];
  targetProfileId: string;
}>) {
  return matchRecords
    .map((match) => {
      const profile = listProfilesForOrg("org_wavespark").find(
        (candidate) => candidate.id === match.targetProfileId,
      );
      if (!profile) {
        return null;
      }
      const membership = getMembershipById(profile.membershipId);
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
    })
    .filter(Boolean) as MatchCardView[];
}

export function getIntroRequestViews(membershipId: string) {
  return listIntroRequestsForMembership(membershipId).map((request) => {
    const isIncoming = request.receiverMembershipId === membershipId;
    const otherMembership = getMembershipById(
      isIncoming ? request.requesterMembershipId : request.receiverMembershipId,
    );
    const otherProfile = otherMembership
      ? getProfileByMembershipId(otherMembership.id)
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
  });
}

export function getNotificationViews(membershipId: string) {
  return listNotificationsForMembership(membershipId).map(
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

export function getProfileLinks(profileId: string): ProfileLink[] {
  return listProfileLinks(profileId);
}

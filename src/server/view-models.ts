import {
  canViewContactDetails,
  getProfileVisibilityForMember,
} from "@/server/permissions";
import { getProfileReadiness } from "@/lib/activation";
import {
  getMembershipById,
  getMemberActivationSignals,
  getPostThreadRecord,
  listCommentRecordsForOrg,
  listActiveIntroRequestStatusesForRequester,
  listFollowedMembershipIdsForMembership,
  listIntroRequestsForOrg,
  listIntroRequestsForMembership,
  listMembershipRecordsForOrg,
  listMembershipUserRecordsByIds,
  listMembershipProfileRecordsForOrg,
  listMembershipProfileRecordsByIds,
  listMatchTargetRecordsForProfile,
  listMatchTypeConfigsForOrg,
  listNotificationsForMembership,
  listPostsForOrg,
  listPublicFeedPostRecordsForOrg,
  listProfileMembershipRecordsByIds,
  listProfileLinks,
  listProfileLinksByProfileIds,
  listSavedPostIdsForMembership,
  listVisibleCommentCountsForOrg,
  listVisibleMatchTargetMembershipIdsForMembership,
  listVisibleMatchTargetMembershipIdsForProfile,
} from "@/server/store";
import type { MembershipRecord, PostThreadRecord } from "@/server/store";
import type {
  FeedPostView,
  FullAdminProfile,
  IntroRequestView,
  IntroStatus,
  KnowledgePostView,
  Comment,
  LimitedProfileCard,
  MatchCardView,
  MemberDirectoryFilters,
  MemberDirectoryProfileView,
  MemberActivationState,
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

export type KnowledgeMode = "all" | "saved";

export interface FeedViewOptions {
  viewerMembershipId?: string;
  viewerProfileId?: string;
  filters?: FeedFilters;
  onlyOpportunities?: boolean;
  includeMatchedRecommendationSignals?: boolean;
  limit?: number;
}

export interface MemberDirectoryViewOptions {
  viewerMembershipId: string;
  filters?: MemberDirectoryFilters;
  limit?: number;
}

export interface KnowledgeViewOptions {
  viewerMembershipId: string;
  viewerProfileId?: string;
  mode?: KnowledgeMode;
  q?: string;
  limit?: number;
}

export interface AdminIntroRequestDashboardOptions {
  requestLimit?: number;
  candidateLimit?: number;
  requestStatus?: IntroStatus;
  sourceType?: "match" | "post" | "profile" | "admin_manual";
}

export interface AdminManualIntroCandidateView {
  membershipId: string;
  name: string;
}

export interface AdminIntroRequestRowView {
  id: string;
  status: IntroStatus;
  introPurpose: string;
  note: string;
  requesterName: string;
  receiverName: string;
}

export interface AdminIntroRequestDashboardView {
  manualIntroCandidates: AdminManualIntroCandidateView[];
  requests: AdminIntroRequestRowView[];
}

export interface AdminPostModerationDashboardOptions {
  postLimit?: number;
  commentLimit?: number;
}

export interface AdminPostModerationPostView {
  id: string;
  title: string;
  body: string;
  type: PostType;
  featured: boolean;
  hidden: boolean;
  commentsLocked: boolean;
  status: Post["status"];
  authorName: string;
}

export interface AdminCommentModerationRowView {
  id: string;
  body: string;
  status: Comment["status"];
  postId?: string;
  postTitle: string;
  authorName: string;
}

export interface AdminPostModerationDashboardView {
  posts: AdminPostModerationPostView[];
  comments: AdminCommentModerationRowView[];
}

export interface PostThreadIntroContext {
  thread?: PostThreadRecord;
  existingIntroStatus?: IntroStatus;
  isPostSaved: boolean;
}

export interface IntroRequestViewOptions {
  limit?: number;
  direction?: "incoming" | "outgoing";
  status?: IntroStatus;
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

function matchesNormalized(value: string | undefined, candidate?: string) {
  const needle = normalized(candidate);
  if (!needle) {
    return true;
  }

  return normalized(value).includes(needle);
}

function hasNonPostListFilters(filters: FeedFilters, normalizedQuery: string) {
  return Boolean(
    normalizedQuery ||
      filters.tag ||
      filters.authorAffiliation ||
      filters.authorStage ||
      filters.authorIndustry ||
      filters.roleNeeded ||
      filters.recommendedOnly,
  );
}

function typesForPostList(filters: FeedFilters, onlyOpportunities?: boolean) {
  if (filters.postType && filters.postType !== "all") {
    if (onlyOpportunities && !opportunityTypes.includes(filters.postType)) {
      return [];
    }

    return [filters.postType];
  }

  return onlyOpportunities ? opportunityTypes : undefined;
}

function opportunitySourcesForPostList(filters: FeedFilters) {
  return filters.opportunitySource && filters.opportunitySource !== "all"
    ? [filters.opportunitySource]
    : undefined;
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

function feedEntryMatchesFilters(
  { view, membership, profile, post }: FeedEntry,
  filters: FeedFilters,
  normalizedQuery: string,
) {
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
}

function toMemberDirectoryProfileView(input: {
  profile: Profile;
  membership: Membership;
  profileLinks: ProfileLink[];
  following: boolean;
  introStatus?: IntroStatus;
}): MemberDirectoryProfileView {
  return {
    ...toLimitedProfileCard(input.profile, input.membership),
    stage: input.profile.stage,
    startupName: input.profile.startupName,
    startupDescription: input.profile.startupDescription,
    currentProgress: input.profile.currentProgress,
    tractionSummary: input.profile.tractionSummary,
    industryTags: input.profile.industryTags,
    problemSpaceTags: input.profile.problemSpaceTags,
    skillTags: input.profile.skillTags,
    desiredRoles: input.profile.desiredRoles,
    mentorOffers: input.profile.mentorOffers,
    profileLinks: input.profileLinks,
    isFollowing: input.following,
    ...(input.introStatus ? { introStatus: input.introStatus } : {}),
  };
}

function directoryProfileMatchesFilters(
  profile: Profile,
  membership: Membership,
  filters: MemberDirectoryFilters,
) {
  if (filters.affiliation && membership.affiliationType !== filters.affiliation) {
    return false;
  }

  if (filters.stage && profile.stage !== filters.stage) {
    return false;
  }

  if (!includesNormalized(profile.industryTags, filters.industry)) {
    return false;
  }

  if (
    !includesNormalized(
      [
        ...profile.lookingForTypes,
        ...profile.desiredRoles,
        ...profile.helpNeededTags,
        ...profile.mentorOffers,
      ],
      filters.need,
    )
  ) {
    return false;
  }

  if (!includesNormalized(profile.skillTags, filters.skill)) {
    return false;
  }

  const query = normalized(filters.q);
  if (!query) {
    return true;
  }

  const haystack = [
    profile.fullName,
    profile.preferredName,
    profile.headline,
    profile.shortBio,
    profile.startupName,
    profile.startupOneLiner,
    profile.startupDescription,
    profile.stage,
    profile.industryTags.join(" "),
    profile.problemSpaceTags.join(" "),
    profile.skillTags.join(" "),
    profile.lookingForTypes.join(" "),
    profile.desiredRoles.join(" "),
    membership.affiliationType,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function profileCanAppearInDirectory(profile?: Profile, membership?: Membership) {
  return Boolean(
    profile &&
      membership?.status === "approved" &&
      profile.onboardingComplete &&
      profile.profileVisibleInMatching,
  );
}

export async function getMemberDirectoryViewsForOrg(
  org: Organization,
  options: MemberDirectoryViewOptions,
) {
  const filters = options.filters ?? {};
  const hasFilters = Object.values(filters).some(Boolean);
  const records = await listMembershipProfileRecordsForOrg(org.id, {
    profileRequired: true,
    status: "approved",
    limit: hasFilters ? undefined : options.limit ? Math.max(options.limit * 2, options.limit) : 160,
  });
  const visibleRecords = records
    .filter(
      (record): record is MembershipRecord & { profile: Profile } => {
        if (!record.profile) {
          return false;
        }

        return (
          profileCanAppearInDirectory(record.profile, record.membership) &&
          directoryProfileMatchesFilters(record.profile, record.membership, filters)
        );
      },
    )
    .sort((left, right) => {
      const featuredDelta =
        Number(Boolean(right.profile.featured)) - Number(Boolean(left.profile.featured));
      if (featuredDelta) {
        return featuredDelta;
      }
      return right.profile.lastActiveAt.localeCompare(left.profile.lastActiveAt);
    });
  const limitedRecords = options.limit ? visibleRecords.slice(0, options.limit) : visibleRecords;
  const membershipIds = limitedRecords.map((record) => record.membership.id);
  const [
    followedMembershipIds,
    introStatusByReceiver,
    profileLinksByProfileId,
  ] = await Promise.all([
    listFollowedMembershipIdsForMembership(options.viewerMembershipId, {
      followedMembershipIds: membershipIds,
    }),
    listActiveIntroRequestStatusesForRequester(options.viewerMembershipId, membershipIds),
    listProfileLinksByProfileIds(limitedRecords.map((record) => record.profile.id)),
  ]);
  const followedIds = new Set(followedMembershipIds);

  return limitedRecords
    .map((record) => {
      return toMemberDirectoryProfileView({
        profile: record.profile,
        membership: record.membership,
        profileLinks: profileLinksByProfileId.get(record.profile.id) ?? [],
        following: followedIds.has(record.membership.id),
        introStatus: introStatusByReceiver.get(record.membership.id),
      });
    });
}

export async function getMemberDirectoryProfileView(input: {
  orgId: string;
  membershipId: string;
  viewerMembershipId: string;
}) {
  const [record] = await listMembershipProfileRecordsByIds([input.membershipId], {
    orgId: input.orgId,
  });
  if (!record?.profile || !profileCanAppearInDirectory(record.profile, record.membership)) {
    return undefined;
  }

  const [
    profileLinks,
    followedMembershipIds,
    introStatusByReceiver,
  ] = await Promise.all([
    listProfileLinks(record.profile.id),
    listFollowedMembershipIdsForMembership(input.viewerMembershipId, {
      followedMembershipIds: [record.membership.id],
    }),
    listActiveIntroRequestStatusesForRequester(input.viewerMembershipId, [
      record.membership.id,
    ]),
  ]);

  return toMemberDirectoryProfileView({
    profile: record.profile,
    membership: record.membership,
    profileLinks,
    following: followedMembershipIds.includes(record.membership.id),
    introStatus: introStatusByReceiver.get(record.membership.id),
  });
}

function knowledgeReasonForPost(post: FeedPostView): KnowledgePostView["knowledgeReason"] | null {
  if (post.type === "resource") {
    return "resource";
  }

  if (post.featured) {
    return "featured";
  }

  if (post.commentCount >= 2) {
    return "active_discussion";
  }

  if (post.isSaved) {
    return "saved";
  }

  return null;
}

export async function getKnowledgePostViewsForOrg(
  org: Organization,
  options: KnowledgeViewOptions,
) {
  const [feedPosts, savedPostsById] = await Promise.all([
    getFeedViewsForOrg(org, {
      viewerMembershipId: options.viewerMembershipId,
      viewerProfileId: options.viewerProfileId,
      filters: { q: options.q },
      includeMatchedRecommendationSignals: false,
    }),
    listSavedPostIdsForMembership(options.viewerMembershipId),
  ]);

  const posts = feedPosts
    .filter((post) => (options.mode === "saved" ? post.isSaved : Boolean(knowledgeReasonForPost(post))))
    .filter((post) =>
      matchesNormalized(
        [
          post.title,
          post.body,
          post.tags.join(" "),
          post.author.displayName,
          post.author.headline,
        ].join(" "),
        options.q,
      ),
    )
    .map((post) => {
      const savedAt = savedPostsById.get(post.id)?.createdAt;
      return {
        ...post,
        knowledgeReason:
          options.mode === "saved"
            ? "saved"
            : (knowledgeReasonForPost(post) ?? "saved"),
        ...(savedAt ? { savedAt } : {}),
      } satisfies KnowledgePostView;
    })
    .sort((left, right) => {
      if (options.mode === "saved") {
        return (right.savedAt ?? "").localeCompare(left.savedAt ?? "");
      }
      const reasonRank = { resource: 3, featured: 2, active_discussion: 1, saved: 0 };
      const rankDelta = reasonRank[right.knowledgeReason] - reasonRank[left.knowledgeReason];
      if (rankDelta) {
        return rankDelta;
      }
      return right.createdAt.localeCompare(left.createdAt);
    });

  return options.limit ? posts.slice(0, options.limit) : posts;
}

export async function getFeedViewsForOrg(org: Organization, options: FeedViewOptions = {}) {
  const filters = options.filters ?? {};
  const normalizedQuery = normalized(filters.q);
  const postTypes = typesForPostList(filters, options.onlyOpportunities);
  const canLimitPostList = !hasNonPostListFilters(filters, normalizedQuery);
  const includeMatchedRecommendationSignals =
    options.includeMatchedRecommendationSignals ?? true;

  if (postTypes?.length === 0) {
    return [];
  }

  if (
    !options.viewerMembershipId &&
    !options.viewerProfileId &&
    !includeMatchedRecommendationSignals
  ) {
    const records = await listPublicFeedPostRecordsForOrg(org.id, {
      hidden: false,
      types: postTypes,
      opportunitySources: opportunitySourcesForPostList(filters),
      limit: canLimitPostList ? options.limit : undefined,
    });

    return records
      .map(({ commentCount, membership, post, profile }) => {
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
          commentCount,
          isFollowingAuthor: false,
          isSaved: false,
          isRecommended: false,
          recommendationReasons: [],
        };

        return { view, membership, profile, post };
      })
      .filter((entry) => feedEntryMatchesFilters(entry, filters, normalizedQuery))
      .map((entry) => entry.view);
  }

  const [
    postsForOrg,
    matchedMembershipIds,
  ] = await Promise.all([
    listPostsForOrg(org.id, {
      hidden: false,
      types: postTypes,
      opportunitySources: opportunitySourcesForPostList(filters),
      limit: canLimitPostList ? options.limit : undefined,
    }),
    includeMatchedRecommendationSignals && options.viewerProfileId
      ? listVisibleMatchTargetMembershipIdsForProfile(options.viewerProfileId)
      : includeMatchedRecommendationSignals && options.viewerMembershipId
        ? listVisibleMatchTargetMembershipIdsForMembership(options.viewerMembershipId)
      : Promise.resolve([]),
  ]);
  const relevantPosts = postsForOrg;
  const authorMembershipIds = relevantPosts.map((post) => post.authorMembershipId);
  const [
    membershipRecords,
    followedMembershipIds,
    savedPostsById,
    visibleCommentCountByPostId,
  ] = await Promise.all([
    listMembershipProfileRecordsByIds(
      authorMembershipIds,
      { orgId: org.id },
    ),
    options.viewerMembershipId
      ? listFollowedMembershipIdsForMembership(options.viewerMembershipId, {
          followedMembershipIds: authorMembershipIds,
        })
      : Promise.resolve([]),
    options.viewerMembershipId
      ? listSavedPostIdsForMembership(options.viewerMembershipId, {
          postIds: relevantPosts.map((post) => post.id),
        })
      : Promise.resolve(new Map()),
    listVisibleCommentCountsForOrg(org.id, {
      postIds: relevantPosts.map((post) => post.id),
    }),
  ]);
  const followedIds = new Set(followedMembershipIds);
  const matchedIds = new Set(matchedMembershipIds);
  const recordByMembershipId = new Map(
    membershipRecords.map((record) => [record.membership.id, record]),
  );

  const entries = relevantPosts
    .map((post) => {
      const record = recordByMembershipId.get(post.authorMembershipId);
      const membership = record?.membership;
      const profile = record?.profile;

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
        commentCount: visibleCommentCountByPostId.get(post.id) ?? 0,
        isFollowingAuthor: followedIds.has(membership.id),
        isSaved: savedPostsById.has(post.id),
        isRecommended: recommendationReasons.length > 0,
        recommendationReasons,
      };

      return { view, membership, profile, post };
    });

  return entries
    .filter((entry): entry is FeedEntry => Boolean(entry))
    .filter((entry) => feedEntryMatchesFilters(entry, filters, normalizedQuery))
    .map((entry) => entry.view);
}

export async function getMatchViews(membershipId: string, matchRecords: Array<{
  id: string;
  matchType: MatchCardView["matchType"];
  matchTypeLabel?: string;
  score: number;
  scoreBand: MatchCardView["scoreBand"];
  confidence?: MatchCardView["confidence"];
  explanationText: string;
  overlapTags: string[];
  targetProfileId: string;
}>, orgId?: string) {
  const sourceMembership = orgId ? undefined : await getMembershipById(membershipId);
  const recordsOrgId = orgId ?? sourceMembership?.orgId;
  const profileRecords = await listProfileMembershipRecordsByIds(
    matchRecords.map((match) => match.targetProfileId),
    { orgId: recordsOrgId },
  );
  const recordByProfileId = new Map(
    profileRecords.map((record) => [record.profile.id, record]),
  );
  const views = matchRecords.map((match) => {
    const record = recordByProfileId.get(match.targetProfileId);
    const profile = record?.profile;
    const membership = record?.membership;

    if (!profile || !membership) {
      return null;
    }

    return {
      id: match.id,
      matchType: match.matchType,
      matchTypeLabel: match.matchTypeLabel ?? match.matchType.replaceAll("_", " "),
      score: match.score,
      scoreBand: match.scoreBand,
      confidence: match.confidence ?? "medium",
      explanationText: match.explanationText,
      overlapTags: match.overlapTags,
      target: toLimitedProfileCard(profile, membership),
    } satisfies MatchCardView;
  });

  return views.filter(Boolean) as MatchCardView[];
}

export async function getMatchCardViewsForProfile(
  profileId: string,
  membershipId: string,
  options: { matchType?: string } = {},
) {
  const [records, introStatusByReceiver] = await Promise.all([
    listMatchTargetRecordsForProfile(profileId, membershipId, {
      matchType: options.matchType,
    }),
    listActiveIntroRequestStatusesForRequester(membershipId),
  ]);
  const configs = records[0]
    ? await listMatchTypeConfigsForOrg(records[0].match.orgId, { includeInactive: true })
    : [];
  const configBySlug = new Map(configs.map((config) => [config.slug, config]));
  const views: Array<{
    match: MatchCardView;
    following: boolean;
    introStatus?: IntroStatus;
  }> = [];

  for (const record of records) {
    if (!record.targetProfile || !record.targetMembership) {
      continue;
    }

    const introStatus = introStatusByReceiver.get(record.targetMembership.id);
    views.push({
      match: {
        id: record.match.id,
        matchType: record.match.matchType,
        matchTypeLabel:
          configBySlug.get(record.match.matchType)?.name ??
          record.match.matchType.replaceAll("_", " "),
        score: record.match.score,
        scoreBand: record.match.scoreBand,
        confidence: record.match.confidence,
        explanationText: record.match.explanationText,
        overlapTags: record.match.overlapTags,
        target: toLimitedProfileCard(record.targetProfile, record.targetMembership),
      },
      following: record.following,
      ...(introStatus ? { introStatus } : {}),
    });
  }

  return views;
}

export async function getPostThreadIntroContext(input: {
  postId: string;
  orgId: string;
  viewerMembershipId?: string;
}): Promise<PostThreadIntroContext> {
  const [thread, introStatusByReceiver, savedPostsById] = await Promise.all([
    getPostThreadRecord(input.postId, input.orgId),
    input.viewerMembershipId
      ? listActiveIntroRequestStatusesForRequester(input.viewerMembershipId)
      : Promise.resolve(new Map<string, IntroStatus>()),
    input.viewerMembershipId
      ? listSavedPostIdsForMembership(input.viewerMembershipId, {
          postIds: [input.postId],
        })
      : Promise.resolve(new Map()),
  ]);
  const authorMembershipId = thread?.author?.membership.id;

  return {
    thread,
    isPostSaved: savedPostsById.has(input.postId),
    existingIntroStatus:
      input.viewerMembershipId &&
      authorMembershipId &&
      authorMembershipId !== input.viewerMembershipId
        ? introStatusByReceiver.get(authorMembershipId)
        : undefined,
  };
}

export async function getIntroRequestViews(
  membershipId: string,
  orgId?: string,
  options: IntroRequestViewOptions = {},
) {
  const [requests, viewerMembership] = await Promise.all([
    listIntroRequestsForMembership(membershipId, options),
    orgId ? Promise.resolve(undefined) : getMembershipById(membershipId),
  ]);
  const recordsOrgId = orgId ?? viewerMembership?.orgId;
  const relatedMembershipIds = requests.flatMap((request) => [
    request.requesterMembershipId,
    request.receiverMembershipId,
  ]);
  const membershipRecords = await listMembershipProfileRecordsByIds(relatedMembershipIds, {
    orgId: recordsOrgId,
  });
  const recordByMembershipId = new Map(
    membershipRecords.map((record) => [record.membership.id, record]),
  );

  return requests.map((request) => {
    const isIncoming = request.receiverMembershipId === membershipId;
    const otherRecord = recordByMembershipId.get(
      isIncoming ? request.requesterMembershipId : request.receiverMembershipId,
    );
    const otherMembership = otherRecord?.membership;
    const otherProfile = otherRecord?.profile;

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

export async function getNotificationViews(
  membershipId: string,
  options: { limit?: number } = {},
) {
  return (await listNotificationsForMembership(membershipId, options)).map(
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

export async function getAdminPostModerationDashboard(
  orgId: string,
  options: AdminPostModerationDashboardOptions = {},
): Promise<AdminPostModerationDashboardView> {
  const [posts, commentRecords] = await Promise.all([
    listPostsForOrg(orgId, { limit: options.postLimit ?? 50 }),
    listCommentRecordsForOrg(orgId, { limit: options.commentLimit ?? 30 }),
  ]);
  const authorMembershipIds = [
    ...posts.map((post) => post.authorMembershipId),
    ...commentRecords.map((record) => record.comment.authorMembershipId),
  ];
  const membershipRecords = await listMembershipProfileRecordsByIds(authorMembershipIds, {
    orgId,
  });
  const recordByMembershipId = new Map(
    membershipRecords.map((record) => [record.membership.id, record]),
  );
  const nameForMembership = (membershipId: string) => {
    const record = recordByMembershipId.get(membershipId);
    return record?.profile
      ? displayName(record.profile)
      : record?.membership.id ?? "Unknown";
  };

  return {
    posts: posts.map((post) => ({
      id: post.id,
      title: post.title,
      body: post.body,
      type: post.type,
      featured: post.featured,
      hidden: post.hidden,
      commentsLocked: post.commentsLocked,
      status: post.status,
      authorName: nameForMembership(post.authorMembershipId),
    })),
    comments: commentRecords.map((record) => ({
      id: record.comment.id,
      body: record.comment.body,
      status: record.comment.status,
      postId: record.post?.id,
      postTitle: record.post?.title ?? "Unknown post",
      authorName: nameForMembership(record.comment.authorMembershipId),
    })),
  };
}

export async function getAdminIntroRequestDashboard(
  orgId: string,
  options: AdminIntroRequestDashboardOptions = {},
): Promise<AdminIntroRequestDashboardView> {
  const [requests, candidateRecords] = await Promise.all([
    listIntroRequestsForOrg(orgId, {
      limit: options.requestLimit ?? 50,
      sourceType: options.sourceType,
      status: options.requestStatus,
    }),
    listMembershipRecordsForOrg(orgId, {
      limit: options.candidateLimit ?? 100,
      status: "approved",
    }),
  ]);
  const eligibleCandidateRecords = candidateRecords.filter(
    (record) =>
      record.profile?.introOptIn && getProfileReadiness(record.profile).isReady,
  );
  const recordByMembershipId = new Map(
    eligibleCandidateRecords.map((record) => [record.membership.id, record]),
  );
  const missingParticipantIds = [
    ...new Set(
      requests
        .flatMap((request) => [
          request.requesterMembershipId,
          request.receiverMembershipId,
        ])
        .filter((membershipId) => !recordByMembershipId.has(membershipId)),
    ),
  ];
  const participantRecords = await listMembershipUserRecordsByIds(
    missingParticipantIds,
    { orgId },
  );

  for (const record of participantRecords) {
    recordByMembershipId.set(record.membership.id, record);
  }

  return {
    manualIntroCandidates: eligibleCandidateRecords.map((record) => ({
      membershipId: record.membership.id,
      name: record.user?.name ?? record.membership.id,
    })),
    requests: requests.map((request) => ({
      id: request.id,
      status: request.status,
      introPurpose: request.introPurpose,
      note: request.note,
      requesterName:
        recordByMembershipId.get(request.requesterMembershipId)?.user?.name ??
        "Unknown",
      receiverName:
        recordByMembershipId.get(request.receiverMembershipId)?.user?.name ??
        "Unknown",
    })),
  };
}

export async function getMemberActivationState(
  orgId: string,
  membershipId: string,
  profile: Profile,
  slug = "wavespark",
): Promise<MemberActivationState> {
  const {
    hasPost,
    hasFollow,
    hasVisibleMatch,
    hasRequestedIntro,
  } = await getMemberActivationSignals({
    orgId,
    membershipId,
    profileId: profile.id,
  });
  const readiness = getProfileReadiness(profile);
  const hasMatchOrFollow = hasFollow || hasVisibleMatch;
  const items = [
    {
      id: "profile",
      label: "Complete your profile",
      description: readiness.isReady
        ? "Your profile has the context needed for matches and introductions."
        : "Add the minimum founder context so recommendations can work harder.",
      complete: readiness.isReady,
      href: `/org/${slug}/onboarding`,
      cta: readiness.isReady ? "Review profile" : "Finish profile",
    },
    {
      id: "post",
      label: "Publish your first signal",
      description: hasPost
        ? "You have shared context the community can respond to."
        : "Post an ask, update, or useful context so the right people can spot fit.",
      complete: hasPost,
      href: `/org/${slug}/compose?kind=feed`,
      cta: hasPost ? "Create another post" : "Create post",
    },
    {
      id: "matches",
      label: "Browse your matches",
      description: hasMatchOrFollow
        ? "Your match graph is ready. Use it to find the next useful conversation."
        : "Review surfaced members and follow the people worth tracking.",
      complete: hasMatchOrFollow,
      href: `/org/${slug}/matches`,
      cta: "Open matches",
    },
    {
      id: "intro",
      label: "Request a high-context intro",
      description: hasRequestedIntro
        ? "You have started an intro flow with context."
        : "Use a match or post to request an intro without exposing contact details.",
      complete: hasRequestedIntro,
      href: hasRequestedIntro
        ? `/org/${slug}/requests`
        : hasMatchOrFollow
          ? `/org/${slug}/matches`
          : `/org/${slug}/requests`,
      cta: hasRequestedIntro ? "View requests" : "Request intro",
    },
  ] satisfies MemberActivationState["items"];

  const completedCount = items.filter((item) => item.complete).length;

  return {
    items,
    completedCount,
    totalCount: items.length,
    isComplete: completedCount === items.length,
  };
}

export async function getProfileLinks(profileId: string): Promise<ProfileLink[]> {
  return listProfileLinks(profileId);
}

import {
  canViewContactDetails,
  getProfileVisibilityForMember,
} from "@/server/permissions";
import { getProfileReadiness } from "@/lib/activation";
import { getCommunityDisplayName } from "@/lib/community-copy";
import {
  getMembershipById,
  getSpaceById,
  getMemberActivationSignals,
  getPostThreadRecord,
  getPostThreadRecordForSpace,
  listActiveSpaceMemberRecords,
  listCommentRecordsForOrg,
  listActiveIntroRequestStatusesForRequester,
  listActiveIntroRequestStatusesForRequesterInSpace,
  listFollowedMembershipIdsForMembership,
  listFollowedMembershipIdsForMembershipInSpace,
  listIntroRequestsForOrg,
  listIntroRequestsForMembership,
  listIntroRequestsForMembershipInSpace,
  listIntroRequestsForMembershipWithSpaceAccess,
  listMembershipUserRecordsByIds,
  listMembershipProfileRecordsForOrg,
  listMembershipProfileRecordsByIds,
  listMatchTargetRecordsForProfile,
  listMatchTypeConfigsForOrg,
  listNotificationsForMembership,
  listNotificationsForMembershipInSpace,
  listNotificationsForMembershipWithSpaceAccess,
  listMentionableMembershipIdsForSpace,
  listPostImagesForPostIds,
  listPostLinkPreviewsForPostIds,
  listPostMentionsForPostIds,
  listPostsForOrg,
  listPostsForSpace,
  listPublicFeedPostRecordsForOrg,
  listFeedPostRecordsForSpace,
  listProfileMembershipRecordsByIds,
  listProfileLinks,
  listProfileLinksByProfileIds,
  listSavedPostIdsForMembership,
  listSavedPostIdsForMembershipInSpace,
  listVisibleCommentCountsForOrg,
  listVisibleCommentCountsForSpace,
  listVisibleMatchTargetMembershipIdsForMembership,
  listVisibleMatchTargetMembershipIdsForProfile,
} from "@/server/store";
import type {
  ActiveSpaceMemberRecord,
  MembershipRecord,
  PostThreadRecord,
} from "@/server/store";
import type {
  FeedPostView,
  FullAdminProfile,
  IntroRequestView,
  IntroStatus,
  KnowledgePostView,
  Comment,
  LimitedProfileCard,
  MatchCardView,
  MemberDirectoryCompleteProfileView,
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
  Space,
} from "@/lib/domain";
import { getAffiliationLabel } from "@/lib/member-copy";

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
  spaceId?: string;
  viewerMembershipId?: string;
  viewerProfileId?: string;
  filters?: FeedFilters;
  onlyOpportunities?: boolean;
  includeMatchedRecommendationSignals?: boolean;
  limit?: number;
}

export interface MemberDirectoryViewOptions {
  spaceId?: string;
  viewerMembershipId: string;
  filters?: MemberDirectoryFilters;
  limit?: number;
}

export interface KnowledgeViewOptions {
  spaceId?: string;
  viewerMembershipId: string;
  viewerProfileId?: string;
  mode?: KnowledgeMode;
  q?: string;
  limit?: number;
}

export interface AdminIntroRequestDashboardOptions {
  spaceId?: string;
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
  spaceId?: string;
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
  spaceId?: string;
  title: string;
  body: string;
  type: PostType;
  updatedAt: string;
  opportunitySource?: OpportunitySource;
  tags: string[];
  relatedStartupName?: string;
  relatedRolesNeeded: string[];
  featured: boolean;
  hidden: boolean;
  commentsLocked: boolean;
  status: Post["status"];
  authorName: string;
  images: Array<{
    id: string;
    url: string;
    width: number;
    height: number;
    alt: string;
    moderationStatus: "visible" | "removed";
  }>;
  linkPreview?: {
    id: string;
    url: string;
    domain: string;
    title?: string;
    moderationStatus: "visible" | "removed";
  };
  mentions: Array<{ id: string; label: string; memberName: string }>;
}

export interface AdminCommentModerationRowView {
  id: string;
  spaceId?: string;
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
  kind?: IntroRequestView["kind"];
  status?: IntroStatus;
}

function acceptedContactDetails(profile: Profile) {
  return {
    email: profile.emailForIntro,
    ...(profile.whatsappVisibleAfterAccept && profile.whatsappNumber
      ? { whatsapp: profile.whatsappNumber }
      : {}),
  } satisfies NonNullable<IntroRequestView["contactDetails"]>;
}

interface FeedEntry {
  view: FeedPostView;
  membership: Membership;
  profile: Profile;
  post: Post;
}

async function loadPostRichViews(posts: Post[]) {
  const postIds = posts.map((post) => post.id);
  const [images, previews, mentions] = await Promise.all([
    listPostImagesForPostIds(postIds),
    listPostLinkPreviewsForPostIds(postIds),
    listPostMentionsForPostIds(postIds),
  ]);
  const membershipIdsBySpace = new Map<string, Set<string>>();
  for (const mention of mentions) {
    const ids = membershipIdsBySpace.get(mention.spaceId) ?? new Set<string>();
    ids.add(mention.mentionedMembershipId);
    membershipIdsBySpace.set(mention.spaceId, ids);
  }
  const activeMembershipsBySpace = new Map<string, Set<string>>();
  await Promise.all(
    [...membershipIdsBySpace.entries()].map(async ([spaceId, ids]) => {
      activeMembershipsBySpace.set(
        spaceId,
        new Set(await listMentionableMembershipIdsForSpace(spaceId, [...ids])),
      );
    }),
  );
  const result = new Map<string, Pick<FeedPostView, "images" | "linkPreview" | "mentions">>();
  for (const post of posts) {
    const postImages = images
      .filter((image) => image.postId === post.id)
      .map((image) => ({
        id: image.id,
        url: `/api/post-images/${image.id}`,
        width: image.width ?? 1,
        height: image.height ?? 1,
        alt: image.alt?.trim() || "Post image",
        position: image.position,
      }));
    const preview = previews.find((candidate) => candidate.postId === post.id);
    const postMentions = mentions
      .filter(
        (mention) =>
          mention.postId === post.id &&
          activeMembershipsBySpace
            .get(mention.spaceId)
            ?.has(mention.mentionedMembershipId),
      )
      .map((mention) => ({
        membershipId: mention.mentionedMembershipId,
        label: mention.label,
        start: mention.start,
        end: mention.end,
      }));
    result.set(post.id, {
      images: postImages,
      linkPreview: preview
        ? {
            id: preview.id,
            url: preview.originalUrl,
            title: preview.title,
            description: preview.description,
            siteName: preview.siteName,
            thumbnailUrl: preview.thumbnailBlobPathname
              ? `/api/post-link-previews/${preview.id}/thumbnail`
              : undefined,
            thumbnailWidth: preview.thumbnailWidth,
            thumbnailHeight: preview.thumbnailHeight,
          }
        : undefined,
      mentions: postMentions,
    });
  }
  return result;
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

function publicAffiliationLabel(membership: Membership) {
  return getAffiliationLabel(
    membership.affiliationType === "mentor"
      ? "current participant"
      : membership.affiliationType,
  );
}

export function toLimitedProfileCard(profile: Profile, membership: Membership): LimitedProfileCard {
  return {
    membershipId: membership.id,
    profileId: profile.id,
    displayName: displayName(profile),
    photo: profile.profilePhoto,
    headline: profile.headline,
    currentStatus: profile.currentStatus,
    whatTheyAreBuilding: profile.currentFocus || profile.startupOneLiner,
    whatTheyNeed: profile.lookingForTypes,
    keyTags: [...profile.industryTags, ...profile.skillTags].slice(0, 5),
    affiliationLabel: publicAffiliationLabel(membership),
    location: [profile.city, profile.country].filter(Boolean).join(", "),
  };
}

export function toFullAdminProfile(profile: Profile, membership: Membership): FullAdminProfile {
  return {
    ...toLimitedProfileCard(profile, membership),
    affiliationLabel: getAffiliationLabel(membership.affiliationType),
    ...getProfileVisibilityForMember(profile, membership),
    emailForIntro: profile.emailForIntro,
    whatsappNumber: profile.whatsappNumber,
    bio: profile.bio || profile.longBio || profile.shortBio,
    problemInterest: profile.problemInterest,
    currentFocus: profile.currentFocus,
    technicalExperienceLevel: profile.technicalExperienceLevel,
    technicalExperience: profile.technicalExperience,
    longBio: profile.bio || profile.longBio || profile.shortBio,
    schoolOrCompany: profile.schoolOrCompany,
    timezone: profile.timezone,
    startupName: profile.startupName,
    startupOneLiner: profile.startupOneLiner,
    startupDescription: profile.startupDescription,
    stage: profile.stage,
    industryTags: profile.industryTags,
    problemSpaceTags: profile.problemSpaceTags,
    businessModelTags: profile.businessModelTags,
    currentProgress: profile.currentProgress,
    tractionSummary: profile.tractionSummary,
    regionFocus: profile.regionFocus,
    lookingForTypes: profile.lookingForTypes,
    seekingMatchTypes: profile.seekingMatchTypes,
    offeringMatchTypes: profile.offeringMatchTypes,
    desiredRoles: profile.desiredRoles,
    helpNeededTags: profile.helpNeededTags,
    idealMatchDescription: profile.idealMatchDescription,
    skillTags: profile.skillTags,
    yearsOfExperience: profile.yearsOfExperience,
    topStrengths: profile.topStrengths,
    canContribute: profile.canContribute,
    priorProjects: profile.priorProjects,
    notableWins: profile.notableWins,
    timeCommitment: profile.timeCommitment,
    availabilityStart: profile.availabilityStart,
    remotePreference: profile.remotePreference,
    preferredGeographies: profile.preferredGeographies,
    meetingFrequencyPreference: profile.meetingFrequencyPreference,
    ambitionLevel: profile.ambitionLevel,
    riskTolerance: profile.riskTolerance,
    speedPreference: profile.speedPreference,
    decisionStyle: profile.decisionStyle,
    workStyle: profile.workStyle,
    communicationStyle: profile.communicationStyle,
    conflictStyle: profile.conflictStyle,
    commitmentHorizon: profile.commitmentHorizon,
    missionVsMarketOrientation: profile.missionVsMarketOrientation,
    structureVsChaos: profile.structureVsChaos,
    mentorExpertiseTags: profile.mentorExpertiseTags,
    mentorStageExperience: profile.mentorStageExperience,
    mentorFunctionalStrengths: profile.mentorFunctionalStrengths,
    mentorAvailability: profile.mentorAvailability,
    mentorOffers: profile.mentorOffers,
    maxMentees: profile.maxMentees,
    mentorshipPreferences: profile.mentorshipPreferences,
    introOptIn: profile.introOptIn,
    profileVisibleInMatching: profile.profileVisibleInMatching,
    onboardingComplete: profile.onboardingComplete,
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
    (filters.authorAffiliation === "mentor"
      ? membership.mentorStatus !== "approved"
      : membership.affiliationType !== filters.authorAffiliation)
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
      publicAffiliationLabel(membership),
      membership.mentorStatus === "approved" ? "approved mentor" : "",
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
}): MemberDirectoryCompleteProfileView {
  const isApprovedMentor = input.membership.mentorStatus === "approved";
  const acceptingMentoringRequests =
    isApprovedMentor && input.profile.offeringMatchTypes.includes("mentor_match");
  return {
    ...toLimitedProfileCard(input.profile, input.membership),
    profileStatus: "complete",
    isApprovedMentor,
    acceptingMentoringRequests,
    openToIntroductions: input.profile.introOptIn,
    bio: input.profile.bio || input.profile.longBio || input.profile.shortBio,
    problemInterest: input.profile.problemInterest,
    currentFocus: input.profile.currentFocus,
    technicalExperienceLevel: input.profile.technicalExperienceLevel,
    technicalExperience: input.profile.technicalExperience,
    stage: input.profile.stage,
    startupName: input.profile.startupName,
    startupDescription: input.profile.startupDescription,
    currentProgress: input.profile.currentProgress,
    tractionSummary: input.profile.tractionSummary,
    industryTags: input.profile.industryTags,
    problemSpaceTags: input.profile.problemSpaceTags,
    skillTags: input.profile.skillTags,
    desiredRoles: input.profile.desiredRoles,
    mentorExpertiseTags: isApprovedMentor ? input.profile.mentorExpertiseTags : [],
    mentorStageExperience: isApprovedMentor ? input.profile.mentorStageExperience : [],
    mentorFunctionalStrengths: isApprovedMentor
      ? input.profile.mentorFunctionalStrengths
      : [],
    mentorAvailability: isApprovedMentor ? input.profile.mentorAvailability : "",
    mentorOffers: isApprovedMentor ? input.profile.mentorOffers : [],
    maxMentees: isApprovedMentor ? input.profile.maxMentees : null,
    mentorshipPreferences: isApprovedMentor
      ? input.profile.mentorshipPreferences
      : "",
    profileLinks: input.profileLinks,
    isFollowing: input.following,
    ...(input.introStatus ? { introStatus: input.introStatus } : {}),
  };
}

function directoryPlaceholderDisplayName(record: ActiveSpaceMemberRecord) {
  return (
    record.profile?.preferredName.trim() ||
    record.profile?.fullName.trim() ||
    record.user?.name.trim() ||
    "Community member"
  );
}

function toMemberDirectoryPlaceholderView(
  record: ActiveSpaceMemberRecord,
): MemberDirectoryProfileView {
  return {
    profileStatus: record.profile ? "incomplete" : "missing",
    membershipId: record.membership.id,
    displayName: directoryPlaceholderDisplayName(record),
    photo: "",
    affiliationLabel: publicAffiliationLabel(record.membership),
  };
}

function directoryProfileMatchesFilters(
  profile: Profile,
  membership: Membership,
  filters: MemberDirectoryFilters,
) {
  if (filters.mentorStatus && membership.mentorStatus !== filters.mentorStatus) {
    return false;
  }

  if (
    filters.affiliation &&
    (filters.affiliation === "mentor"
      ? membership.mentorStatus !== "approved"
      : membership.affiliationType !== filters.affiliation)
  ) {
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
        ...(membership.mentorStatus === "approved" ? profile.mentorOffers : []),
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
    profile.bio || profile.longBio || profile.shortBio,
    profile.problemInterest,
    profile.currentFocus,
    profile.technicalExperience,
    profile.startupName,
    profile.startupOneLiner,
    profile.startupDescription,
    profile.stage,
    profile.industryTags.join(" "),
    profile.problemSpaceTags.join(" "),
    profile.skillTags.join(" "),
    profile.lookingForTypes.join(" "),
    profile.desiredRoles.join(" "),
    ...(membership.mentorStatus === "approved"
      ? [
          profile.mentorExpertiseTags.join(" "),
          profile.mentorFunctionalStrengths.join(" "),
          profile.mentorStageExperience.join(" "),
          profile.mentorOffers.join(" "),
          profile.mentorshipPreferences,
        ]
      : []),
    publicAffiliationLabel(membership),
    membership.mentorStatus === "approved" ? "approved mentor" : "",
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

function profileCanAppearInSpaceDirectory(profile?: Profile) {
  return Boolean(profile?.onboardingComplete);
}

function directoryPlaceholderMatchesFilters(
  record: ActiveSpaceMemberRecord,
  filters: MemberDirectoryFilters,
) {
  if (filters.mentorStatus && record.membership.mentorStatus !== filters.mentorStatus) {
    return false;
  }

  if (
    filters.affiliation &&
    (filters.affiliation === "mentor"
      ? record.membership.mentorStatus !== "approved"
      : record.membership.affiliationType !== filters.affiliation)
  ) {
    return false;
  }

  if (filters.stage || filters.industry || filters.need || filters.skill) {
    return false;
  }

  const query = normalized(filters.q);
  if (!query) {
    return true;
  }

  return [
    directoryPlaceholderDisplayName(record),
    publicAffiliationLabel(record.membership),
    record.membership.mentorStatus === "approved" ? "approved mentor" : "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
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

export async function getMemberDirectoryViewsForSpace(
  spaceId: string,
  org: Organization,
  options: Omit<MemberDirectoryViewOptions, "spaceId">,
) {
  const filters = options.filters ?? {};
  const records = (await listActiveSpaceMemberRecords(spaceId))
    .filter((record) => record.membership.orgId === org.id)
    .filter(
      (record) =>
        record.profile && profileCanAppearInSpaceDirectory(record.profile)
          ? directoryProfileMatchesFilters(record.profile, record.membership, filters)
          : directoryPlaceholderMatchesFilters(record, filters),
    )
    .sort((left, right) => {
      const leftComplete = profileCanAppearInSpaceDirectory(left.profile);
      const rightComplete = profileCanAppearInSpaceDirectory(right.profile);
      const readinessDelta = Number(rightComplete) - Number(leftComplete);
      if (readinessDelta) {
        return readinessDelta;
      }

      if (leftComplete && rightComplete) {
        const featuredDelta =
          Number(Boolean(right.profile?.featured)) - Number(Boolean(left.profile?.featured));
        return (
          featuredDelta ||
          (right.profile?.lastActiveAt ?? "").localeCompare(left.profile?.lastActiveAt ?? "")
        );
      }

      return directoryPlaceholderDisplayName(left).localeCompare(
        directoryPlaceholderDisplayName(right),
      );
    });
  const limitedRecords = options.limit ? records.slice(0, options.limit) : records;
  const completeRecords = limitedRecords.filter(
    (record): record is ActiveSpaceMemberRecord & { profile: Profile } =>
      Boolean(record.profile && profileCanAppearInSpaceDirectory(record.profile)),
  );
  const membershipIds = completeRecords.map((record) => record.membership.id);
  const [followedMembershipIds, introStatusByReceiver, profileLinksByProfileId] =
    await Promise.all([
      listFollowedMembershipIdsForMembershipInSpace(
        spaceId,
        options.viewerMembershipId,
        { followedMembershipIds: membershipIds },
      ),
      listActiveIntroRequestStatusesForRequesterInSpace(
        spaceId,
        options.viewerMembershipId,
        membershipIds,
      ),
      listProfileLinksByProfileIds(completeRecords.map((record) => record.profile.id)),
    ]);
  const followedIds = new Set(followedMembershipIds);

  return limitedRecords.map((record) => {
    if (!record.profile || !profileCanAppearInSpaceDirectory(record.profile)) {
      return toMemberDirectoryPlaceholderView(record);
    }

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

export async function getMemberDirectoryProfileViewForSpace(input: {
  orgId: string;
  spaceId: string;
  membershipId: string;
  viewerMembershipId: string;
}) {
  const record = (await listActiveSpaceMemberRecords(input.spaceId)).find(
    (candidate) =>
      candidate.membership.id === input.membershipId &&
      candidate.membership.orgId === input.orgId,
  );
  if (!record?.profile || !profileCanAppearInSpaceDirectory(record.profile)) {
    return undefined;
  }
  const [profileLinks, followedMembershipIds, introStatusByReceiver] = await Promise.all([
    listProfileLinks(record.profile.id),
    listFollowedMembershipIdsForMembershipInSpace(
      input.spaceId,
      input.viewerMembershipId,
      { followedMembershipIds: [record.membership.id] },
    ),
    listActiveIntroRequestStatusesForRequesterInSpace(
      input.spaceId,
      input.viewerMembershipId,
      [record.membership.id],
    ),
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
  const feedPosts = await getFeedViewsForOrg(org, {
    spaceId: options.spaceId,
    viewerMembershipId: options.viewerMembershipId,
    viewerProfileId: options.viewerProfileId,
    filters: { q: options.q },
    includeMatchedRecommendationSignals: false,
  });

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
      const { savedAt } = post;
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

export async function getKnowledgePostViewsForSpace(
  spaceId: string,
  org: Organization,
  options: Omit<KnowledgeViewOptions, "spaceId">,
) {
  return getKnowledgePostViewsForOrg(org, { ...options, spaceId });
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
    const postOptions = {
      hidden: false,
      types: postTypes,
      opportunitySources: opportunitySourcesForPostList(filters),
      limit: canLimitPostList ? options.limit : undefined,
    };
    const records = await (options.spaceId
      ? listFeedPostRecordsForSpace(options.spaceId, postOptions)
      : listPublicFeedPostRecordsForOrg(org.id, postOptions));
    const richViewsByPostId = await loadPostRichViews(
      records.map((record) => record.post),
    );

    return records
      .map(({ commentCount, membership, post, profile }) => {
        const rich = richViewsByPostId.get(post.id) ?? {
          images: [],
          mentions: [],
        };
        const view: FeedPostView = {
          id: post.id,
          type: post.type,
          opportunitySource: post.opportunitySource,
          title: post.title,
          body: post.body,
          images: rich.images,
          linkPreview: rich.linkPreview,
          mentions: rich.mentions,
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
    options.spaceId
      ? listPostsForSpace(options.spaceId, {
          hidden: false,
          types: postTypes,
          opportunitySources: opportunitySourcesForPostList(filters),
          limit: canLimitPostList ? options.limit : undefined,
        })
      : listPostsForOrg(org.id, {
          hidden: false,
          types: postTypes,
          opportunitySources: opportunitySourcesForPostList(filters),
          limit: canLimitPostList ? options.limit : undefined,
        }),
    includeMatchedRecommendationSignals && options.viewerProfileId
      ? listVisibleMatchTargetMembershipIdsForProfile(options.viewerProfileId, {
          spaceId: options.spaceId,
        })
      : includeMatchedRecommendationSignals && options.viewerMembershipId
        ? listVisibleMatchTargetMembershipIdsForMembership(
            options.viewerMembershipId,
            { spaceId: options.spaceId },
          )
        : Promise.resolve([]),
  ]);
  const relevantPosts = postsForOrg;
  const authorMembershipIds = relevantPosts.map((post) => post.authorMembershipId);
  const [
    membershipRecords,
    followedMembershipIds,
    savedPostsById,
    visibleCommentCountByPostId,
    richViewsByPostId,
  ] = await Promise.all([
    listMembershipProfileRecordsByIds(
      authorMembershipIds,
      { orgId: org.id },
    ),
    options.viewerMembershipId
      ? options.spaceId
        ? listFollowedMembershipIdsForMembershipInSpace(
            options.spaceId,
            options.viewerMembershipId,
            { followedMembershipIds: authorMembershipIds },
          )
        : listFollowedMembershipIdsForMembership(options.viewerMembershipId, {
            followedMembershipIds: authorMembershipIds,
          })
      : Promise.resolve([]),
    options.viewerMembershipId
      ? options.spaceId
        ? listSavedPostIdsForMembershipInSpace(
            options.spaceId,
            options.viewerMembershipId,
            { postIds: relevantPosts.map((post) => post.id) },
          )
        : listSavedPostIdsForMembership(options.viewerMembershipId, {
            postIds: relevantPosts.map((post) => post.id),
          })
      : Promise.resolve(new Map()),
    options.spaceId
      ? listVisibleCommentCountsForSpace(options.spaceId, {
          postIds: relevantPosts.map((post) => post.id),
        })
      : listVisibleCommentCountsForOrg(org.id, {
          postIds: relevantPosts.map((post) => post.id),
        }),
    loadPostRichViews(relevantPosts),
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
      const savedPost = savedPostsById.get(post.id);
      const rich = richViewsByPostId.get(post.id) ?? {
        images: [],
        mentions: [],
      };

      const view: FeedPostView = {
        id: post.id,
        type: post.type,
        opportunitySource: post.opportunitySource,
        title: post.title,
        body: post.body,
        images: rich.images,
        linkPreview: rich.linkPreview,
        mentions: rich.mentions,
        tags: post.tags,
        relatedRolesNeeded: post.relatedRolesNeeded,
        status: post.status,
        featured: post.featured,
        createdAt: post.createdAt,
        author: toLimitedProfileCard(profile, membership),
        commentCount: visibleCommentCountByPostId.get(post.id) ?? 0,
        isFollowingAuthor: followedIds.has(membership.id),
        isSaved: Boolean(savedPost),
        ...(savedPost ? { savedAt: savedPost.createdAt } : {}),
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

export async function getFeedViewsForSpace(
  spaceId: string,
  org: Organization,
  options: FeedViewOptions & { viewerMembershipId: string },
) {
  return getFeedViewsForOrg(org, { ...options, spaceId });
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

    if (!profile || !membership || !profile.introOptIn) {
      return null;
    }
    if (
      match.matchType === "mentor_match" &&
      (membership.mentorStatus !== "approved" ||
        !profile.offeringMatchTypes.includes("mentor_match"))
    ) {
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
  options: { matchType?: string; spaceId?: string } = {},
) {
  const [records, introStatusByReceiver] = await Promise.all([
    listMatchTargetRecordsForProfile(profileId, membershipId, {
      matchType: options.matchType,
      spaceId: options.spaceId,
    }),
    options.spaceId
      ? listActiveIntroRequestStatusesForRequesterInSpace(
          options.spaceId,
          membershipId,
        )
      : listActiveIntroRequestStatusesForRequester(membershipId),
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
    if (
      !record.targetProfile ||
      !record.targetMembership ||
      !record.targetProfile.introOptIn
    ) {
      continue;
    }
    if (
      record.match.matchType === "mentor_match" &&
      (record.targetMembership.mentorStatus !== "approved" ||
        !record.targetProfile.offeringMatchTypes.includes("mentor_match"))
    ) {
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

export async function getMatchCardViewsForProfileInSpace(
  spaceId: string,
  profileId: string,
  membershipId: string,
  options: { matchType?: string } = {},
) {
  return getMatchCardViewsForProfile(profileId, membershipId, {
    ...options,
    spaceId,
  });
}

export async function getPostThreadIntroContext(input: {
  postId: string;
  orgId: string;
  spaceId?: string;
  viewerMembershipId?: string;
}): Promise<PostThreadIntroContext> {
  const [thread, introStatusByReceiver, savedPostsById] = await Promise.all([
    input.spaceId
      ? getPostThreadRecordForSpace(input.spaceId, input.postId)
      : getPostThreadRecord(input.postId, input.orgId),
    input.viewerMembershipId
      ? input.spaceId
        ? listActiveIntroRequestStatusesForRequesterInSpace(
            input.spaceId,
            input.viewerMembershipId,
          )
        : listActiveIntroRequestStatusesForRequester(input.viewerMembershipId)
      : Promise.resolve(new Map<string, IntroStatus>()),
    input.viewerMembershipId
      ? input.spaceId
        ? listSavedPostIdsForMembershipInSpace(
            input.spaceId,
            input.viewerMembershipId,
            { postIds: [input.postId] },
          )
        : listSavedPostIdsForMembership(input.viewerMembershipId, {
            postIds: [input.postId],
          })
      : Promise.resolve(new Map()),
  ]);
  if (thread && input.spaceId) {
    const targetIds = [
      ...thread.mentions.map((mention) => mention.membershipId),
      ...thread.comments.flatMap((record) =>
        (record.comment.mentions ?? []).map((mention) => mention.membershipId),
      ),
    ];
    const activeIds = new Set(
      await listMentionableMembershipIdsForSpace(input.spaceId, targetIds),
    );
    thread.mentions = thread.mentions.filter((mention) =>
      activeIds.has(mention.membershipId),
    );
    thread.comments = thread.comments.map((record) => ({
      ...record,
      comment: {
        ...record.comment,
        mentions: (record.comment.mentions ?? []).filter((mention) =>
          activeIds.has(mention.membershipId),
        ),
      },
    }));
  }
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

export async function getPostThreadIntroContextForSpace(input: {
  postId: string;
  orgId: string;
  spaceId: string;
  viewerMembershipId: string;
}) {
  return getPostThreadIntroContext(input);
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
      kind: request.kind,
      status: request.status,
      introPurpose: request.introPurpose,
      note: request.note,
      sourceType: request.sourceType,
      createdAt: request.createdAt,
      respondedAt: request.respondedAt,
      contactDetails: canViewContactDetails(membershipId, request)
        ? acceptedContactDetails(otherProfile)
        : undefined,
      otherParty: toLimitedProfileCard(otherProfile, otherMembership),
      isIncoming,
      suggestedFirstMessage: request.suggestedFirstMessage,
    } satisfies IntroRequestView;
  });
}

export async function getIntroRequestViewsForSpace(
  spaceId: string,
  membershipId: string,
  orgId: string,
  options: IntroRequestViewOptions = {},
) {
  const [space, requests] = await Promise.all([
    getSpaceById(spaceId),
    listIntroRequestsForMembershipInSpace(spaceId, membershipId, options),
  ]);
  const relatedMembershipIds = requests.flatMap((request) => [
    request.requesterMembershipId,
    request.receiverMembershipId,
  ]);
  const membershipRecords = await listMembershipProfileRecordsByIds(
    relatedMembershipIds,
    { orgId },
  );
  const recordByMembershipId = new Map(
    membershipRecords.map((record) => [record.membership.id, record]),
  );

  return requests.map((request) => {
    const isIncoming = request.receiverMembershipId === membershipId;
    const otherRecord = recordByMembershipId.get(
      isIncoming ? request.requesterMembershipId : request.receiverMembershipId,
    );
    if (!otherRecord?.profile) {
      throw new Error("Intro request references a missing member.");
    }
    return {
      id: request.id,
      kind: request.kind,
      spaceId: request.spaceId,
      spaceName: space ? getCommunityDisplayName(space) : undefined,
      spaceSlug: space?.slug,
      status: request.status,
      introPurpose: request.introPurpose,
      note: request.note,
      sourceType: request.sourceType,
      createdAt: request.createdAt,
      respondedAt: request.respondedAt,
      contactDetails: canViewContactDetails(membershipId, request)
        ? acceptedContactDetails(otherRecord.profile)
        : undefined,
      otherParty: toLimitedProfileCard(otherRecord.profile, otherRecord.membership),
      isIncoming,
      suggestedFirstMessage: request.suggestedFirstMessage,
    } satisfies IntroRequestView;
  });
}

export async function getAccountIntroHistoryViews(
  membershipId: string,
  orgId: string,
  accessibleSpaces: Space[],
  options: IntroRequestViewOptions = {},
) {
  const requests = await listIntroRequestsForMembershipWithSpaceAccess(
    membershipId,
    accessibleSpaces.map((space) => space.id),
    options,
  );
  const historySpaceIds = [
    ...new Set(requests.map((request) => request.spaceId).filter(Boolean)),
  ] as string[];
  const historySpaces = await Promise.all(historySpaceIds.map(getSpaceById));
  const nameBySpaceId = new Map(
    [...accessibleSpaces, ...historySpaces.filter((space): space is Space => Boolean(space))]
      .map((space) => [space.id, getCommunityDisplayName(space)]),
  );
  const slugBySpaceId = new Map(
    [...accessibleSpaces, ...historySpaces.filter((space): space is Space => Boolean(space))]
      .map((space) => [space.id, space.slug]),
  );
  const relatedMembershipIds = requests.flatMap((request) => [
    request.requesterMembershipId,
    request.receiverMembershipId,
  ]);
  const membershipRecords = await listMembershipProfileRecordsByIds(
    relatedMembershipIds,
    { orgId },
  );
  const recordByMembershipId = new Map(
    membershipRecords.map((record) => [record.membership.id, record]),
  );
  return requests.flatMap((request) => {
    const isIncoming = request.receiverMembershipId === membershipId;
    const otherRecord = recordByMembershipId.get(
      isIncoming ? request.requesterMembershipId : request.receiverMembershipId,
    );
    if (!otherRecord?.profile) return [];
    return [{
      id: request.id,
      kind: request.kind,
      spaceId: request.spaceId,
      spaceName: request.spaceId
        ? nameBySpaceId.get(request.spaceId)
        : undefined,
      spaceSlug: request.spaceId
        ? slugBySpaceId.get(request.spaceId)
        : undefined,
      status: request.status,
      introPurpose: request.introPurpose,
      note: request.note,
      sourceType: request.sourceType,
      createdAt: request.createdAt,
      respondedAt: request.respondedAt,
      contactDetails: canViewContactDetails(membershipId, request)
        ? acceptedContactDetails(otherRecord.profile)
        : undefined,
      otherParty: toLimitedProfileCard(otherRecord.profile, otherRecord.membership),
      isIncoming,
      suggestedFirstMessage: request.suggestedFirstMessage,
    } satisfies IntroRequestView];
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
        spaceId: notification.spaceId,
        title: notification.title,
        body: notification.body,
        createdAt: notification.createdAt,
        link: notification.link,
        readAt: notification.readAt,
      }) satisfies NotificationView,
  );
}

export async function getNotificationViewsForSpace(
  spaceId: string,
  membershipId: string,
  options: { limit?: number } = {},
) {
  const [space, notifications] = await Promise.all([
    getSpaceById(spaceId),
    listNotificationsForMembershipInSpace(spaceId, membershipId, options),
  ]);
  return notifications.map(
    (notification) => ({
        id: notification.id,
        spaceId: notification.spaceId,
        spaceName: space ? getCommunityDisplayName(space) : undefined,
        title: notification.title,
        body: notification.body,
        createdAt: notification.createdAt,
        link: notification.link,
        readAt: notification.readAt,
      }) satisfies NotificationView,
  );
}

export async function getAccountInboxNotificationViews(
  membershipId: string,
  accessibleSpaces: Space[],
  options: { limit?: number } = {},
) {
  const nameBySpaceId = new Map(
    accessibleSpaces.map((space) => [space.id, getCommunityDisplayName(space)]),
  );
  const notifications = await listNotificationsForMembershipWithSpaceAccess(
    membershipId,
    accessibleSpaces.map((space) => space.id),
    options,
  );
  return notifications.map(
    (notification) => ({
      id: notification.id,
      spaceId: notification.spaceId,
      spaceName: notification.spaceId
        ? nameBySpaceId.get(notification.spaceId)
        : undefined,
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
  const postIds = posts.map((post) => post.id);
  const [images, previews, mentions] = await Promise.all([
    listPostImagesForPostIds(postIds, { includeRemoved: true, includeUnready: true }),
    listPostLinkPreviewsForPostIds(postIds, {
      includeRemoved: true,
      includeUnready: true,
    }),
    listPostMentionsForPostIds(postIds),
  ]);
  const authorMembershipIds = [
    ...posts.map((post) => post.authorMembershipId),
    ...commentRecords.map((record) => record.comment.authorMembershipId),
    ...mentions.map((mention) => mention.mentionedMembershipId),
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
      spaceId: post.spaceId,
      title: post.title,
      body: post.body,
      type: post.type,
      updatedAt: post.updatedAt,
      opportunitySource: post.opportunitySource,
      tags: post.tags,
      relatedStartupName: post.relatedStartupName,
      relatedRolesNeeded: post.relatedRolesNeeded,
      featured: post.featured,
      hidden: post.hidden,
      commentsLocked: post.commentsLocked,
      status: post.status,
      authorName: nameForMembership(post.authorMembershipId),
      images: images
        .filter((image) => image.postId === post.id && image.uploadStatus === "ready")
        .sort((left, right) => left.position - right.position)
        .map((image) => ({
          id: image.id,
          url: `/api/post-images/${image.id}`,
          width: image.width ?? 1,
          height: image.height ?? 1,
          alt: image.alt?.trim() || "Post image",
          moderationStatus: image.moderationStatus,
        })),
      linkPreview: (() => {
        const preview = previews.find(
          (candidate) => candidate.postId === post.id && candidate.fetchStatus === "ready",
        );
        if (!preview) return undefined;
        let domain = preview.originalUrl;
        try {
          domain = new URL(preview.originalUrl).hostname;
        } catch {
          // Keep the stored URL visible to moderators if a legacy row is malformed.
        }
        return {
          id: preview.id,
          url: preview.originalUrl,
          domain,
          title: preview.title,
          moderationStatus: preview.moderationStatus,
        };
      })(),
      mentions: mentions
        .filter((mention) => mention.postId === post.id)
        .map((mention) => ({
          id: mention.id,
          label: mention.label,
          memberName: nameForMembership(mention.mentionedMembershipId),
        })),
    })),
    comments: commentRecords.map((record) => ({
      id: record.comment.id,
      spaceId: record.post?.spaceId,
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
      spaceId: options.spaceId,
      sourceType: options.sourceType,
      status: options.requestStatus,
    }),
    options.spaceId
      ? listActiveSpaceMemberRecords(options.spaceId)
      : Promise.resolve([]),
  ]);
  const eligibleCandidateRecords = candidateRecords
    .filter(
      (record) =>
        record.membership.orgId === orgId &&
        record.profile?.introOptIn &&
        getProfileReadiness(record.profile).isReady,
    )
    .slice(0, options.candidateLimit ?? 100);
  const recordByMembershipId = new Map<string, MembershipRecord>(
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
      spaceId: request.spaceId,
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
  slug = "wavesparks",
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
        ? "Your profile is ready for matches and introductions."
        : "Add the remaining profile details before browsing members or requesting introductions.",
      complete: readiness.isReady,
      href: `/org/${slug}/onboarding`,
      cta: readiness.isReady ? "Review profile" : "Finish profile",
    },
    {
      id: "post",
      label: "Make your first post",
      description: hasPost
        ? "You have shared something the community can respond to."
        : "Share an update, ask a question, or post something useful to the community.",
      complete: hasPost,
      href: `/org/${slug}/compose?kind=feed`,
      cta: hasPost ? "Create another post" : "Create post",
    },
    {
      id: "matches",
      label: "Browse your matches",
      description: hasMatchOrFollow
        ? "Explore your matches and start a conversation."
        : "Browse suggested members and follow the people you would like to hear from.",
      complete: hasMatchOrFollow,
      href: `/org/${slug}/matches`,
      cta: "Open matches",
    },
    {
      id: "intro",
      label: "Request an introduction",
      description: hasRequestedIntro
        ? "You have sent your first introduction request."
        : "Request an introduction from a match or post. Contact details stay private until it is accepted.",
      complete: hasRequestedIntro,
      href: hasRequestedIntro
        ? `/org/${slug}/requests`
        : hasMatchOrFollow
          ? `/org/${slug}/matches`
          : `/org/${slug}/requests`,
      cta: hasRequestedIntro ? "View introductions" : "Request introduction",
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

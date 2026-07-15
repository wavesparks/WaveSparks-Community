import { createHash } from "node:crypto";

import { nanoid } from "nanoid";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db/client";
import * as dbSchema from "@/db/schema";
import {
  seedAnalyticsEvents,
  seedComments,
  seedFollows,
  seedIntroRequests,
  seedMatchTypeConfigs,
  seedMemberships,
  seedNotifications,
  seedOrganization,
  seedPostSaves,
  seedPosts,
  seedProfileLinks,
  seedProfiles,
  seedUsers,
} from "@/data/seed-data";
import { env, isBootstrapAdminEmail } from "@/lib/env";
import { localRoleFromClerkRole } from "@/lib/clerk-roles";
import {
  getCommunityDisplayName,
  WAVESPARKS_COMMUNITY_NAME,
} from "@/lib/community-copy";
import { sanitizeMatchFeedbackReasons } from "@/lib/match-feedback";
import {
  buildDailySeriesFromCounts,
  buildOrgAnalyticsSnapshot,
  dailySeriesStartDate,
} from "@/server/analytics";
import {
  buildMatchingEmbeddingTexts,
  buildSpaceIntentEmbeddingTexts,
  isSpaceMatchingMemberEligible,
  recomputeMatchesForSpaceMembers,
  spaceAllowsMatching,
  type SpaceMatchingMember,
} from "@/server/matching";
import { spaceLifecycleAllowsMemberAccess } from "@/server/space-permissions";
import {
  buildLocalEmbedding,
  generateEmbeddingVectors,
  hasConfiguredEmbeddingProvider,
  LOCAL_EMBEDDING_MODEL,
  MATCHING_EMBEDDING_DIMENSIONS,
  MATCHING_EMBEDDING_MODEL,
} from "@/server/embeddings";
import type {
  AccountStatus,
  AnalyticsEvent,
  Cohort,
  CohortMember,
  CohortMemberStatus,
  Comment,
  Follow,
  IntroRequest,
  IntroStatus,
  MatchRecord,
  MatchFeedback,
  MatchFeedbackSummary,
  MatchRun,
  MatchType,
  MatchTypeConfig,
  AffiliationType,
  ClerkOrgRole,
  ClerkInvitationStatus,
  Membership,
  MembershipRole,
  MembershipStatus,
  Notification,
  OpportunitySource,
  OrgAnalyticsSnapshot,
  Organization,
  Post,
  PostSave,
  PostType,
  Profile,
  ProfileLink,
  Space,
  SpaceAccessStatus,
  SpaceIntent,
  SpaceJoinSource,
  SpaceLifecycle,
  SpaceMembership,
  User,
} from "@/lib/domain";

interface PasswordCredential {
  id: string;
  userId: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  updatedAt: string;
}

interface ClerkWebhookEventRecord {
  id: string;
  eventType: string;
  createdAt: string;
}

export interface StoreState {
  organizations: Organization[];
  users: User[];
  passwordCredentials: PasswordCredential[];
  clerkWebhookEvents: ClerkWebhookEventRecord[];
  cohorts: Cohort[];
  cohortMembers: CohortMember[];
  memberships: Membership[];
  spaces: Space[];
  spaceMemberships: SpaceMembership[];
  spaceIntents: SpaceIntent[];
  profiles: Profile[];
  profileLinks: ProfileLink[];
  posts: Post[];
  comments: Comment[];
  follows: Follow[];
  postSaves: PostSave[];
  matchTypeConfigs: MatchTypeConfig[];
  matches: MatchRecord[];
  matchRuns: MatchRun[];
  matchFeedback: MatchFeedback[];
  introRequests: IntroRequest[];
  notifications: Notification[];
  analyticsEvents: AnalyticsEvent[];
}

const spaceScopedNotificationTypes = new Set<Notification["type"]>([
  "intro_requested",
  "intro_accepted",
  "intro_declined",
  "manual_intro",
]);

export interface AdminOverviewData {
  analytics: OrgAnalyticsSnapshot;
  recentPosts: Post[];
  recentRequests: IntroRequest[];
}

export interface PublicOrgStats {
  approvedMembers: number;
  introRequestsAccepted: number;
}

export interface SpaceAuditMetrics {
  posts: number;
  visibleComments: number;
  follows: number;
  savedPosts: number;
  notifications: number;
  introRequests: number;
  pendingIntroRequests: number;
  matches: number;
  visibleMatches: number;
}

export interface CohortRecord {
  cohort: Cohort;
  totalMembers: number;
  needsDecisionMembers: number;
  activeMembers: number;
  needsAttentionMembers: number;
  /** @deprecated Use needsDecisionMembers. */
  invitedMembers: number;
  /** @deprecated Use activeMembers. */
  promotedMembers: number;
}

export interface CohortMemberRecord {
  cohortMember: CohortMember;
  membership: Membership;
  user?: User;
  profile?: Profile;
}

export interface CohortImportInput {
  email: string;
  name?: string;
}

export interface CohortImportResult {
  cohortMember: CohortMember;
  membership: Membership;
  user?: User;
  profile?: Profile;
  membershipCreated: boolean;
  cohortMemberCreated: boolean;
  shouldInvite: boolean;
}

export interface CohortPromotionResult {
  cohortMember: CohortMember;
  membership: Membership;
  profile?: Profile;
  statusChanged: boolean;
}

export interface MembershipRecord {
  membership: Membership;
  user?: User;
  profile?: Profile;
}

export interface SpaceMembershipRecord {
  space: Space;
  spaceMembership: SpaceMembership;
}

export interface ActiveSpaceMemberRecord {
  spaceMembership: SpaceMembership;
  membership: Membership;
  user?: User;
  profile?: Profile;
  intent?: SpaceIntent;
}

export type MemberWorkspaceInvitationStatus =
  | ClerkInvitationStatus
  | "connected"
  | "not_invited";

export interface MemberWorkspaceRecord extends MembershipRecord {
  spaces: SpaceMembershipRecord[];
  /** @deprecated Read Space access from `spaces`. */
  cohorts: Cohort[];
}

export interface MemberWorkspaceOptions {
  query?: string;
  accountStatus?: AccountStatus;
  spaceId?: string;
  /** @deprecated Membership status is retained only during the Space rollout. */
  status?: MembershipStatus;
  invitationStatus?: MemberWorkspaceInvitationStatus;
  /** @deprecated Use `spaceId`. Legacy Event Space ids equal cohort ids. */
  cohortId?: string;
  page?: number;
  pageSize?: number;
}

export interface MemberWorkspacePage {
  records: MemberWorkspaceRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface BulkMemberImportInput {
  email: string;
  name?: string;
  rowNumber?: number;
}

export interface MemberImportCandidateRecord {
  email: string;
  user?: User;
  membership?: Membership;
  space?: Space;
  spaceMembership?: SpaceMembership;
  inSpace?: boolean;
  /** @deprecated Read `spaceMembership`. */
  cohortMember?: CohortMember;
  /** @deprecated Read `inSpace`. */
  inCohort: boolean;
}

export interface BulkMemberImportResult {
  input: {
    email: string;
    name: string;
    rowNumber?: number;
  };
  user: User;
  membership: Membership;
  spaceMembership?: SpaceMembership;
  spaceMembershipCreated: boolean;
  spaceMembershipUpdated: boolean;
  cohortMember?: CohortMember;
  membershipCreated: boolean;
  cohortMemberCreated: boolean;
  classification: "created" | "existing" | "conflict";
  conflictReason?: "account_suspended" | "deprovisioned" | "rejected" | "suspended" | "removed";
  shouldInvite: boolean;
}

export type SpaceMembershipGrantOutcome =
  | "added"
  | "activated_waitlist"
  | "already_active"
  | "already_waitlisted"
  | "conflict";

export interface SpaceMembershipGrantResult {
  space: Space;
  spaceMembership: SpaceMembership;
  created: boolean;
  updated: boolean;
  outcome: SpaceMembershipGrantOutcome;
  conflictStatus?: Extract<SpaceAccessStatus, "rejected" | "suspended" | "removed">;
}

export interface AddToMainCommunityResult {
  membershipId: string;
  status: "added" | "already_in_main" | "account_conflict" | "failed";
  message: string;
  spaceMembership?: SpaceMembership;
}

export interface ProfileRecord {
  profile: Profile;
  membership?: Membership;
  user?: User;
}

export interface CommentRecord {
  comment: Comment;
  post?: Post;
}

export interface PostThreadCommentRecord {
  comment: Comment;
  membership?: Membership;
  profile?: Profile;
}

export interface PostThreadRecord {
  post: Post;
  author?: MembershipRecord;
  comments: PostThreadCommentRecord[];
}

export interface PublicFeedPostRecord {
  post: Post;
  membership: Membership;
  profile: Profile;
  commentCount: number;
}

export interface MemberActivationSignals {
  hasPost: boolean;
  hasFollow: boolean;
  hasVisibleMatch: boolean;
  hasRequestedIntro: boolean;
}

export interface MatchProfileRecord {
  match: MatchRecord;
  sourceProfile?: Profile;
  targetProfile?: Profile;
}

export interface MatchTargetRecord {
  match: MatchRecord;
  targetMembership?: Membership;
  targetProfile?: Profile;
  following: boolean;
}

interface TimeOrderedListOptions {
  spaceId?: string;
  limit?: number;
  orderBy?: "created_desc" | "none";
}

interface MembershipRecordListOptions extends TimeOrderedListOptions {
  status?: MembershipStatus;
  statuses?: MembershipStatus[];
}

interface MembershipProfileRecordListOptions extends TimeOrderedListOptions {
  status?: MembershipStatus;
  statuses?: MembershipStatus[];
  profileRequired?: boolean;
  featured?: boolean;
  stale?: boolean;
}

type IntroRequestDirection = "incoming" | "outgoing";

interface IntroRequestListOptions extends TimeOrderedListOptions {
  direction?: IntroRequestDirection;
  status?: IntroStatus;
}

interface OrgIntroRequestListOptions extends TimeOrderedListOptions {
  spaceId?: string;
  status?: IntroStatus;
  sourceType?: IntroRequest["sourceType"];
}

interface MatchProfileRecordListOptions {
  spaceId?: string;
  limit?: number;
  matchType?: MatchType;
  scoreBand?: MatchRecord["scoreBand"];
}

interface PostListOptions extends TimeOrderedListOptions {
  hidden?: boolean;
  types?: PostType[];
  opportunitySources?: OpportunitySource[];
}

interface VisibleCommentCountOptions {
  spaceId?: string;
  postIds?: string[];
}

function positiveIntegerLimit(value?: number) {
  return value && value > 0 ? Math.floor(value) : undefined;
}

function positiveInteger(value: number | undefined, fallback: number) {
  return value && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

declare global {
  var __wavesparksStore: StoreState | undefined;
}

const usesDatabase = Boolean(env.databaseUrl);

export function defaultMainSpaceIdForOrg(orgId: string) {
  return `spc_main_${createHash("md5").update(orgId).digest("hex")}`;
}

function defaultMainSpaceForOrg(organization: Organization): Space {
  const createdAt = organization.createdAt;
  return {
    id: defaultMainSpaceIdForOrg(organization.id),
    orgId: organization.id,
    slug: "main",
    kind: "main",
    lifecycle: "active",
    name: WAVESPARKS_COMMUNITY_NAME,
    description: organization.description,
    eventLabel: "Community",
    matchingEnabled: true,
    createdAt,
    updatedAt: createdAt,
  };
}

function defaultIntentForProfile(
  space: Space,
  membership: Membership,
  profile: Profile,
): SpaceIntent {
  const lookingFor = [...new Set([...profile.desiredRoles, ...profile.helpNeededTags])];
  const offers = [
    ...new Set([
      ...profile.skillTags,
      ...profile.topStrengths,
      ...profile.canContribute,
      ...profile.mentorOffers,
    ]),
  ];
  const base: SpaceIntent = {
    id: `intent_${space.id}_${membership.id}`,
    orgId: space.orgId,
    spaceId: space.id,
    membershipId: membership.id,
    currentGoal: profile.idealMatchDescription || profile.startupOneLiner,
    lookingFor,
    offers,
    matchingOptIn: profile.profileVisibleInMatching,
    intentComplete: Boolean(
      profile.onboardingComplete &&
        (profile.seekingMatchTypes.length || profile.offeringMatchTypes.length),
    ),
    seekingText: "",
    offeringText: "",
    seekingEmbedding: profile.seekingEmbedding,
    offeringEmbedding: profile.offeringEmbedding,
    embeddingModel: profile.embeddingModel,
    embeddingSourceHash: profile.embeddingSourceHash,
    embeddingStatus: profile.embeddingStatus,
    embeddingError: profile.embeddingError,
    embeddingUpdatedAt: profile.embeddingUpdatedAt,
    createdAt: membership.createdAt,
    updatedAt: profile.updatedAt,
  };
  const texts = buildSpaceIntentEmbeddingTexts(profile, base);
  base.seekingText = texts.seekingText;
  base.offeringText = texts.offeringText;
  return base;
}

function defaultSpaceState(
  organization: Organization,
  memberships: Membership[],
  profiles: Profile[],
) {
  const mainSpace = defaultMainSpaceForOrg(organization);
  const eligibleMemberships = memberships.filter(
    (membership) =>
      membership.orgId === organization.id &&
      membership.accountStatus === "connected" &&
      membership.status === "approved",
  );
  const activeMembershipIds = new Set(
    eligibleMemberships.map((membership) => membership.id),
  );
  const spaceMemberships = eligibleMemberships.map<SpaceMembership>((membership) => ({
    id: `space_member_${mainSpace.id}_${membership.id}`,
    orgId: organization.id,
    spaceId: mainSpace.id,
    membershipId: membership.id,
    accessStatus: "active",
    joinedVia: "migration",
    grantedAt: membership.approvedAt ?? membership.createdAt,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  }));
  const membershipById = new Map(
    eligibleMemberships.map((membership) => [membership.id, membership]),
  );
  const spaceIntents = profiles
    .filter((profile) => activeMembershipIds.has(profile.membershipId))
    .map((profile) =>
      defaultIntentForProfile(mainSpace, membershipById.get(profile.membershipId)!, profile),
    );

  return { mainSpace, spaceMemberships, spaceIntents };
}

function initializeStore(): StoreState {
  const memberships = structuredClone(seedMemberships);
  const profiles = structuredClone(seedProfiles);
  const { mainSpace, spaceMemberships, spaceIntents } = defaultSpaceState(
    seedOrganization,
    memberships,
    profiles,
  );
  const base: StoreState = {
    organizations: structuredClone([seedOrganization]),
    users: structuredClone(seedUsers),
    passwordCredentials: [],
    clerkWebhookEvents: [],
    cohorts: [],
    cohortMembers: [],
    memberships,
    spaces: [mainSpace],
    spaceMemberships,
    spaceIntents,
    profiles,
    profileLinks: structuredClone(seedProfileLinks),
    posts: structuredClone(seedPosts).map((post) => ({ ...post, spaceId: mainSpace.id })),
    comments: structuredClone(seedComments),
    follows: structuredClone(seedFollows).map((follow) => ({
      ...follow,
      spaceId: mainSpace.id,
    })),
    postSaves: structuredClone(seedPostSaves),
    matchTypeConfigs: structuredClone(seedMatchTypeConfigs),
    matches: [],
    matchRuns: [],
    matchFeedback: [],
    introRequests: structuredClone(seedIntroRequests).map((request) => ({
      ...request,
      spaceId: mainSpace.id,
    })),
    notifications: structuredClone(seedNotifications).map((notification) => ({
      ...notification,
      ...(
        notification.type === "membership_approved" || notification.type === "admin_note"
          ? {}
          : { spaceId: mainSpace.id }
      ),
    })),
    analyticsEvents: structuredClone(seedAnalyticsEvents).map((event) => ({
      ...event,
      spaceId: mainSpace.id,
    })),
  };

  const intentByMembershipId = new Map(
    spaceIntents.map((intent) => [intent.membershipId, intent]),
  );
  const spaceMembershipByMembershipId = new Map(
    spaceMemberships.map((spaceMembership) => [
      spaceMembership.membershipId,
      spaceMembership,
    ]),
  );
  const membershipById = new Map(memberships.map((membership) => [membership.id, membership]));
  base.matches = recomputeMatchesForSpaceMembers(
    seedOrganization,
    mainSpace,
    profiles.flatMap((profile) => {
      const membership = membershipById.get(profile.membershipId);
      const spaceMembership = spaceMembershipByMembershipId.get(profile.membershipId);
      const intent = intentByMembershipId.get(profile.membershipId);
      return membership && spaceMembership && intent
        ? [{ membership, profile, spaceMembership, intent }]
        : [];
    }),
    base.matchTypeConfigs,
  );

  return base;
}

function ensureStoreShape(store: StoreState) {
  store.follows ??= structuredClone(seedFollows);
  store.postSaves ??= structuredClone(seedPostSaves);
  store.passwordCredentials ??= [];
  store.clerkWebhookEvents ??= [];
  store.cohorts ??= [];
  store.cohortMembers ??= [];
  if (!store.spaces || !store.spaceMemberships || !store.spaceIntents) {
    const organization = store.organizations[0] ?? seedOrganization;
    const fallback = defaultSpaceState(
      organization,
      store.memberships,
      store.profiles,
    );
    store.spaces ??= [fallback.mainSpace];
    store.spaceMemberships ??= fallback.spaceMemberships;
    store.spaceIntents ??= fallback.spaceIntents;
  }
  const mainSpace = store.spaces.find((space) => space.kind === "main");
  if (mainSpace) {
    for (const post of store.posts) post.spaceId ??= mainSpace.id;
    for (const follow of store.follows) follow.spaceId ??= mainSpace.id;
    for (const match of store.matches) match.spaceId ??= mainSpace.id;
    for (const run of store.matchRuns) run.spaceId ??= mainSpace.id;
    for (const feedback of store.matchFeedback) feedback.spaceId ??= mainSpace.id;
    for (const request of store.introRequests) request.spaceId ??= mainSpace.id;
    for (const notification of store.notifications) {
      if (
        notification.type !== "membership_approved" &&
        notification.type !== "admin_note"
      ) {
        notification.spaceId ??= mainSpace.id;
      }
    }
    for (const event of store.analyticsEvents) event.spaceId ??= mainSpace.id;
  }
  store.matchTypeConfigs ??= structuredClone(seedMatchTypeConfigs);
  store.matchRuns ??= [];
  store.matchFeedback ??= [];
  return store;
}

export function getStore() {
  if (!globalThis.__wavesparksStore) {
    globalThis.__wavesparksStore = initializeStore();
  }

  return ensureStoreShape(globalThis.__wavesparksStore);
}

export function resetStore() {
  globalThis.__wavesparksStore = initializeStore();
  return globalThis.__wavesparksStore;
}

function maybeIso(value?: Date | string | null) {
  return value ? new Date(value).toISOString() : undefined;
}

function requiredIso(value: Date | string) {
  return new Date(value).toISOString();
}

function maybeDate(value?: string) {
  return value ? new Date(value) : undefined;
}

function organizationFromRow(row: typeof dbSchema.organizations.$inferSelect): Organization {
  const organization = {
    id: row.id,
    clerkOrgId: row.clerkOrgId ?? undefined,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logoUrl,
    theme: row.themeJson,
    tagline: row.tagline,
    description: row.description,
    membershipRules: row.membershipRules,
    allowedDomains: row.allowedDomains,
    inviteSettings: row.inviteSettings,
    status: row.status as Organization["status"],
    createdAt: requiredIso(row.createdAt),
  };

  return organization.id === seedOrganization.id
    ? {
        ...organization,
        allowedDomains: organization.allowedDomains.map((domain) =>
          domain === "wavespark.co" ? "wavesparks.co" : domain,
        ),
        name: seedOrganization.name,
        slug: seedOrganization.slug,
      }
    : organization;
}

function organizationSlugCandidates(slug: string) {
  return slug === seedOrganization.slug || slug === "wavespark"
    ? [seedOrganization.slug, "wavespark"]
    : [slug];
}

function userFromRow(row: typeof dbSchema.users.$inferSelect): User {
  return {
    id: row.id,
    clerkUserId: row.clerkUserId ?? undefined,
    email: row.email,
    name: row.name,
    imageUrl: row.imageUrl,
    platformRole: row.platformRole,
    anonymizedAt: maybeIso(row.anonymizedAt),
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function membershipFromRow(row: typeof dbSchema.memberships.$inferSelect): Membership {
  return {
    id: row.id,
    clerkMembershipId: row.clerkMembershipId ?? undefined,
    clerkRole: row.clerkRole as ClerkOrgRole | undefined,
    clerkInvitationId: row.clerkInvitationId ?? undefined,
    clerkInvitationStatus:
      (row.clerkInvitationStatus as ClerkInvitationStatus | null) ?? undefined,
    clerkInvitationError: row.clerkInvitationError ?? undefined,
    clerkInvitationUpdatedAt: maybeIso(row.clerkInvitationUpdatedAt),
    orgId: row.orgId,
    userId: row.userId,
    role: row.role,
    accountStatus: row.accountStatus,
    affiliationType: row.affiliationType as Membership["affiliationType"],
    status: row.status,
    archetypes: row.archetypes,
    programName: row.programName,
    cohortNameOrYear: row.cohortNameOrYear,
    invitedByUserId: row.invitedByUserId ?? undefined,
    approvalNote: row.approvalNote ?? undefined,
    approvedAt: maybeIso(row.approvedAt),
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function cohortFromRow(row: typeof dbSchema.cohorts.$inferSelect): Cohort {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    description: row.description,
    eventLabel: row.eventLabel,
    status: row.status as Cohort["status"],
    createdByMembershipId: row.createdByMembershipId ?? undefined,
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function cohortMemberFromRow(row: typeof dbSchema.cohortMembers.$inferSelect): CohortMember {
  return {
    id: row.id,
    orgId: row.orgId,
    cohortId: row.cohortId,
    membershipId: row.membershipId,
    invitedEmail: row.invitedEmail,
    invitedName: row.invitedName,
    status: row.status as CohortMemberStatus,
    invitedAt: requiredIso(row.invitedAt),
    promotedAt: maybeIso(row.promotedAt),
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function spaceFromRow(row: typeof dbSchema.spaces.$inferSelect): Space {
  return {
    id: row.id,
    orgId: row.orgId,
    slug: row.slug,
    kind: row.kind,
    lifecycle: row.lifecycle,
    name: row.name,
    description: row.description,
    eventLabel: row.eventLabel,
    startsAt: maybeIso(row.startsAt),
    endsAt: maybeIso(row.endsAt),
    endedAt: maybeIso(row.endedAt),
    archivedAt: maybeIso(row.archivedAt),
    matchingEnabled: row.matchingEnabled,
    createdByMembershipId: row.createdByMembershipId ?? undefined,
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function spaceMembershipFromRow(
  row: typeof dbSchema.spaceMemberships.$inferSelect,
): SpaceMembership {
  return {
    id: row.id,
    orgId: row.orgId,
    spaceId: row.spaceId,
    membershipId: row.membershipId,
    accessStatus: row.accessStatus,
    joinedVia: row.joinedVia,
    invitedByMembershipId: row.invitedByMembershipId ?? undefined,
    sourceSpaceId: row.sourceSpaceId ?? undefined,
    decisionNote: row.decisionNote ?? undefined,
    grantedAt: maybeIso(row.grantedAt),
    removedAt: maybeIso(row.removedAt),
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function spaceIntentFromRow(row: typeof dbSchema.spaceIntents.$inferSelect): SpaceIntent {
  return {
    id: row.id,
    orgId: row.orgId,
    spaceId: row.spaceId,
    membershipId: row.membershipId,
    currentGoal: row.currentGoal,
    lookingFor: row.lookingFor,
    offers: row.offers,
    matchingOptIn: row.matchingOptIn,
    intentComplete: row.intentComplete,
    seekingText: row.seekingText,
    offeringText: row.offeringText,
    seekingEmbedding: row.seekingEmbedding ?? undefined,
    offeringEmbedding: row.offeringEmbedding ?? undefined,
    embeddingModel: row.embeddingModel ?? undefined,
    embeddingSourceHash: row.embeddingSourceHash ?? undefined,
    embeddingStatus: row.embeddingStatus as SpaceIntent["embeddingStatus"],
    embeddingError: row.embeddingError ?? undefined,
    embeddingUpdatedAt: maybeIso(row.embeddingUpdatedAt),
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function profileFromRow(row: typeof dbSchema.profiles.$inferSelect): Profile {
  return {
    id: row.id,
    membershipId: row.membershipId,
    fullName: row.fullName,
    preferredName: row.preferredName,
    displayNamePreference: row.displayNamePreference,
    profilePhoto: row.profilePhoto,
    headline: row.headline,
    shortBio: row.shortBio,
    longBio: row.longBio,
    bio: row.bio,
    problemInterest: row.problemInterest,
    currentFocus: row.currentFocus,
    technicalExperienceLevel: row.technicalExperienceLevel,
    technicalExperience: row.technicalExperience,
    city: row.city,
    country: row.country,
    timezone: row.timezone,
    schoolOrCompany: row.schoolOrCompany,
    currentStatus: row.currentStatus,
    startupName: row.startupName,
    startupOneLiner: row.startupOneLiner,
    startupDescription: row.startupDescription,
    stage: row.stage,
    industryTags: row.industryTags,
    problemSpaceTags: row.problemSpaceTags,
    businessModelTags: row.businessModelTags,
    currentProgress: row.currentProgress,
    tractionSummary: row.tractionSummary,
    regionFocus: row.regionFocus,
    lookingForTypes: row.lookingForTypes,
    seekingMatchTypes: row.seekingMatchTypes,
    offeringMatchTypes: row.offeringMatchTypes,
    desiredRoles: row.desiredRoles,
    helpNeededTags: row.helpNeededTags,
    idealMatchDescription: row.idealMatchDescription,
    skillTags: row.skillTags,
    yearsOfExperience: row.yearsOfExperience,
    topStrengths: row.topStrengths,
    canContribute: row.canContribute,
    priorProjects: row.priorProjects,
    notableWins: row.notableWins,
    timeCommitment: row.timeCommitment,
    availabilityStart: row.availabilityStart,
    remotePreference: row.remotePreference,
    preferredGeographies: row.preferredGeographies,
    meetingFrequencyPreference: row.meetingFrequencyPreference,
    ambitionLevel: row.ambitionLevel,
    riskTolerance: row.riskTolerance,
    speedPreference: row.speedPreference,
    decisionStyle: row.decisionStyle,
    workStyle: row.workStyle,
    communicationStyle: row.communicationStyle,
    conflictStyle: row.conflictStyle,
    commitmentHorizon: row.commitmentHorizon,
    missionVsMarketOrientation: row.missionVsMarketOrientation,
    structureVsChaos: row.structureVsChaos,
    mentorExpertiseTags: row.mentorExpertiseTags,
    mentorStageExperience: row.mentorStageExperience,
    mentorFunctionalStrengths: row.mentorFunctionalStrengths,
    mentorAvailability: row.mentorAvailability,
    mentorOffers: row.mentorOffers,
    maxMentees: row.maxMentees,
    mentorshipPreferences: row.mentorshipPreferences,
    publicContactEnabled: row.publicContactEnabled,
    emailForIntro: row.emailForIntro,
    whatsappNumber: row.whatsappNumber,
    whatsappVisibleAfterAccept: row.whatsappVisibleAfterAccept,
    introOptIn: row.introOptIn,
    profileVisibleInMatching: row.profileVisibleInMatching,
    profileCompletionPercent: row.profileCompletionPercent,
    lastActiveAt: requiredIso(row.lastActiveAt),
    featured: row.featured,
    stale: row.stale,
    onboardingComplete: row.onboardingComplete,
    seekingEmbeddingText: row.seekingEmbeddingText,
    offeringEmbeddingText: row.offeringEmbeddingText,
    seekingEmbedding: row.seekingEmbedding ?? undefined,
    offeringEmbedding: row.offeringEmbedding ?? undefined,
    embeddingModel: row.embeddingModel ?? undefined,
    embeddingSourceHash: row.embeddingSourceHash ?? undefined,
    embeddingStatus: row.embeddingStatus as Profile["embeddingStatus"],
    embeddingError: row.embeddingError ?? undefined,
    embeddingUpdatedAt: maybeIso(row.embeddingUpdatedAt),
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function profileLinkFromRow(row: typeof dbSchema.profileLinks.$inferSelect): ProfileLink {
  return {
    id: row.id,
    profileId: row.profileId,
    type: row.type as ProfileLink["type"],
    url: row.url,
  };
}

function postFromRow(row: typeof dbSchema.posts.$inferSelect): Post {
  return {
    id: row.id,
    orgId: row.orgId,
    spaceId: row.spaceId ?? undefined,
    authorMembershipId: row.authorMembershipId,
    type: row.type,
    opportunitySource: row.opportunitySource ?? undefined,
    title: row.title,
    body: row.body,
    tags: row.tags,
    relatedStartupName: row.relatedStartupName ?? undefined,
    relatedRolesNeeded: row.relatedRolesNeeded,
    visibility: row.visibility as Post["visibility"],
    status: row.status,
    featured: row.featured,
    hidden: row.hidden,
    commentsLocked: row.commentsLocked,
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function followFromRow(row: typeof dbSchema.follows.$inferSelect): Follow {
  return {
    id: row.id,
    orgId: row.orgId,
    spaceId: row.spaceId ?? undefined,
    followerMembershipId: row.followerMembershipId,
    followedMembershipId: row.followedMembershipId,
    createdAt: requiredIso(row.createdAt),
  };
}

function postSaveFromRow(row: typeof dbSchema.postSaves.$inferSelect): PostSave {
  return {
    id: row.id,
    orgId: row.orgId,
    membershipId: row.membershipId,
    postId: row.postId,
    createdAt: requiredIso(row.createdAt),
  };
}

function commentFromRow(row: typeof dbSchema.comments.$inferSelect): Comment {
  return {
    id: row.id,
    postId: row.postId,
    authorMembershipId: row.authorMembershipId,
    body: row.body,
    status: row.status,
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function matchTypeConfigFromRow(
  row: typeof dbSchema.matchTypeConfigs.$inferSelect,
): MatchTypeConfig {
  return {
    id: row.id,
    orgId: row.orgId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    direction: row.direction as MatchTypeConfig["direction"],
    seekerLabel: row.seekerLabel,
    providerLabel: row.providerLabel,
    weights: row.weightsJson,
    minimumScore: row.minimumScore,
    active: row.active,
    version: row.version,
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function matchFromRow(row: typeof dbSchema.matches.$inferSelect): MatchRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    spaceId: row.spaceId ?? undefined,
    sourceProfileId: row.sourceProfileId,
    targetProfileId: row.targetProfileId,
    matchType: row.matchType,
    score: row.score,
    scoreBreakdown: row.scoreBreakdownJson,
    explanationText: row.explanationText,
    overlapTags: row.overlapTags,
    scoreBand: row.scoreBand as MatchRecord["scoreBand"],
    confidence: row.confidence as MatchRecord["confidence"],
    algorithmVersion: row.algorithmVersion,
    runId: row.runId ?? undefined,
    surfacedAt: requiredIso(row.surfacedAt),
    dismissedBySource: row.dismissedBySource,
    hiddenByAdmin: row.hiddenByAdmin,
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function matchRunFromRow(row: typeof dbSchema.matchRuns.$inferSelect): MatchRun {
  return {
    id: row.id,
    orgId: row.orgId,
    spaceId: row.spaceId ?? undefined,
    startedAt: requiredIso(row.startedAt),
    completedAt: maybeIso(row.completedAt),
    status: row.status as MatchRun["status"],
    metadata: row.metadataJson,
  };
}

function matchFeedbackFromRow(
  row: typeof dbSchema.matchFeedback.$inferSelect,
): MatchFeedback {
  return {
    id: row.id,
    orgId: row.orgId,
    spaceId: row.spaceId ?? undefined,
    matchId: row.matchId,
    sourceProfileId: row.sourceProfileId,
    matchType: row.matchType,
    algorithmVersion: row.algorithmVersion,
    score: row.score,
    value: row.value as MatchFeedback["value"],
    reasons: row.reasons,
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function introRequestFromRow(row: typeof dbSchema.introRequests.$inferSelect): IntroRequest {
  return {
    id: row.id,
    orgId: row.orgId,
    spaceId: row.spaceId ?? undefined,
    requesterMembershipId: row.requesterMembershipId,
    receiverMembershipId: row.receiverMembershipId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    introPurpose: row.introPurpose,
    note: row.note,
    status: row.status,
    respondedAt: maybeIso(row.respondedAt),
    contactRevealedAt: maybeIso(row.contactRevealedAt),
    suggestedFirstMessage: row.suggestedFirstMessage,
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function notificationFromRow(row: typeof dbSchema.notifications.$inferSelect): Notification {
  return {
    id: row.id,
    orgId: row.orgId,
    spaceId: row.spaceId ?? undefined,
    membershipId: row.membershipId,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: maybeIso(row.readAt),
    createdAt: requiredIso(row.createdAt),
  };
}

function userInsert(user: User): typeof dbSchema.users.$inferInsert {
  return {
    ...user,
    anonymizedAt: maybeDate(user.anonymizedAt),
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

function membershipInsert(membership: Membership): typeof dbSchema.memberships.$inferInsert {
  return {
    ...membership,
    clerkInvitationUpdatedAt: maybeDate(membership.clerkInvitationUpdatedAt),
    createdAt: new Date(membership.createdAt),
    updatedAt: new Date(membership.updatedAt),
    approvedAt: maybeDate(membership.approvedAt),
  };
}

function cohortInsert(cohort: Cohort): typeof dbSchema.cohorts.$inferInsert {
  return {
    ...cohort,
    createdAt: new Date(cohort.createdAt),
    updatedAt: new Date(cohort.updatedAt),
  };
}

function cohortMemberInsert(
  cohortMember: CohortMember,
): typeof dbSchema.cohortMembers.$inferInsert {
  return {
    ...cohortMember,
    invitedAt: new Date(cohortMember.invitedAt),
    promotedAt: maybeDate(cohortMember.promotedAt),
    createdAt: new Date(cohortMember.createdAt),
    updatedAt: new Date(cohortMember.updatedAt),
  };
}

function spaceInsert(space: Space): typeof dbSchema.spaces.$inferInsert {
  return {
    ...space,
    startsAt: maybeDate(space.startsAt),
    endsAt: maybeDate(space.endsAt),
    endedAt: maybeDate(space.endedAt),
    archivedAt: maybeDate(space.archivedAt),
    createdAt: new Date(space.createdAt),
    updatedAt: new Date(space.updatedAt),
  };
}

function spaceMembershipInsert(
  membership: SpaceMembership,
): typeof dbSchema.spaceMemberships.$inferInsert {
  return {
    ...membership,
    grantedAt: maybeDate(membership.grantedAt),
    removedAt: maybeDate(membership.removedAt),
    createdAt: new Date(membership.createdAt),
    updatedAt: new Date(membership.updatedAt),
  };
}

function spaceIntentInsert(intent: SpaceIntent): typeof dbSchema.spaceIntents.$inferInsert {
  return {
    ...intent,
    embeddingUpdatedAt: maybeDate(intent.embeddingUpdatedAt),
    createdAt: new Date(intent.createdAt),
    updatedAt: new Date(intent.updatedAt),
  };
}

function profileInsert(profile: Profile): typeof dbSchema.profiles.$inferInsert {
  return {
    ...profile,
    embeddingUpdatedAt: maybeDate(profile.embeddingUpdatedAt),
    createdAt: new Date(profile.createdAt),
    updatedAt: new Date(profile.updatedAt),
    lastActiveAt: new Date(profile.lastActiveAt),
  };
}

function matchTypeConfigInsert(
  config: MatchTypeConfig,
): typeof dbSchema.matchTypeConfigs.$inferInsert {
  return {
    id: config.id,
    orgId: config.orgId,
    slug: config.slug,
    name: config.name,
    description: config.description,
    direction: config.direction,
    seekerLabel: config.seekerLabel,
    providerLabel: config.providerLabel,
    weightsJson: config.weights,
    minimumScore: config.minimumScore,
    active: config.active,
    version: config.version,
    createdAt: new Date(config.createdAt),
    updatedAt: new Date(config.updatedAt),
  };
}

function postInsert(post: Post): typeof dbSchema.posts.$inferInsert {
  return {
    ...post,
    opportunitySource: post.opportunitySource,
    relatedStartupName: post.relatedStartupName ?? "",
    createdAt: new Date(post.createdAt),
    updatedAt: new Date(post.updatedAt),
  };
}

function postSaveInsert(save: PostSave): typeof dbSchema.postSaves.$inferInsert {
  return {
    ...save,
    createdAt: new Date(save.createdAt),
  };
}

function commentInsert(comment: Comment): typeof dbSchema.comments.$inferInsert {
  return {
    ...comment,
    createdAt: new Date(comment.createdAt),
    updatedAt: new Date(comment.updatedAt),
  };
}

function matchInsert(match: MatchRecord): typeof dbSchema.matches.$inferInsert {
  return {
    id: match.id,
    orgId: match.orgId,
    spaceId: match.spaceId,
    sourceProfileId: match.sourceProfileId,
    targetProfileId: match.targetProfileId,
    matchType: match.matchType,
    score: match.score,
    scoreBreakdownJson: match.scoreBreakdown,
    explanationText: match.explanationText,
    overlapTags: match.overlapTags,
    scoreBand: match.scoreBand,
    confidence: match.confidence,
    algorithmVersion: match.algorithmVersion,
    runId: match.runId,
    surfacedAt: new Date(match.surfacedAt),
    dismissedBySource: match.dismissedBySource,
    hiddenByAdmin: match.hiddenByAdmin,
    createdAt: new Date(match.createdAt),
    updatedAt: new Date(match.updatedAt),
  };
}

function matchRunInsert(run: MatchRun): typeof dbSchema.matchRuns.$inferInsert {
  return {
    id: run.id,
    orgId: run.orgId,
    spaceId: run.spaceId,
    startedAt: new Date(run.startedAt),
    completedAt: maybeDate(run.completedAt),
    status: run.status,
    metadataJson: run.metadata,
  };
}

function matchFeedbackInsert(
  feedback: MatchFeedback,
): typeof dbSchema.matchFeedback.$inferInsert {
  return {
    ...feedback,
    createdAt: new Date(feedback.createdAt),
    updatedAt: new Date(feedback.updatedAt),
  };
}

function introRequestInsert(intro: IntroRequest): typeof dbSchema.introRequests.$inferInsert {
  return {
    ...intro,
    createdAt: new Date(intro.createdAt),
    updatedAt: new Date(intro.updatedAt),
    respondedAt: maybeDate(intro.respondedAt),
    contactRevealedAt: maybeDate(intro.contactRevealedAt),
  };
}

function notificationInsert(notification: Notification): typeof dbSchema.notifications.$inferInsert {
  return {
    ...notification,
    createdAt: new Date(notification.createdAt),
    readAt: maybeDate(notification.readAt),
  };
}

function analyticsEventInsert(event: AnalyticsEvent): typeof dbSchema.analyticsEvents.$inferInsert {
  return {
    id: event.id,
    orgId: event.orgId,
    spaceId: event.spaceId,
    membershipId: event.membershipId,
    eventName: event.eventName,
    payloadJson: event.payload,
    createdAt: new Date(event.createdAt),
  };
}

export async function recordClerkWebhookEvent(id: string, eventType: string) {
  const createdAt = new Date().toISOString();

  if (!usesDatabase) {
    const store = getStore();
    if (store.clerkWebhookEvents.some((event) => event.id === id)) {
      return false;
    }
    store.clerkWebhookEvents.unshift({ id, eventType, createdAt });
    return true;
  }

  const [row] = await getDb()
    .insert(dbSchema.clerkWebhookEvents)
    .values({
      id,
      eventType,
      createdAt: new Date(createdAt),
    })
    .onConflictDoNothing()
    .returning({ id: dbSchema.clerkWebhookEvents.id });

  return Boolean(row);
}

export async function hasClerkWebhookEvent(id: string) {
  if (!usesDatabase) {
    return getStore().clerkWebhookEvents.some((event) => event.id === id);
  }

  const [row] = await getDb()
    .select({ id: dbSchema.clerkWebhookEvents.id })
    .from(dbSchema.clerkWebhookEvents)
    .where(eq(dbSchema.clerkWebhookEvents.id, id))
    .limit(1);
  return Boolean(row);
}

export async function getOrganizationBySlug(slug: string) {
  const candidates = organizationSlugCandidates(slug);

  if (!usesDatabase) {
    const organization = getStore().organizations.find((candidate) =>
      candidates.includes(candidate.slug),
    );
    return organization?.id === seedOrganization.id
      ? { ...organization, name: seedOrganization.name, slug: seedOrganization.slug }
      : organization;
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.organizations)
    .where(inArray(dbSchema.organizations.slug, candidates))
    .limit(candidates.length);
  const row =
    rows.find((candidate) => candidate.slug === seedOrganization.slug) ?? rows[0];
  return row ? organizationFromRow(row) : undefined;
}

export async function getOrganizationByClerkOrgId(clerkOrgId: string) {
  if (!usesDatabase) {
    return getStore().organizations.find(
      (organization) => organization.clerkOrgId === clerkOrgId,
    );
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.organizations)
    .where(eq(dbSchema.organizations.clerkOrgId, clerkOrgId))
    .limit(1);
  return row ? organizationFromRow(row) : undefined;
}

export async function linkOrganizationToClerkOrg(orgId: string, clerkOrgId: string) {
  if (!usesDatabase) {
    const organization = getStore().organizations.find((candidate) => candidate.id === orgId);
    if (organization) {
      organization.clerkOrgId = clerkOrgId;
    }
    return organization;
  }

  const [row] = await getDb()
    .update(dbSchema.organizations)
    .set({ clerkOrgId })
    .where(eq(dbSchema.organizations.id, orgId))
    .returning();
  return row ? organizationFromRow(row) : undefined;
}

export async function unlinkOrganizationFromClerkOrg(orgId: string) {
  if (!usesDatabase) {
    const organization = getStore().organizations.find((candidate) => candidate.id === orgId);
    if (organization) {
      organization.clerkOrgId = undefined;
    }
    return organization;
  }

  const [row] = await getDb()
    .update(dbSchema.organizations)
    .set({ clerkOrgId: null })
    .where(eq(dbSchema.organizations.id, orgId))
    .returning();
  return row ? organizationFromRow(row) : undefined;
}

export async function getViewerRecordByEmailAndSlug(slug: string, email: string) {
  const normalizedEmail = normalizeEmailAddress(email);
  const candidates = organizationSlugCandidates(slug);

  if (!usesDatabase) {
    const store = getStore();
    const storedOrg = store.organizations.find((organization) =>
      candidates.includes(organization.slug),
    );
    const org =
      storedOrg?.id === seedOrganization.id
        ? { ...storedOrg, name: seedOrganization.name, slug: seedOrganization.slug }
        : storedOrg;
    const user = store.users.find((candidate) => candidate.email.toLowerCase() === normalizedEmail);
    const membership =
      org && user
        ? store.memberships.find(
            (candidate) => candidate.orgId === org.id && candidate.userId === user.id,
          )
        : undefined;
    const profile = membership
      ? store.profiles.find((candidate) => candidate.membershipId === membership.id)
      : undefined;

    return { org, user, membership, profile };
  }

  const rows = await getDb()
    .select({
      org: dbSchema.organizations,
      user: dbSchema.users,
      membership: dbSchema.memberships,
      profile: dbSchema.profiles,
    })
    .from(dbSchema.organizations)
    .leftJoin(dbSchema.users, sql`lower(${dbSchema.users.email}) = ${normalizedEmail}`)
    .leftJoin(
      dbSchema.memberships,
      and(
        eq(dbSchema.memberships.orgId, dbSchema.organizations.id),
        eq(dbSchema.memberships.userId, dbSchema.users.id),
      ),
    )
    .leftJoin(dbSchema.profiles, eq(dbSchema.profiles.membershipId, dbSchema.memberships.id))
    .where(inArray(dbSchema.organizations.slug, candidates))
    .limit(candidates.length);
  const row =
    rows.find((candidate) => candidate.org.slug === seedOrganization.slug) ?? rows[0];

  return row
    ? {
        org: organizationFromRow(row.org),
        user: row.user ? userFromRow(row.user) : undefined,
        membership: row.membership ? membershipFromRow(row.membership) : undefined,
        profile: row.profile ? profileFromRow(row.profile) : undefined,
      }
    : { org: undefined, user: undefined, membership: undefined, profile: undefined };
}

export async function getViewerRecordByEmailAndOrgId(orgId: string, email: string) {
  const normalizedEmail = normalizeEmailAddress(email);

  if (!usesDatabase) {
    const store = getStore();
    const user = store.users.find((candidate) => candidate.email.toLowerCase() === normalizedEmail);
    const membership = user
      ? store.memberships.find(
          (candidate) => candidate.orgId === orgId && candidate.userId === user.id,
        )
      : undefined;
    const profile = membership
      ? store.profiles.find((candidate) => candidate.membershipId === membership.id)
      : undefined;

    return { user, membership, profile };
  }

  const [row] = await getDb()
    .select({
      user: dbSchema.users,
      membership: dbSchema.memberships,
      profile: dbSchema.profiles,
    })
    .from(dbSchema.users)
    .leftJoin(
      dbSchema.memberships,
      and(
        eq(dbSchema.memberships.orgId, orgId),
        eq(dbSchema.memberships.userId, dbSchema.users.id),
      ),
    )
    .leftJoin(dbSchema.profiles, eq(dbSchema.profiles.membershipId, dbSchema.memberships.id))
    .where(sql`lower(${dbSchema.users.email}) = ${normalizedEmail}`)
    .limit(1);

  return row
    ? {
        user: userFromRow(row.user),
        membership: row.membership ? membershipFromRow(row.membership) : undefined,
        profile: row.profile ? profileFromRow(row.profile) : undefined,
      }
    : { user: undefined, membership: undefined, profile: undefined };
}

export async function getViewerRecordByClerkUserIdAndOrgId(
  orgId: string,
  clerkUserId: string,
) {
  if (!usesDatabase) {
    const store = getStore();
    const user = store.users.find((candidate) => candidate.clerkUserId === clerkUserId);
    const membership = user
      ? store.memberships.find(
          (candidate) => candidate.orgId === orgId && candidate.userId === user.id,
        )
      : undefined;
    const profile = membership
      ? store.profiles.find((candidate) => candidate.membershipId === membership.id)
      : undefined;
    return { user, membership, profile };
  }

  const [row] = await getDb()
    .select({
      user: dbSchema.users,
      membership: dbSchema.memberships,
      profile: dbSchema.profiles,
    })
    .from(dbSchema.users)
    .leftJoin(
      dbSchema.memberships,
      and(
        eq(dbSchema.memberships.orgId, orgId),
        eq(dbSchema.memberships.userId, dbSchema.users.id),
      ),
    )
    .leftJoin(dbSchema.profiles, eq(dbSchema.profiles.membershipId, dbSchema.memberships.id))
    .where(eq(dbSchema.users.clerkUserId, clerkUserId))
    .limit(1);

  return row
    ? {
        user: userFromRow(row.user),
        membership: row.membership ? membershipFromRow(row.membership) : undefined,
        profile: row.profile ? profileFromRow(row.profile) : undefined,
      }
    : { user: undefined, membership: undefined, profile: undefined };
}

export async function getUserByEmail(email: string) {
  if (!usesDatabase) {
    return getStore().users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.users)
    .where(sql`lower(${dbSchema.users.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return row ? userFromRow(row) : undefined;
}

export async function getUserByClerkUserId(clerkUserId: string) {
  if (!usesDatabase) {
    return getStore().users.find((user) => user.clerkUserId === clerkUserId);
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.users)
    .where(eq(dbSchema.users.clerkUserId, clerkUserId))
    .limit(1);
  return row ? userFromRow(row) : undefined;
}

export async function getUserById(userId: string) {
  if (!usesDatabase) {
    return getStore().users.find((user) => user.id === userId);
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.users)
    .where(eq(dbSchema.users.id, userId))
    .limit(1);
  return row ? userFromRow(row) : undefined;
}

const passwordProvider = "password";
const passwordIterations = 310000;
const passwordKeyLength = 32;
const passwordDigest = "SHA-256";

function normalizeEmailAddress(email: string) {
  return email.toLowerCase().trim();
}

function displayNameForEmail(email: string) {
  return (
    email
      .split("@")[0]
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(" ") || email
  );
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function hashPassword(password: string, salt = randomSalt()) {
  const passwordKey = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(salt),
      iterations: passwordIterations,
      hash: passwordDigest,
    },
    passwordKey,
    passwordKeyLength * 8,
  );

  return {
    passwordHash: bytesToHex(new Uint8Array(derivedBits)),
    passwordSalt: salt,
  };
}

function passwordCredentialFromAccountRow(
  row: typeof dbSchema.accounts.$inferSelect,
): PasswordCredential | null {
  const metadata = row.metadata as Record<string, unknown>;
  const passwordHash = typeof metadata.passwordHash === "string" ? metadata.passwordHash : "";
  const passwordSalt = typeof metadata.passwordSalt === "string" ? metadata.passwordSalt : "";

  if (!passwordHash || !passwordSalt) {
    return null;
  }

  return {
    id: row.id,
    userId: row.userId,
    email: normalizeEmailAddress(row.providerAccountId),
    passwordHash,
    passwordSalt,
    createdAt: String(metadata.createdAt ?? ""),
    updatedAt: String(metadata.updatedAt ?? ""),
  };
}

async function getPasswordCredentialByEmail(email: string) {
  const normalizedEmail = normalizeEmailAddress(email);

  if (!usesDatabase) {
    return getStore().passwordCredentials.find(
      (credential) => credential.email === normalizedEmail,
    );
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.accounts)
    .where(
      and(
        eq(dbSchema.accounts.provider, passwordProvider),
        sql`lower(${dbSchema.accounts.providerAccountId}) = ${normalizedEmail}`,
      ),
    )
    .limit(1);

  return row ? passwordCredentialFromAccountRow(row) : undefined;
}

export async function setPasswordCredential(userId: string, email: string, password: string) {
  const normalizedEmail = normalizeEmailAddress(email);
  const now = new Date().toISOString();
  const passwordFields = await hashPassword(password);
  const metadata = {
    ...passwordFields,
    algorithm: "pbkdf2",
    digest: passwordDigest,
    iterations: passwordIterations,
    createdAt: now,
    updatedAt: now,
  };

  if (!usesDatabase) {
    const store = getStore();
    const existing = store.passwordCredentials.find(
      (credential) => credential.email === normalizedEmail,
    );

    if (existing) {
      Object.assign(existing, {
        userId,
        ...passwordFields,
        updatedAt: now,
      });
      return existing;
    }

    const credential: PasswordCredential = {
      id: `cred_${nanoid(8)}`,
      userId,
      email: normalizedEmail,
      ...passwordFields,
      createdAt: now,
      updatedAt: now,
    };
    store.passwordCredentials.unshift(credential);
    return credential;
  }

  const db = getDb();
  const existing = await getPasswordCredentialByEmail(normalizedEmail);

  if (existing) {
    await db
      .update(dbSchema.accounts)
      .set({
        userId,
        providerAccountId: normalizedEmail,
        metadata: {
          ...metadata,
          createdAt: existing.createdAt || now,
        },
      })
      .where(eq(dbSchema.accounts.id, existing.id));
    return;
  }

  await db.insert(dbSchema.accounts).values({
    id: `acct_${nanoid(8)}`,
    userId,
    provider: passwordProvider,
    providerAccountId: normalizedEmail,
    metadata,
  });
}

export async function upsertSessionUser(
  input: {
    clerkUserId?: string;
    email: string;
    name: string;
    imageUrl?: string;
  },
  options: { existingUser?: User } = {},
) {
  const now = new Date().toISOString();
  const email = normalizeEmailAddress(input.email);
  const knownUser =
    options.existingUser &&
    (options.existingUser.email.toLowerCase() === email ||
      (input.clerkUserId && options.existingUser.clerkUserId === input.clerkUserId))
      ? options.existingUser
      : undefined;
  const existing =
    knownUser ??
    (input.clerkUserId ? await getUserByClerkUserId(input.clerkUserId) : undefined) ??
    (await getUserByEmail(email));
  const platformRole = isBootstrapAdminEmail(email)
    ? "platform_owner"
    : existing?.platformRole ?? "standard";

  if (existing) {
    const nextClerkUserId = input.clerkUserId ?? existing.clerkUserId;
    const nextImageUrl = input.imageUrl ?? existing.imageUrl;

    if (
      existing.clerkUserId === nextClerkUserId &&
      existing.email === email &&
      existing.name === input.name &&
      existing.imageUrl === nextImageUrl &&
      existing.platformRole === platformRole &&
      !existing.anonymizedAt
    ) {
      return existing;
    }
  }

  if (!usesDatabase) {
    const store = getStore();
    if (existing) {
      existing.email = email;
      existing.name = input.name;
      existing.imageUrl = input.imageUrl ?? existing.imageUrl;
      existing.clerkUserId = input.clerkUserId ?? existing.clerkUserId;
      existing.platformRole = platformRole;
      existing.anonymizedAt = undefined;
      existing.updatedAt = now;
      return existing;
    }

    const next: User = {
      id: `usr_${nanoid(8)}`,
      clerkUserId: input.clerkUserId,
      email,
      name: input.name,
      imageUrl: input.imageUrl ?? `https://api.dicebear.com/9.x/notionists/svg?seed=${input.name}`,
      platformRole,
      createdAt: now,
      updatedAt: now,
    };

    store.users.unshift(next);
    return next;
  }

  const db = getDb();
  if (existing) {
    const [row] = await db
      .update(dbSchema.users)
      .set({
        clerkUserId: input.clerkUserId ?? existing.clerkUserId,
        email,
        name: input.name,
        imageUrl: input.imageUrl ?? existing.imageUrl,
        platformRole,
        anonymizedAt: null,
        updatedAt: new Date(now),
      })
      .where(eq(dbSchema.users.id, existing.id))
      .returning();
    return userFromRow(row);
  }

  const user: User = {
    id: `usr_${nanoid(8)}`,
    clerkUserId: input.clerkUserId,
    email,
    name: input.name,
    imageUrl: input.imageUrl ?? `https://api.dicebear.com/9.x/notionists/svg?seed=${input.name}`,
    platformRole,
    createdAt: now,
    updatedAt: now,
  };
  const [row] = await db.insert(dbSchema.users).values(userInsert(user)).returning();
  return userFromRow(row);
}

export async function ensureMembership(
  userId: string,
  orgId: string,
  options: {
    clerkMembershipId?: string;
    clerkRole?: ClerkOrgRole | string;
    existingUser?: User;
    existingMembership?: Membership;
  } = {},
) {
  const existingMembership =
    options.existingMembership?.userId === userId &&
    options.existingMembership.orgId === orgId
      ? options.existingMembership
      : undefined;
  const [user, existing] = await Promise.all([
    options.existingUser?.id === userId
      ? Promise.resolve(options.existingUser)
      : getUserById(userId),
    existingMembership
      ? Promise.resolve(existingMembership)
      : getMembershipByUserAndOrg(userId, orgId),
  ]);
  const clerkRole = options.clerkRole;
  const roleFromClerk = clerkRole ? localRoleFromClerkRole(clerkRole) : undefined;
  const adminBootstrap =
    roleFromClerk === "org_admin" ||
    isBootstrapAdminEmail(user?.email) ||
    user?.platformRole === "platform_owner";
  if (existing) {
    if (
      adminBootstrap &&
      (existing.role !== "org_admin" || existing.status !== "approved")
    ) {
      const now = new Date().toISOString();
      const promoted: Membership = {
        ...existing,
        clerkMembershipId: options.clerkMembershipId ?? existing.clerkMembershipId,
        clerkRole: (clerkRole as ClerkOrgRole | undefined) ?? existing.clerkRole,
        clerkInvitationId: existing.clerkInvitationId,
        clerkInvitationStatus: existing.clerkInvitationStatus,
        clerkInvitationError: existing.clerkInvitationError,
        clerkInvitationUpdatedAt: existing.clerkInvitationUpdatedAt,
        role: "org_admin",
        accountStatus: "connected",
        status: "approved",
        approvedAt: existing.approvedAt ?? now,
        approvalNote: existing.approvalNote ?? "Approved by bootstrap admin configuration.",
        updatedAt: now,
      };

      if (!usesDatabase) {
        Object.assign(existing, promoted);
        return existing;
      }

      const [row] = await getDb()
        .update(dbSchema.memberships)
        .set({
          clerkMembershipId: promoted.clerkMembershipId,
          clerkRole: promoted.clerkRole,
          role: promoted.role,
          accountStatus: promoted.accountStatus,
          status: promoted.status,
          approvedAt: maybeDate(promoted.approvedAt),
          approvalNote: promoted.approvalNote,
          updatedAt: new Date(promoted.updatedAt),
        })
        .where(eq(dbSchema.memberships.id, existing.id))
        .returning();
      return membershipFromRow(row);
    }

    if (
      (options.clerkMembershipId && existing.clerkMembershipId !== options.clerkMembershipId) ||
      (options.clerkMembershipId && existing.accountStatus !== "connected") ||
      (clerkRole && existing.clerkRole !== clerkRole) ||
      (roleFromClerk && existing.role !== roleFromClerk)
    ) {
      const nextRole = roleFromClerk ?? existing.role;
      const now = new Date().toISOString();

      if (!usesDatabase) {
        existing.clerkMembershipId = options.clerkMembershipId ?? existing.clerkMembershipId;
        existing.clerkRole = (clerkRole as ClerkOrgRole | undefined) ?? existing.clerkRole;
        existing.role = nextRole;
        if (options.clerkMembershipId) existing.accountStatus = "connected";
        existing.updatedAt = now;
        return existing;
      }

      const [row] = await getDb()
        .update(dbSchema.memberships)
        .set({
          clerkMembershipId: options.clerkMembershipId ?? existing.clerkMembershipId,
          clerkRole: clerkRole ?? existing.clerkRole,
          role: nextRole,
          ...(options.clerkMembershipId ? { accountStatus: "connected" as const } : {}),
          updatedAt: new Date(now),
        })
        .where(eq(dbSchema.memberships.id, existing.id))
        .returning();
      return membershipFromRow(row);
    }
    return existing;
  }

  const now = new Date().toISOString();
  const membership: Membership = {
    id: `mem_${nanoid(8)}`,
    clerkMembershipId: options.clerkMembershipId,
    clerkRole: clerkRole as ClerkOrgRole | undefined,
    orgId,
    userId,
    role: roleFromClerk ?? (adminBootstrap ? "org_admin" : "member"),
    accountStatus: options.clerkMembershipId || adminBootstrap ? "connected" : "invited",
    affiliationType: adminBootstrap ? "current participant" : "invited outsider",
    status: adminBootstrap ? "approved" : "pending",
    archetypes: adminBootstrap ? ["mentor"] : ["invited_outsider"],
    programName: adminBootstrap ? "Wavesparks Admin" : "Guest Network",
    cohortNameOrYear: adminBootstrap ? "Core" : "Rolling",
    approvedAt: adminBootstrap ? now : undefined,
    createdAt: now,
    updatedAt: now,
  };

  if (!usesDatabase) {
    getStore().memberships.unshift(membership);
    return membership;
  }

  const [row] = await getDb()
    .insert(dbSchema.memberships)
    .values(membershipInsert(membership))
    .returning();
  return membershipFromRow(row);
}

export async function createManagedAccount(input: {
  orgId: string;
  clerkUserId?: string;
  clerkMembershipId?: string;
  clerkRole?: ClerkOrgRole | string;
  email: string;
  name: string;
  password?: string;
  createPasswordCredential?: boolean;
  role: MembershipRole;
  status: MembershipStatus;
  affiliationType?: AffiliationType;
  archetypes?: string[];
  programName?: string;
  cohortNameOrYear?: string;
  invitedByUserId?: string;
  approvalNote?: string;
}) {
  const email = normalizeEmailAddress(input.email);
  const name = input.name.trim() || displayNameForEmail(email);
  const password = input.password?.trim() ?? "";
  const createPasswordCredential = input.createPasswordCredential ?? false;

  if (!email.includes("@")) {
    throw new Error("A valid email is required.");
  }

  if (createPasswordCredential && password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const clerkRole = input.clerkRole;
  const user = await upsertSessionUser({ clerkUserId: input.clerkUserId, email, name });
  if (createPasswordCredential) {
    await setPasswordCredential(user.id, email, password);
  }

  const existing = await getMembershipByUserAndOrg(user.id, input.orgId);
  const now = new Date().toISOString();
  const role = input.role;
  const status = input.status;
  const affiliationType =
    input.affiliationType ?? (role === "org_admin" ? "current participant" : "invited outsider");
  const archetypes = input.archetypes ?? (role === "org_admin" ? ["operator"] : ["invited_outsider"]);
  const programName = input.programName ?? (role === "org_admin" ? "Wavesparks Admin" : "Guest Network");
  const cohortNameOrYear = input.cohortNameOrYear ?? (role === "org_admin" ? "Core" : "Rolling");
  const accountStatus: AccountStatus =
    existing?.accountStatus === "suspended" || existing?.accountStatus === "deprovisioned"
      ? existing.accountStatus
      : input.clerkMembershipId || input.clerkUserId || existing?.clerkMembershipId
        ? "connected"
        : existing?.accountStatus ?? "invited";
  const managedMembership: Membership = {
    id: existing?.id ?? `mem_${nanoid(8)}`,
    clerkMembershipId: input.clerkMembershipId ?? existing?.clerkMembershipId,
    clerkRole: (clerkRole as ClerkOrgRole | undefined) ?? existing?.clerkRole,
    clerkInvitationId: existing?.clerkInvitationId,
    clerkInvitationStatus: existing?.clerkInvitationStatus,
    clerkInvitationError: existing?.clerkInvitationError,
    clerkInvitationUpdatedAt: existing?.clerkInvitationUpdatedAt,
    orgId: input.orgId,
    userId: user.id,
    role,
    accountStatus,
    affiliationType,
    status,
    archetypes,
    programName,
    cohortNameOrYear,
    invitedByUserId: existing?.invitedByUserId ?? input.invitedByUserId,
    approvalNote: input.approvalNote ?? existing?.approvalNote ?? "Managed account.",
    approvedAt:
      status === "approved"
        ? existing?.approvedAt ?? now
        : existing?.approvedAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (!usesDatabase) {
    const store = getStore();
    if (existing) {
      Object.assign(existing, managedMembership);
      return { user, membership: existing };
    }

    store.memberships.unshift(managedMembership);
    return { user, membership: managedMembership };
  }

  if (existing) {
    const [row] = await getDb()
      .update(dbSchema.memberships)
      .set({
        clerkMembershipId: managedMembership.clerkMembershipId,
        clerkRole: managedMembership.clerkRole,
        clerkInvitationId: managedMembership.clerkInvitationId,
        clerkInvitationStatus: managedMembership.clerkInvitationStatus,
        clerkInvitationError: managedMembership.clerkInvitationError,
        clerkInvitationUpdatedAt: maybeDate(managedMembership.clerkInvitationUpdatedAt),
        role: managedMembership.role,
        accountStatus: managedMembership.accountStatus,
        affiliationType: managedMembership.affiliationType,
        status: managedMembership.status,
        archetypes: managedMembership.archetypes,
        programName: managedMembership.programName,
        cohortNameOrYear: managedMembership.cohortNameOrYear,
        approvalNote: managedMembership.approvalNote,
        approvedAt: maybeDate(managedMembership.approvedAt),
        updatedAt: new Date(managedMembership.updatedAt),
      })
      .where(eq(dbSchema.memberships.id, existing.id))
      .returning();
    return { user, membership: membershipFromRow(row) };
  }

  const [row] = await getDb()
    .insert(dbSchema.memberships)
    .values(membershipInsert(managedMembership))
    .returning();
  return { user, membership: membershipFromRow(row) };
}

export async function getMembershipByUserAndOrg(userId: string, orgId: string) {
  if (!usesDatabase) {
    return getStore().memberships.find(
      (membership) => membership.userId === userId && membership.orgId === orgId,
    );
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.memberships)
    .where(and(eq(dbSchema.memberships.userId, userId), eq(dbSchema.memberships.orgId, orgId)))
    .limit(1);
  return row ? membershipFromRow(row) : undefined;
}

export async function getMembershipByClerkMembershipId(clerkMembershipId: string) {
  if (!usesDatabase) {
    return getStore().memberships.find(
      (membership) => membership.clerkMembershipId === clerkMembershipId,
    );
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.memberships)
    .where(eq(dbSchema.memberships.clerkMembershipId, clerkMembershipId))
    .limit(1);
  return row ? membershipFromRow(row) : undefined;
}

export async function getMembershipByClerkInvitationId(clerkInvitationId: string) {
  if (!usesDatabase) {
    return getStore().memberships.find(
      (membership) => membership.clerkInvitationId === clerkInvitationId,
    );
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.memberships)
    .where(eq(dbSchema.memberships.clerkInvitationId, clerkInvitationId))
    .limit(1);
  return row ? membershipFromRow(row) : undefined;
}

function anonymizedProfile(profile: Profile): Profile {
  const now = new Date().toISOString();
  return {
    ...profile,
    fullName: "Former member",
    preferredName: "Former member",
    displayNamePreference: "preferred_name",
    profilePhoto: "",
    headline: "",
    shortBio: "",
    longBio: "",
    bio: "",
    problemInterest: "",
    currentFocus: "",
    technicalExperienceLevel: "",
    technicalExperience: "",
    city: "",
    country: "",
    timezone: "",
    schoolOrCompany: "",
    currentStatus: "former_member",
    startupName: "",
    startupOneLiner: "",
    startupDescription: "",
    stage: "",
    industryTags: [],
    problemSpaceTags: [],
    businessModelTags: [],
    currentProgress: "",
    tractionSummary: "",
    regionFocus: "",
    lookingForTypes: [],
    seekingMatchTypes: [],
    offeringMatchTypes: [],
    desiredRoles: [],
    helpNeededTags: [],
    idealMatchDescription: "",
    skillTags: [],
    yearsOfExperience: 0,
    topStrengths: [],
    canContribute: [],
    priorProjects: "",
    notableWins: "",
    timeCommitment: "",
    availabilityStart: "",
    remotePreference: "",
    preferredGeographies: [],
    meetingFrequencyPreference: "",
    ambitionLevel: 1,
    riskTolerance: 1,
    speedPreference: "",
    decisionStyle: "",
    workStyle: "",
    communicationStyle: "",
    conflictStyle: "",
    commitmentHorizon: "",
    missionVsMarketOrientation: "",
    structureVsChaos: 1,
    mentorExpertiseTags: [],
    mentorStageExperience: [],
    mentorFunctionalStrengths: [],
    mentorAvailability: "",
    mentorOffers: [],
    maxMentees: null,
    mentorshipPreferences: "",
    publicContactEnabled: false,
    emailForIntro: "",
    whatsappNumber: "",
    whatsappVisibleAfterAccept: false,
    introOptIn: false,
    profileVisibleInMatching: false,
    profileCompletionPercent: 0,
    lastActiveAt: now,
    featured: false,
    stale: false,
    onboardingComplete: false,
    seekingEmbeddingText: "",
    offeringEmbeddingText: "",
    seekingEmbedding: Array.from({ length: MATCHING_EMBEDDING_DIMENSIONS }, () => 0),
    offeringEmbedding: Array.from({ length: MATCHING_EMBEDDING_DIMENSIONS }, () => 0),
    embeddingModel: "deleted",
    embeddingSourceHash: undefined,
    embeddingStatus: "pending",
    embeddingError: undefined,
    embeddingUpdatedAt: now,
    updatedAt: now,
  };
}

export async function anonymizeUserByClerkUserId(clerkUserId: string) {
  const user = await getUserByClerkUserId(clerkUserId);
  if (!user) {
    return null;
  }
  const memberships = !usesDatabase
    ? getStore().memberships.filter((membership) => membership.userId === user.id)
    : (
        await getDb()
          .select()
          .from(dbSchema.memberships)
          .where(eq(dbSchema.memberships.userId, user.id))
      ).map(membershipFromRow);
  const membershipIds = memberships.map((membership) => membership.id);
  const profiles = await Promise.all(
    memberships.map((membership) => getProfileByMembershipId(membership.id)),
  );
  const existingProfiles = profiles.filter((profile): profile is Profile => Boolean(profile));
  const profileIds = existingProfiles.map((profile) => profile.id);
  const now = new Date().toISOString();

  for (const profile of existingProfiles) {
    await upsertProfile(anonymizedProfile(profile), [], {
      orgId: memberships.find((membership) => membership.id === profile.membershipId)?.orgId,
      recomputeMatches: false,
    });
  }

  if (!usesDatabase) {
    const store = getStore();
    Object.assign(user, {
      anonymizedAt: now,
      clerkUserId: undefined,
      email: `former+${user.id}@deleted.invalid`,
      imageUrl: "",
      name: "Former member",
      platformRole: "standard",
      updatedAt: now,
    } satisfies Partial<User>);
    for (const membership of memberships) {
      Object.assign(membership, {
        affiliationType: "invited outsider",
        approvalNote: undefined,
        archetypes: [],
        clerkInvitationError: undefined,
        clerkInvitationId: undefined,
        clerkInvitationStatus: undefined,
        clerkInvitationUpdatedAt: now,
        clerkMembershipId: undefined,
        clerkRole: undefined,
        cohortNameOrYear: "",
        programName: "Former member",
        role: "member",
        accountStatus: "deprovisioned",
        status: "suspended",
        updatedAt: now,
      } satisfies Partial<Membership>);
    }
    const membershipIdSet = new Set(membershipIds);
    const profileIdSet = new Set(profileIds);
    store.passwordCredentials = store.passwordCredentials.filter(
      (credential) => credential.userId !== user.id,
    );
    store.matches = store.matches.filter(
      (match) =>
        !profileIdSet.has(match.sourceProfileId) && !profileIdSet.has(match.targetProfileId),
    );
    store.follows = store.follows.filter(
      (follow) =>
        !membershipIdSet.has(follow.followerMembershipId) &&
        !membershipIdSet.has(follow.followedMembershipId),
    );
    store.postSaves = store.postSaves.filter(
      (save) => !membershipIdSet.has(save.membershipId),
    );
    store.notifications = store.notifications.filter(
      (notification) => !membershipIdSet.has(notification.membershipId),
    );
    for (const intro of store.introRequests) {
      if (
        intro.status === "pending" &&
        (membershipIdSet.has(intro.requesterMembershipId) ||
          membershipIdSet.has(intro.receiverMembershipId))
      ) {
        intro.status = "expired";
        intro.contactRevealedAt = undefined;
        intro.updatedAt = now;
      }
    }
    return user;
  }

  const db = getDb();
  await db.delete(dbSchema.accounts).where(eq(dbSchema.accounts.userId, user.id));
  if (profileIds.length) {
    await db
      .delete(dbSchema.matches)
      .where(
        or(
          inArray(dbSchema.matches.sourceProfileId, profileIds),
          inArray(dbSchema.matches.targetProfileId, profileIds),
        ),
      );
  }
  if (membershipIds.length) {
    await Promise.all([
      db
        .delete(dbSchema.follows)
        .where(
          or(
            inArray(dbSchema.follows.followerMembershipId, membershipIds),
            inArray(dbSchema.follows.followedMembershipId, membershipIds),
          ),
        ),
      db
        .delete(dbSchema.postSaves)
        .where(inArray(dbSchema.postSaves.membershipId, membershipIds)),
      db
        .delete(dbSchema.notifications)
        .where(inArray(dbSchema.notifications.membershipId, membershipIds)),
      db
        .update(dbSchema.introRequests)
        .set({ status: "expired", contactRevealedAt: null, updatedAt: new Date(now) })
        .where(
          and(
            eq(dbSchema.introRequests.status, "pending"),
            or(
              inArray(dbSchema.introRequests.requesterMembershipId, membershipIds),
              inArray(dbSchema.introRequests.receiverMembershipId, membershipIds),
            ),
          ),
        ),
      db
        .update(dbSchema.memberships)
        .set({
          affiliationType: "invited outsider",
          approvalNote: null,
          archetypes: [],
          clerkInvitationError: null,
          clerkInvitationId: null,
          clerkInvitationStatus: null,
          clerkInvitationUpdatedAt: new Date(now),
          clerkMembershipId: null,
          clerkRole: null,
          cohortNameOrYear: "",
          programName: "Former member",
          role: "member",
          accountStatus: "deprovisioned",
          status: "suspended",
          updatedAt: new Date(now),
        })
        .where(inArray(dbSchema.memberships.id, membershipIds)),
    ]);
  }
  const [row] = await db
    .update(dbSchema.users)
    .set({
      anonymizedAt: new Date(now),
      clerkUserId: null,
      email: `former+${user.id}@deleted.invalid`,
      imageUrl: "",
      name: "Former member",
      platformRole: "standard",
      updatedAt: new Date(now),
    })
    .where(eq(dbSchema.users.id, user.id))
    .returning();
  return row ? userFromRow(row) : null;
}

export async function getMembershipById(id: string) {
  if (!usesDatabase) {
    return getStore().memberships.find((membership) => membership.id === id);
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.memberships)
    .where(eq(dbSchema.memberships.id, id))
    .limit(1);
  return row ? membershipFromRow(row) : undefined;
}

export async function getProfileByMembershipId(membershipId: string) {
  if (!usesDatabase) {
    return getStore().profiles.find((profile) => profile.membershipId === membershipId);
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.profiles)
    .where(eq(dbSchema.profiles.membershipId, membershipId))
    .limit(1);
  return row ? profileFromRow(row) : undefined;
}

function sortSpaces(left: Space, right: Space) {
  if (left.kind !== right.kind) return left.kind === "main" ? -1 : 1;
  const leftStart = left.startsAt ?? left.createdAt;
  const rightStart = right.startsAt ?? right.createdAt;
  return rightStart.localeCompare(leftStart) || left.name.localeCompare(right.name);
}

export async function listSpacesForOrg(orgId: string): Promise<Space[]> {
  if (!usesDatabase) {
    return getStore().spaces
      .filter((space) => space.orgId === orgId)
      .slice()
      .sort(sortSpaces);
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.spaces)
    .where(eq(dbSchema.spaces.orgId, orgId));
  return rows.map(spaceFromRow).sort(sortSpaces);
}

export async function getSpaceBySlug(orgId: string, slug: string) {
  if (!usesDatabase) {
    return getStore().spaces.find(
      (space) => space.orgId === orgId && space.slug === slug,
    );
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.spaces)
    .where(and(eq(dbSchema.spaces.orgId, orgId), eq(dbSchema.spaces.slug, slug)))
    .limit(1);
  return row ? spaceFromRow(row) : undefined;
}

export async function getSpaceById(spaceId: string) {
  if (!usesDatabase) {
    return getStore().spaces.find((space) => space.id === spaceId);
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.spaces)
    .where(eq(dbSchema.spaces.id, spaceId))
    .limit(1);
  return row ? spaceFromRow(row) : undefined;
}

function eventSlugBase(name: string) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "event";
}

function eventDate(value: string | undefined, label: string) {
  if (!value?.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }
  return date.toISOString();
}

function validateEventDates(startsAt?: string, endsAt?: string) {
  if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    throw new Error("Event end date must be on or after its start date.");
  }
}

function legacyCohortForSpace(space: Space): Cohort {
  return {
    id: space.id,
    orgId: space.orgId,
    name: space.name,
    description: space.description,
    eventLabel: space.eventLabel,
    status: space.lifecycle === "archived" ? "archived" : "active",
    createdByMembershipId: space.createdByMembershipId,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
  };
}

export async function createEventSpace(input: {
  /** Internal compatibility override for migrated Cohort ids. */
  id?: string;
  orgId: string;
  name: string;
  description?: string;
  eventLabel?: string;
  startsAt?: string;
  endsAt?: string;
  lifecycle?: Extract<SpaceLifecycle, "draft" | "upcoming" | "active" | "ended">;
  matchingEnabled?: boolean;
  createdByMembershipId?: string;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Event name is required.");
  if (input.createdByMembershipId) {
    const creator = await getMembershipById(input.createdByMembershipId);
    if (!creator || creator.orgId !== input.orgId) {
      throw new Error("Event creator must belong to this organization.");
    }
  }

  const startsAt = eventDate(input.startsAt, "Event start date");
  const endsAt = eventDate(input.endsAt, "Event end date");
  validateEventDates(startsAt, endsAt);
  const lifecycle = input.lifecycle ?? "draft";
  const now = new Date().toISOString();
  const id = input.id?.trim() || `spc_evt_${nanoid(10)}`;
  const space: Space = {
    id,
    orgId: input.orgId,
    slug: `${eventSlugBase(name)}-${nanoid(6).toLowerCase()}`,
    kind: "event",
    lifecycle,
    name,
    description: input.description?.trim() ?? "",
    eventLabel: input.eventLabel?.trim() ?? "",
    startsAt,
    endsAt,
    endedAt: lifecycle === "ended" ? now : undefined,
    matchingEnabled: input.matchingEnabled ?? true,
    createdByMembershipId: input.createdByMembershipId,
    createdAt: now,
    updatedAt: now,
  };
  const cohort = legacyCohortForSpace(space);

  if (!usesDatabase) {
    const store = getStore();
    store.spaces.unshift(space);
    store.cohorts.unshift(cohort);
    return space;
  }

  const [row] = await getDb()
    .insert(dbSchema.spaces)
    .values(spaceInsert(space))
    .returning();
  await getDb()
    .insert(dbSchema.cohorts)
    .values(cohortInsert(cohort))
    .onConflictDoNothing({ target: dbSchema.cohorts.id });
  return spaceFromRow(row);
}

export async function updateEventSpace(
  orgId: string,
  spaceId: string,
  input: {
    name?: string;
    description?: string;
    eventLabel?: string;
    startsAt?: string | null;
    endsAt?: string | null;
    lifecycle?: Extract<SpaceLifecycle, "draft" | "upcoming" | "active" | "ended">;
    matchingEnabled?: boolean;
  },
) {
  const existing = await getSpaceById(spaceId);
  if (!existing || existing.orgId !== orgId) return undefined;
  if (existing.kind !== "event") {
    throw new Error("Wavesparks Community settings cannot be changed from the Events page.");
  }
  if (existing.lifecycle === "archived") {
    throw new Error("Restore an archived Event before editing it.");
  }

  const name = input.name === undefined ? existing.name : input.name.trim();
  if (!name) throw new Error("Event name is required.");
  const startsAt = input.startsAt === undefined
    ? existing.startsAt
    : eventDate(input.startsAt ?? undefined, "Event start date");
  const endsAt = input.endsAt === undefined
    ? existing.endsAt
    : eventDate(input.endsAt ?? undefined, "Event end date");
  validateEventDates(startsAt, endsAt);
  const lifecycle = input.lifecycle ?? existing.lifecycle;
  if (existing.lifecycle !== "draft" && lifecycle === "draft") {
    throw new Error(
      "A published Event cannot return to draft. Use Archive to close participant access.",
    );
  }
  const now = new Date().toISOString();
  const next: Space = {
    ...existing,
    name,
    description: input.description === undefined
      ? existing.description
      : input.description.trim(),
    eventLabel: input.eventLabel === undefined
      ? existing.eventLabel
      : input.eventLabel.trim(),
    startsAt,
    endsAt,
    lifecycle,
    endedAt: lifecycle === "ended" ? existing.endedAt ?? now : undefined,
    matchingEnabled: input.matchingEnabled ?? existing.matchingEnabled,
    updatedAt: now,
  };
  const cohort = legacyCohortForSpace(next);

  if (!usesDatabase) {
    Object.assign(existing, next);
    const storedCohort = getStore().cohorts.find((candidate) => candidate.id === spaceId);
    if (storedCohort) Object.assign(storedCohort, cohort);
    else getStore().cohorts.unshift(cohort);
    return existing;
  }

  const [row] = await getDb()
    .update(dbSchema.spaces)
    .set({
      name: next.name,
      description: next.description,
      eventLabel: next.eventLabel,
      startsAt: next.startsAt ? new Date(next.startsAt) : null,
      endsAt: next.endsAt ? new Date(next.endsAt) : null,
      lifecycle: next.lifecycle,
      endedAt: next.endedAt ? new Date(next.endedAt) : null,
      matchingEnabled: next.matchingEnabled,
      updatedAt: new Date(now),
    })
    .where(and(eq(dbSchema.spaces.id, spaceId), eq(dbSchema.spaces.orgId, orgId)))
    .returning();
  if (!row) return undefined;
  await getDb()
    .insert(dbSchema.cohorts)
    .values(cohortInsert(cohort))
    .onConflictDoUpdate({
      target: dbSchema.cohorts.id,
      set: {
        name: cohort.name,
        description: cohort.description,
        eventLabel: cohort.eventLabel,
        status: cohort.status,
        updatedAt: new Date(cohort.updatedAt),
      },
    });
  return spaceFromRow(row);
}

export async function archiveEventSpace(orgId: string, spaceId: string) {
  const existing = await getSpaceById(spaceId);
  if (!existing || existing.orgId !== orgId) return undefined;
  if (existing.kind === "main") {
    throw new Error("Wavesparks Community cannot be archived.");
  }
  if (existing.lifecycle === "archived") return existing;

  const now = new Date().toISOString();
  if (!usesDatabase) {
    existing.lifecycle = "archived";
    existing.archivedAt = now;
    existing.updatedAt = now;
    const cohort = getStore().cohorts.find((candidate) => candidate.id === spaceId);
    if (cohort) {
      cohort.status = "archived";
      cohort.updatedAt = now;
    }
    return existing;
  }

  const [row] = await getDb()
    .update(dbSchema.spaces)
    .set({ lifecycle: "archived", archivedAt: new Date(now), updatedAt: new Date(now) })
    .where(and(eq(dbSchema.spaces.id, spaceId), eq(dbSchema.spaces.orgId, orgId)))
    .returning();
  await getDb()
    .update(dbSchema.cohorts)
    .set({ status: "archived", updatedAt: new Date(now) })
    .where(and(eq(dbSchema.cohorts.id, spaceId), eq(dbSchema.cohorts.orgId, orgId)));
  return row ? spaceFromRow(row) : undefined;
}

export async function restoreEventSpace(
  orgId: string,
  spaceId: string,
  lifecycle?: Extract<SpaceLifecycle, "draft" | "upcoming" | "active" | "ended">,
) {
  const existing = await getSpaceById(spaceId);
  if (!existing || existing.orgId !== orgId) return undefined;
  if (existing.kind === "main") {
    throw new Error("Wavesparks Community does not use event dates or event status.");
  }
  if (existing.lifecycle !== "archived") return existing;

  const now = new Date().toISOString();
  const inferredLifecycle = lifecycle ?? (
    existing.endedAt || (existing.endsAt && new Date(existing.endsAt).getTime() < Date.now())
      ? "ended"
      : "active"
  );
  if (!usesDatabase) {
    existing.lifecycle = inferredLifecycle;
    existing.archivedAt = undefined;
    existing.endedAt = inferredLifecycle === "ended" ? existing.endedAt ?? now : undefined;
    existing.updatedAt = now;
    const cohort = getStore().cohorts.find((candidate) => candidate.id === spaceId);
    if (cohort) {
      cohort.status = "active";
      cohort.updatedAt = now;
    }
    return existing;
  }

  const [row] = await getDb()
    .update(dbSchema.spaces)
    .set({
      lifecycle: inferredLifecycle,
      archivedAt: null,
      endedAt: inferredLifecycle === "ended" ? maybeDate(existing.endedAt ?? now) : null,
      updatedAt: new Date(now),
    })
    .where(and(eq(dbSchema.spaces.id, spaceId), eq(dbSchema.spaces.orgId, orgId)))
    .returning();
  await getDb()
    .update(dbSchema.cohorts)
    .set({ status: "active", updatedAt: new Date(now) })
    .where(and(eq(dbSchema.cohorts.id, spaceId), eq(dbSchema.cohorts.orgId, orgId)));
  return row ? spaceFromRow(row) : undefined;
}

export async function getSpaceMembership(spaceId: string, membershipId: string) {
  if (!usesDatabase) {
    return getStore().spaceMemberships.find(
      (spaceMembership) =>
        spaceMembership.spaceId === spaceId &&
        spaceMembership.membershipId === membershipId,
    );
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.spaceMemberships)
    .where(
      and(
        eq(dbSchema.spaceMemberships.spaceId, spaceId),
        eq(dbSchema.spaceMemberships.membershipId, membershipId),
      ),
    )
    .limit(1);
  return row ? spaceMembershipFromRow(row) : undefined;
}

async function ensureLegacyEventMembership(
  space: Space,
  membership: Membership,
) {
  if (space.kind !== "event") return undefined;
  const cohort = await getCohortById(space.id);
  if (!cohort) return undefined;
  if (cohort.orgId !== space.orgId) {
    throw new Error("Legacy Event mapping is invalid.");
  }
  const user = await getUserById(membership.userId);
  if (!user) throw new Error("Membership user not found.");
  return upsertCohortMember({
    orgId: space.orgId,
    cohortId: space.id,
    membership,
    email: user.email,
    name: user.name,
  });
}

export async function grantSpaceMembership(input: {
  orgId: string;
  spaceId: string;
  membershipId: string;
  accessStatus?: Extract<SpaceAccessStatus, "active" | "waitlist">;
  joinedVia?: SpaceJoinSource;
  invitedByMembershipId?: string;
  sourceSpaceId?: string;
  decisionNote?: string;
}): Promise<SpaceMembershipGrantResult> {
  const [space, membership, existing] = await Promise.all([
    getSpaceById(input.spaceId),
    getMembershipById(input.membershipId),
    getSpaceMembership(input.spaceId, input.membershipId),
  ]);
  if (!space || space.orgId !== input.orgId) {
    throw new Error("The selected community or event could not be found.");
  }
  if (space.lifecycle === "archived") {
    throw new Error("Restore this archived event before adding participants.");
  }
  if (!membership || membership.orgId !== input.orgId) {
    throw new Error("Membership does not belong to this organization.");
  }
  if (membership.accountStatus === "suspended" || membership.accountStatus === "deprovisioned") {
    throw new Error(`Account is ${membership.accountStatus}.`);
  }
  if (input.invitedByMembershipId) {
    const inviter = await getMembershipById(input.invitedByMembershipId);
    if (!inviter || inviter.orgId !== input.orgId) {
      throw new Error("Inviter does not belong to this organization.");
    }
  }
  if (input.sourceSpaceId) {
    const sourceSpace = await getSpaceById(input.sourceSpaceId);
    if (!sourceSpace || sourceSpace.orgId !== input.orgId) {
      throw new Error("The source Event could not be found.");
    }
  }

  const requestedAccess = input.accessStatus ?? "active";
  if (existing?.accessStatus === "active") {
    await ensureLegacyEventMembership(space, membership);
    return {
      space,
      spaceMembership: existing,
      created: false,
      updated: false,
      outcome: "already_active",
    };
  }
  if (existing?.accessStatus === "waitlist" && requestedAccess === "waitlist") {
    await ensureLegacyEventMembership(space, membership);
    return {
      space,
      spaceMembership: existing,
      created: false,
      updated: false,
      outcome: "already_waitlisted",
    };
  }
  if (
    existing &&
    (existing.accessStatus === "rejected" ||
      existing.accessStatus === "suspended" ||
      existing.accessStatus === "removed")
  ) {
    return {
      space,
      spaceMembership: existing,
      created: false,
      updated: false,
      outcome: "conflict",
      conflictStatus: existing.accessStatus,
    };
  }

  const now = new Date().toISOString();
  if (existing) {
    const next: SpaceMembership = {
      ...existing,
      accessStatus: "active",
      decisionNote: input.decisionNote?.trim() || existing.decisionNote,
      grantedAt: existing.grantedAt ?? now,
      removedAt: undefined,
      updatedAt: now,
    };
    if (!usesDatabase) {
      Object.assign(existing, next);
    } else {
      const [row] = await getDb()
        .update(dbSchema.spaceMemberships)
        .set({
          accessStatus: "active",
          decisionNote: next.decisionNote,
          grantedAt: new Date(next.grantedAt!),
          removedAt: null,
          updatedAt: new Date(now),
        })
        .where(
          and(
            eq(dbSchema.spaceMemberships.spaceId, space.id),
            eq(dbSchema.spaceMemberships.membershipId, membership.id),
          ),
        )
        .returning();
      if (!row) throw new Error("Unable to activate access.");
      Object.assign(next, spaceMembershipFromRow(row));
    }
    await ensureLegacyEventMembership(space, membership);
    return {
      space,
      spaceMembership: next,
      created: false,
      updated: true,
      outcome: "activated_waitlist",
    };
  }

  const next: SpaceMembership = {
    id: `spm_${createHash("sha256")
      .update(`${space.id}:${membership.id}`)
      .digest("hex")
      .slice(0, 24)}`,
    orgId: input.orgId,
    spaceId: space.id,
    membershipId: membership.id,
    accessStatus: requestedAccess,
    joinedVia: input.joinedVia ?? "direct",
    invitedByMembershipId: input.invitedByMembershipId,
    sourceSpaceId: input.sourceSpaceId,
    decisionNote: input.decisionNote?.trim() || undefined,
    grantedAt: requestedAccess === "active" ? now : undefined,
    createdAt: now,
    updatedAt: now,
  };
  let created = true;
  let persisted = next;
  if (!usesDatabase) {
    getStore().spaceMemberships.push(next);
  } else {
    const [row] = await getDb()
      .insert(dbSchema.spaceMemberships)
      .values(spaceMembershipInsert(next))
      .onConflictDoNothing({
        target: [
          dbSchema.spaceMemberships.spaceId,
          dbSchema.spaceMemberships.membershipId,
        ],
      })
      .returning();
    if (row) {
      persisted = spaceMembershipFromRow(row);
    } else {
      created = false;
      const concurrent = await getSpaceMembership(space.id, membership.id);
      if (!concurrent) throw new Error("Unable to add access.");
      persisted = concurrent;
    }
  }
  await ensureLegacyEventMembership(space, membership);
  if (!created) {
    if (persisted.accessStatus === "active") {
      return {
        space,
        spaceMembership: persisted,
        created: false,
        updated: false,
        outcome: "already_active",
      };
    }
    if (persisted.accessStatus === "waitlist") {
      if (requestedAccess === "active") {
        const activated = await setSpaceMembershipAccessStatus({
          orgId: input.orgId,
          spaceId: space.id,
          membershipId: membership.id,
          accessStatus: "active",
          actorMembershipId: input.invitedByMembershipId,
          decisionNote: input.decisionNote,
          joinedVia: input.joinedVia,
          sourceSpaceId: input.sourceSpaceId,
        });
        return {
          space,
          spaceMembership: activated,
          created: false,
          updated: true,
          outcome: "activated_waitlist",
        };
      }
      return {
        space,
        spaceMembership: persisted,
        created: false,
        updated: false,
        outcome: "already_waitlisted",
      };
    }
    return {
      space,
      spaceMembership: persisted,
      created: false,
      updated: false,
      outcome: "conflict",
      conflictStatus: persisted.accessStatus as Extract<
        SpaceAccessStatus,
        "rejected" | "suspended" | "removed"
      >,
    };
  }
  return {
    space,
    spaceMembership: persisted,
    created: true,
    updated: false,
    outcome: "added",
  };
}

export async function setSpaceMembershipAccessStatus(input: {
  orgId: string;
  spaceId: string;
  membershipId: string;
  accessStatus: SpaceAccessStatus;
  actorMembershipId?: string;
  decisionNote?: string;
  joinedVia?: SpaceJoinSource;
  sourceSpaceId?: string;
}) {
  const [space, membership, existing] = await Promise.all([
    getSpaceById(input.spaceId),
    getMembershipById(input.membershipId),
    getSpaceMembership(input.spaceId, input.membershipId),
  ]);
  if (!space || space.orgId !== input.orgId) {
    throw new Error("The selected community or event could not be found.");
  }
  if (!membership || membership.orgId !== input.orgId) {
    throw new Error("Membership does not belong to this organization.");
  }
  if (
    (input.accessStatus === "active" || input.accessStatus === "waitlist") &&
    (membership.accountStatus === "suspended" ||
      membership.accountStatus === "deprovisioned")
  ) {
    throw new Error(`Account is ${membership.accountStatus}.`);
  }
  if (space.kind === "main" && space.lifecycle !== "active") {
    throw new Error("Wavesparks Community is not available right now.");
  }
  if (space.kind === "event" && space.lifecycle === "archived" && input.accessStatus === "active") {
    throw new Error("Restore the Event before activating member access.");
  }

  const now = new Date().toISOString();
  const next: SpaceMembership = {
    id: existing?.id ?? `spm_${createHash("sha256")
      .update(`${space.id}:${membership.id}`)
      .digest("hex")
      .slice(0, 24)}`,
    orgId: input.orgId,
    spaceId: space.id,
    membershipId: membership.id,
    accessStatus: input.accessStatus,
    joinedVia: existing?.joinedVia ?? input.joinedVia ?? "direct",
    invitedByMembershipId: existing?.invitedByMembershipId ?? input.actorMembershipId,
    sourceSpaceId: existing?.sourceSpaceId ?? input.sourceSpaceId,
    decisionNote: input.decisionNote?.trim() || existing?.decisionNote,
    grantedAt:
      input.accessStatus === "active"
        ? existing?.grantedAt ?? now
        : existing?.grantedAt,
    removedAt: input.accessStatus === "removed" ? now : undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  if (!usesDatabase) {
    if (existing) Object.assign(existing, next);
    else getStore().spaceMemberships.push(next);
  } else {
    const [row] = await getDb()
      .insert(dbSchema.spaceMemberships)
      .values(spaceMembershipInsert(next))
      .onConflictDoUpdate({
        target: [
          dbSchema.spaceMemberships.spaceId,
          dbSchema.spaceMemberships.membershipId,
        ],
        set: {
          accessStatus: next.accessStatus,
          decisionNote: next.decisionNote,
          grantedAt: maybeDate(next.grantedAt),
          removedAt: next.removedAt ? new Date(next.removedAt) : null,
          updatedAt: new Date(now),
        },
      })
      .returning();
    if (!row) throw new Error("Unable to update access.");
    Object.assign(next, spaceMembershipFromRow(row));
  }
  if (space.kind === "event" && input.accessStatus !== "removed") {
    await ensureLegacyEventMembership(space, membership);
  }
  return next;
}

export async function addMembershipsToMainCommunity(input: {
  orgId: string;
  sourceSpaceId: string;
  membershipIds: string[];
  actorMembershipId: string;
  decisionNote?: string;
}): Promise<AddToMainCommunityResult[]> {
  const membershipIds = [...new Set(input.membershipIds.filter(Boolean))];
  if (membershipIds.length > 100) {
    throw new Error("Add no more than 100 people to Wavesparks Community at a time.");
  }
  const spaces = await listSpacesForOrg(input.orgId);
  const sourceSpace = spaces.find((space) => space.id === input.sourceSpaceId);
  const mainSpace = spaces.find((space) => space.kind === "main");
  if (!sourceSpace || sourceSpace.kind !== "event") {
    throw new Error("Source Event not found.");
  }
  if (sourceSpace.lifecycle === "archived") {
    throw new Error("Restore the archived event before adding participants to Wavesparks Community.");
  }
  if (!mainSpace || mainSpace.lifecycle !== "active") {
    throw new Error("Wavesparks Community is not configured correctly.");
  }
  const actor = await getMembershipById(input.actorMembershipId);
  if (!actor || actor.orgId !== input.orgId || actor.role !== "org_admin") {
    throw new Error("An organization administrator is required.");
  }

  const results: AddToMainCommunityResult[] = [];
  for (const membershipId of membershipIds) {
    try {
      const [membership, sourceAccess, mainAccess] = await Promise.all([
        getMembershipById(membershipId),
        getSpaceMembership(sourceSpace.id, membershipId),
        getSpaceMembership(mainSpace.id, membershipId),
      ]);
      if (!membership || membership.orgId !== input.orgId) {
        results.push({
          membershipId,
          status: "failed",
          message: "Membership was not found in this organization.",
        });
        continue;
      }
      if (!sourceAccess || sourceAccess.accessStatus !== "active") {
        results.push({
          membershipId,
          status: "failed",
          message: "This person no longer has active access to the source Event.",
        });
        continue;
      }
      if (
        membership.accountStatus === "suspended" ||
        membership.accountStatus === "deprovisioned"
      ) {
        results.push({
          membershipId,
          status: "account_conflict",
          message:
            membership.accountStatus === "suspended"
              ? "This account is paused. Restore it before continuing."
              : "This account is no longer active. Restore it before continuing.",
        });
        continue;
      }
      if (mainAccess?.accessStatus === "active") {
        results.push({
          membershipId,
          status: "already_in_main",
          message: "Already in Wavesparks Community; no changes were made.",
          spaceMembership: mainAccess,
        });
        continue;
      }
      if (
        mainAccess?.accessStatus === "rejected" ||
        mainAccess?.accessStatus === "suspended" ||
        mainAccess?.accessStatus === "removed"
      ) {
        results.push({
          membershipId,
          status: "account_conflict",
          message: `Wavesparks Community access is ${mainAccess.accessStatus}. Review it in member details before continuing.`,
          spaceMembership: mainAccess,
        });
        continue;
      }

      const grant = await grantSpaceMembership({
        orgId: input.orgId,
        spaceId: mainSpace.id,
        membershipId,
        accessStatus: "active",
        joinedVia: "promotion",
        invitedByMembershipId: input.actorMembershipId,
        sourceSpaceId: sourceSpace.id,
        decisionNote: input.decisionNote,
      });
      if (grant.outcome === "conflict") {
        results.push({
          membershipId,
          status: "account_conflict",
          message: `Wavesparks Community access is ${grant.conflictStatus}. Review it in member details before continuing.`,
          spaceMembership: grant.spaceMembership,
        });
      } else if (grant.outcome === "already_active") {
        results.push({
          membershipId,
          status: "already_in_main",
          message: "Already in Wavesparks Community; no changes were made.",
          spaceMembership: grant.spaceMembership,
        });
      } else {
        results.push({
          membershipId,
          status: "added",
          message: "Added to Wavesparks Community. Event access was not changed.",
          spaceMembership: grant.spaceMembership,
        });
      }
    } catch (error) {
      results.push({
        membershipId,
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to add this person to Wavesparks Community.",
      });
    }
  }
  return results;
}

export async function listVisibleSpacesForMembership(
  membershipId: string,
): Promise<SpaceMembershipRecord[]> {
  if (!usesDatabase) {
    const store = getStore();
    const membership = store.memberships.find((candidate) => candidate.id === membershipId);
    if (!membership || membership.accountStatus !== "connected") return [];
    const spacesById = new Map(
      store.spaces
        .filter(
          (space) =>
            space.orgId === membership.orgId &&
            space.lifecycle !== "draft" &&
            space.lifecycle !== "archived",
        )
        .map((space) => [space.id, space]),
    );
    return store.spaceMemberships
      .filter(
        (spaceMembership) =>
          spaceMembership.membershipId === membershipId &&
          spaceMembership.orgId === membership.orgId &&
          spaceMembership.accessStatus === "active" &&
          spacesById.has(spaceMembership.spaceId),
      )
      .map((spaceMembership) => ({
        space: spacesById.get(spaceMembership.spaceId)!,
        spaceMembership,
      }))
      .sort((left, right) => sortSpaces(left.space, right.space));
  }

  const rows = await getDb()
    .select({
      space: dbSchema.spaces,
      spaceMembership: dbSchema.spaceMemberships,
    })
    .from(dbSchema.spaceMemberships)
    .innerJoin(dbSchema.spaces, eq(dbSchema.spaces.id, dbSchema.spaceMemberships.spaceId))
    .innerJoin(
      dbSchema.memberships,
      eq(dbSchema.memberships.id, dbSchema.spaceMemberships.membershipId),
    )
    .where(
      and(
        eq(dbSchema.spaceMemberships.membershipId, membershipId),
        eq(dbSchema.spaceMemberships.accessStatus, "active"),
        eq(dbSchema.memberships.accountStatus, "connected"),
        sql`${dbSchema.spaces.lifecycle} not in ('draft', 'archived')`,
      ),
    );
  return rows
    .map((row) => ({
      space: spaceFromRow(row.space),
      spaceMembership: spaceMembershipFromRow(row.spaceMembership),
    }))
    .sort((left, right) => sortSpaces(left.space, right.space));
}

export async function listActiveSpaceMemberRecords(
  spaceId: string,
): Promise<ActiveSpaceMemberRecord[]> {
  if (!usesDatabase) {
    const store = getStore();
    const space = store.spaces.find((candidate) => candidate.id === spaceId);
    if (!space) return [];
    const membershipById = new Map(
      store.memberships
        .filter(
          (membership) =>
            membership.orgId === space.orgId && membership.accountStatus === "connected",
        )
        .map((membership) => [membership.id, membership]),
    );
    return store.spaceMemberships.flatMap((spaceMembership) => {
      const membership = membershipById.get(spaceMembership.membershipId);
      if (
        spaceMembership.spaceId !== spaceId ||
        spaceMembership.orgId !== space.orgId ||
        spaceMembership.accessStatus !== "active" ||
        !membership
      ) {
        return [];
      }
      return [{
        spaceMembership,
        membership,
        user: store.users.find((user) => user.id === membership.userId),
        profile: store.profiles.find((profile) => profile.membershipId === membership.id),
        intent: store.spaceIntents.find(
          (intent) =>
            intent.spaceId === spaceId && intent.membershipId === membership.id,
        ),
      }];
    });
  }

  const rows = await getDb()
    .select({
      spaceMembership: dbSchema.spaceMemberships,
      membership: dbSchema.memberships,
      user: dbSchema.users,
      profile: dbSchema.profiles,
      intent: dbSchema.spaceIntents,
    })
    .from(dbSchema.spaceMemberships)
    .innerJoin(
      dbSchema.memberships,
      and(
        eq(dbSchema.memberships.id, dbSchema.spaceMemberships.membershipId),
        eq(dbSchema.memberships.orgId, dbSchema.spaceMemberships.orgId),
      ),
    )
    .leftJoin(dbSchema.users, eq(dbSchema.users.id, dbSchema.memberships.userId))
    .leftJoin(dbSchema.profiles, eq(dbSchema.profiles.membershipId, dbSchema.memberships.id))
    .leftJoin(
      dbSchema.spaceIntents,
      and(
        eq(dbSchema.spaceIntents.spaceId, dbSchema.spaceMemberships.spaceId),
        eq(dbSchema.spaceIntents.membershipId, dbSchema.spaceMemberships.membershipId),
      ),
    )
    .where(
      and(
        eq(dbSchema.spaceMemberships.spaceId, spaceId),
        eq(dbSchema.spaceMemberships.accessStatus, "active"),
        eq(dbSchema.memberships.accountStatus, "connected"),
      ),
    );
  return rows.map((row) => ({
    spaceMembership: spaceMembershipFromRow(row.spaceMembership),
    membership: membershipFromRow(row.membership),
    user: row.user ? userFromRow(row.user) : undefined,
    profile: row.profile ? profileFromRow(row.profile) : undefined,
    intent: row.intent ? spaceIntentFromRow(row.intent) : undefined,
  }));
}

export async function getSpaceIntent(spaceId: string, membershipId: string) {
  if (!usesDatabase) {
    return getStore().spaceIntents.find(
      (intent) => intent.spaceId === spaceId && intent.membershipId === membershipId,
    );
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.spaceIntents)
    .where(
      and(
        eq(dbSchema.spaceIntents.spaceId, spaceId),
        eq(dbSchema.spaceIntents.membershipId, membershipId),
      ),
    )
    .limit(1);
  return row ? spaceIntentFromRow(row) : undefined;
}

export async function upsertSpaceIntent(intent: SpaceIntent) {
  const [space, spaceMembership] = await Promise.all([
    getSpaceById(intent.spaceId),
    getSpaceMembership(intent.spaceId, intent.membershipId),
  ]);
  if (
    !space ||
    !spaceMembership ||
    space.orgId !== intent.orgId ||
    spaceMembership.orgId !== intent.orgId
  ) {
    throw new Error("Space intent must belong to an existing membership in the same space.");
  }

  if (!usesDatabase) {
    const store = getStore();
    const existing = store.spaceIntents.find(
      (candidate) =>
        candidate.spaceId === intent.spaceId &&
        candidate.membershipId === intent.membershipId,
    );
    if (existing) {
      Object.assign(existing, intent, { id: existing.id });
      return existing;
    }
    store.spaceIntents.push(intent);
    return intent;
  }

  const insert = spaceIntentInsert(intent);
  const [row] = await getDb()
    .insert(dbSchema.spaceIntents)
    .values(insert)
    .onConflictDoUpdate({
      target: [dbSchema.spaceIntents.spaceId, dbSchema.spaceIntents.membershipId],
      set: {
        currentGoal: insert.currentGoal,
        lookingFor: insert.lookingFor,
        offers: insert.offers,
        matchingOptIn: insert.matchingOptIn,
        intentComplete: insert.intentComplete,
        seekingText: insert.seekingText,
        offeringText: insert.offeringText,
        seekingEmbedding: insert.seekingEmbedding,
        offeringEmbedding: insert.offeringEmbedding,
        embeddingModel: insert.embeddingModel,
        embeddingSourceHash: insert.embeddingSourceHash,
        embeddingStatus: insert.embeddingStatus,
        embeddingError: insert.embeddingError,
        embeddingUpdatedAt: insert.embeddingUpdatedAt,
        updatedAt: insert.updatedAt,
      },
    })
    .returning();
  return spaceIntentFromRow(row);
}

export async function getProfileById(profileId: string) {
  if (!usesDatabase) {
    return getStore().profiles.find((profile) => profile.id === profileId);
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.profiles)
    .where(eq(dbSchema.profiles.id, profileId))
    .limit(1);
  return row ? profileFromRow(row) : undefined;
}

export async function getMembershipRecordById(
  membershipId: string,
): Promise<MembershipRecord | undefined> {
  if (!usesDatabase) {
    const store = getStore();
    const membership = store.memberships.find((candidate) => candidate.id === membershipId);
    if (!membership) {
      return undefined;
    }

    return {
      membership,
      user: store.users.find((user) => user.id === membership.userId),
      profile: store.profiles.find((profile) => profile.membershipId === membership.id),
    };
  }

  const [row] = await getDb()
    .select({
      membership: dbSchema.memberships,
      user: dbSchema.users,
      profile: dbSchema.profiles,
    })
    .from(dbSchema.memberships)
    .leftJoin(dbSchema.users, eq(dbSchema.users.id, dbSchema.memberships.userId))
    .leftJoin(dbSchema.profiles, eq(dbSchema.profiles.membershipId, dbSchema.memberships.id))
    .where(eq(dbSchema.memberships.id, membershipId))
    .limit(1);

  return row
    ? {
        membership: membershipFromRow(row.membership),
        user: row.user ? userFromRow(row.user) : undefined,
        profile: row.profile ? profileFromRow(row.profile) : undefined,
      }
    : undefined;
}

export async function getProfileRecordById(
  profileId: string,
): Promise<ProfileRecord | undefined> {
  if (!usesDatabase) {
    const store = getStore();
    const profile = store.profiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      return undefined;
    }

    const membership = store.memberships.find(
      (candidate) => candidate.id === profile.membershipId,
    );
    return {
      profile,
      membership,
      user: membership
        ? store.users.find((user) => user.id === membership.userId)
        : undefined,
    };
  }

  const [row] = await getDb()
    .select({
      profile: dbSchema.profiles,
      membership: dbSchema.memberships,
      user: dbSchema.users,
    })
    .from(dbSchema.profiles)
    .leftJoin(dbSchema.memberships, eq(dbSchema.memberships.id, dbSchema.profiles.membershipId))
    .leftJoin(dbSchema.users, eq(dbSchema.users.id, dbSchema.memberships.userId))
    .where(eq(dbSchema.profiles.id, profileId))
    .limit(1);

  return row
    ? {
        profile: profileFromRow(row.profile),
        membership: row.membership ? membershipFromRow(row.membership) : undefined,
        user: row.user ? userFromRow(row.user) : undefined,
      }
    : undefined;
}

export async function listProfileRecordsByIds(
  profileIds: string[],
  options: { orgId?: string } = {},
): Promise<ProfileRecord[]> {
  const uniqueIds = [...new Set(profileIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return [];
  }

  if (!usesDatabase) {
    const ids = new Set(uniqueIds);
    const store = getStore();
    return store.profiles
      .filter((profile) => ids.has(profile.id))
      .map((profile) => {
        const membership = store.memberships.find(
          (candidate) => candidate.id === profile.membershipId,
        );
        return {
          profile,
          membership,
          user: membership
            ? store.users.find((user) => user.id === membership.userId)
            : undefined,
        };
      })
      .filter(
        (record) =>
          !options.orgId || record.membership?.orgId === options.orgId,
      );
  }

  const rows = await getDb()
    .select({
      profile: dbSchema.profiles,
      membership: dbSchema.memberships,
      user: dbSchema.users,
    })
    .from(dbSchema.profiles)
    .leftJoin(dbSchema.memberships, eq(dbSchema.memberships.id, dbSchema.profiles.membershipId))
    .leftJoin(dbSchema.users, eq(dbSchema.users.id, dbSchema.memberships.userId))
    .where(
      options.orgId
        ? and(
            inArray(dbSchema.profiles.id, uniqueIds),
            eq(dbSchema.memberships.orgId, options.orgId),
          )
        : inArray(dbSchema.profiles.id, uniqueIds),
    );

  return rows.map((row) => ({
    profile: profileFromRow(row.profile),
    membership: row.membership ? membershipFromRow(row.membership) : undefined,
    user: row.user ? userFromRow(row.user) : undefined,
  }));
}

export async function listProfileMembershipRecordsByIds(
  profileIds: string[],
  options: { orgId?: string } = {},
): Promise<ProfileRecord[]> {
  const uniqueIds = [...new Set(profileIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return [];
  }

  if (!usesDatabase) {
    const ids = new Set(uniqueIds);
    const store = getStore();
    return store.profiles
      .filter((profile) => ids.has(profile.id))
      .map((profile) => {
        const membership = store.memberships.find(
          (candidate) => candidate.id === profile.membershipId,
        );
        return {
          profile,
          membership,
        };
      })
      .filter(
        (record) =>
          !options.orgId || record.membership?.orgId === options.orgId,
      );
  }

  const rows = await getDb()
    .select({
      profile: dbSchema.profiles,
      membership: dbSchema.memberships,
    })
    .from(dbSchema.profiles)
    .leftJoin(dbSchema.memberships, eq(dbSchema.memberships.id, dbSchema.profiles.membershipId))
    .where(
      options.orgId
        ? and(
            inArray(dbSchema.profiles.id, uniqueIds),
            eq(dbSchema.memberships.orgId, options.orgId),
          )
        : inArray(dbSchema.profiles.id, uniqueIds),
    );

  return rows.map((row) => ({
    profile: profileFromRow(row.profile),
    membership: row.membership ? membershipFromRow(row.membership) : undefined,
  }));
}

export async function listProfileLinks(profileId: string) {
  if (!usesDatabase) {
    return getStore().profileLinks.filter((link) => link.profileId === profileId);
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.profileLinks)
    .where(eq(dbSchema.profileLinks.profileId, profileId));
  return rows.map(profileLinkFromRow);
}

export async function listProfileLinksByProfileIds(profileIds: string[]) {
  const uniqueIds = [...new Set(profileIds.filter(Boolean))];
  const linksByProfileId = new Map<string, ProfileLink[]>();

  if (!uniqueIds.length) {
    return linksByProfileId;
  }

  for (const profileId of uniqueIds) {
    linksByProfileId.set(profileId, []);
  }

  const links = !usesDatabase
    ? getStore().profileLinks.filter((link) => linksByProfileId.has(link.profileId))
    : (await getDb()
        .select()
        .from(dbSchema.profileLinks)
        .where(inArray(dbSchema.profileLinks.profileId, uniqueIds))).map(profileLinkFromRow);

  for (const link of links) {
    linksByProfileId.get(link.profileId)?.push(link);
  }

  return linksByProfileId;
}

export async function listMembershipsForOrg(orgId: string) {
  if (!usesDatabase) {
    return getStore().memberships.filter((membership) => membership.orgId === orgId);
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.memberships)
    .where(eq(dbSchema.memberships.orgId, orgId));
  return rows.map(membershipFromRow);
}

function matchesInvitationFilter(
  membership: Membership,
  invitationStatus: MemberWorkspaceInvitationStatus | undefined,
) {
  if (!invitationStatus) {
    return true;
  }

  if (invitationStatus === "connected") {
    return Boolean(membership.clerkMembershipId);
  }

  if (invitationStatus === "not_invited") {
    return !membership.clerkMembershipId && !membership.clerkInvitationStatus;
  }

  return membership.clerkInvitationStatus === invitationStatus;
}

async function listCohortsByMembershipIds(
  orgId: string,
  membershipIds: string[],
): Promise<Map<string, Cohort[]>> {
  const uniqueMembershipIds = [...new Set(membershipIds.filter(Boolean))];
  const cohortsByMembershipId = new Map<string, Cohort[]>(
    uniqueMembershipIds.map((membershipId) => [membershipId, []]),
  );

  if (!uniqueMembershipIds.length) {
    return cohortsByMembershipId;
  }

  if (!usesDatabase) {
    const store = getStore();
    const cohortsById = new Map(
      store.cohorts
        .filter((cohort) => cohort.orgId === orgId)
        .map((cohort) => [cohort.id, cohort]),
    );
    for (const cohortMember of store.cohortMembers) {
      if (
        cohortMember.orgId !== orgId ||
        !cohortsByMembershipId.has(cohortMember.membershipId)
      ) {
        continue;
      }

      const cohort = cohortsById.get(cohortMember.cohortId);
      if (cohort) {
        cohortsByMembershipId.get(cohortMember.membershipId)?.push(cohort);
      }
    }
  } else {
    const rows = await getDb()
      .select({
        membershipId: dbSchema.cohortMembers.membershipId,
        cohort: dbSchema.cohorts,
      })
      .from(dbSchema.cohortMembers)
      .innerJoin(dbSchema.cohorts, eq(dbSchema.cohorts.id, dbSchema.cohortMembers.cohortId))
      .where(
        and(
          eq(dbSchema.cohortMembers.orgId, orgId),
          eq(dbSchema.cohorts.orgId, orgId),
          inArray(dbSchema.cohortMembers.membershipId, uniqueMembershipIds),
        ),
      );

    for (const row of rows) {
      cohortsByMembershipId.get(row.membershipId)?.push(cohortFromRow(row.cohort));
    }
  }

  for (const cohortsForMember of cohortsByMembershipId.values()) {
    cohortsForMember.sort((left, right) => left.name.localeCompare(right.name));
  }
  return cohortsByMembershipId;
}

export async function listSpaceMembershipRecordsByMembershipIds(
  orgId: string,
  membershipIds: string[],
): Promise<Map<string, SpaceMembershipRecord[]>> {
  const uniqueMembershipIds = [...new Set(membershipIds.filter(Boolean))];
  const recordsByMembershipId = new Map<string, SpaceMembershipRecord[]>(
    uniqueMembershipIds.map((membershipId) => [membershipId, []]),
  );
  if (!uniqueMembershipIds.length) return recordsByMembershipId;

  if (!usesDatabase) {
    const store = getStore();
    const spacesById = new Map(
      store.spaces
        .filter((space) => space.orgId === orgId)
        .map((space) => [space.id, space]),
    );
    for (const spaceMembership of store.spaceMemberships) {
      if (
        spaceMembership.orgId !== orgId ||
        !recordsByMembershipId.has(spaceMembership.membershipId)
      ) {
        continue;
      }
      const space = spacesById.get(spaceMembership.spaceId);
      if (space) {
        recordsByMembershipId.get(spaceMembership.membershipId)?.push({
          space,
          spaceMembership,
        });
      }
    }
  } else {
    const rows = await getDb()
      .select({
        space: dbSchema.spaces,
        spaceMembership: dbSchema.spaceMemberships,
      })
      .from(dbSchema.spaceMemberships)
      .innerJoin(
        dbSchema.spaces,
        and(
          eq(dbSchema.spaces.id, dbSchema.spaceMemberships.spaceId),
          eq(dbSchema.spaces.orgId, dbSchema.spaceMemberships.orgId),
        ),
      )
      .where(
        and(
          eq(dbSchema.spaceMemberships.orgId, orgId),
          inArray(dbSchema.spaceMemberships.membershipId, uniqueMembershipIds),
        ),
      );
    for (const row of rows) {
      const spaceMembership = spaceMembershipFromRow(row.spaceMembership);
      recordsByMembershipId.get(spaceMembership.membershipId)?.push({
        space: spaceFromRow(row.space),
        spaceMembership,
      });
    }
  }

  for (const records of recordsByMembershipId.values()) {
    records.sort((left, right) => sortSpaces(left.space, right.space));
  }
  return recordsByMembershipId;
}

export async function listMemberWorkspaceForOrg(
  orgId: string,
  options: MemberWorkspaceOptions = {},
): Promise<MemberWorkspacePage> {
  const queryText = options.query?.trim() ?? "";
  const normalizedQuery = queryText.toLowerCase();
  const pageSize = Math.min(100, positiveInteger(options.pageSize, 25));
  const requestedPage = positiveInteger(options.page, 1);
  const requestedSpaceId = options.spaceId ?? options.cohortId;

  if (!usesDatabase) {
    const store = getStore();
    const spaceMembershipIds = requestedSpaceId
      ? new Set(
          store.spaceMemberships
            .filter(
              (spaceMembership) =>
                spaceMembership.orgId === orgId &&
                spaceMembership.spaceId === requestedSpaceId,
            )
            .map((spaceMembership) => spaceMembership.membershipId),
        )
      : undefined;
    const records = store.memberships
      .filter((membership) => {
        if (
          membership.orgId !== orgId ||
          (options.accountStatus && membership.accountStatus !== options.accountStatus) ||
          (options.status && membership.status !== options.status) ||
          !matchesInvitationFilter(membership, options.invitationStatus) ||
          (spaceMembershipIds && !spaceMembershipIds.has(membership.id))
        ) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const user = store.users.find((candidate) => candidate.id === membership.userId);
        return Boolean(
          user &&
            (user.name.toLowerCase().includes(normalizedQuery) ||
              user.email.toLowerCase().includes(normalizedQuery)),
        );
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const total = records.length;
    const pageCount = total ? Math.ceil(total / pageSize) : 0;
    const page = pageCount ? Math.min(requestedPage, pageCount) : 1;
    const pageMemberships = records.slice((page - 1) * pageSize, page * pageSize);
    const [cohortsByMembershipId, spacesByMembershipId] = await Promise.all([
      listCohortsByMembershipIds(
        orgId,
        pageMemberships.map((membership) => membership.id),
      ),
      listSpaceMembershipRecordsByMembershipIds(
        orgId,
        pageMemberships.map((membership) => membership.id),
      ),
    ]);

    return {
      records: pageMemberships.map((membership) => ({
        membership,
        user: store.users.find((user) => user.id === membership.userId),
        profile: store.profiles.find((profile) => profile.membershipId === membership.id),
        spaces: spacesByMembershipId.get(membership.id) ?? [],
        cohorts: cohortsByMembershipId.get(membership.id) ?? [],
      })),
      total,
      page,
      pageSize,
      pageCount,
    };
  }

  const spaceMembershipQuery = requestedSpaceId
    ? getDb()
        .select({ membershipId: dbSchema.spaceMemberships.membershipId })
        .from(dbSchema.spaceMemberships)
        .where(
          and(
            eq(dbSchema.spaceMemberships.orgId, orgId),
            eq(dbSchema.spaceMemberships.spaceId, requestedSpaceId),
          ),
        )
    : undefined;
  const invitationCondition =
    options.invitationStatus === "connected"
      ? sql`${dbSchema.memberships.clerkMembershipId} is not null`
      : options.invitationStatus === "not_invited"
        ? sql`${dbSchema.memberships.clerkMembershipId} is null and ${dbSchema.memberships.clerkInvitationStatus} is null`
        : options.invitationStatus
          ? eq(dbSchema.memberships.clerkInvitationStatus, options.invitationStatus)
          : undefined;
  const filters = and(
    eq(dbSchema.memberships.orgId, orgId),
    options.accountStatus
      ? eq(dbSchema.memberships.accountStatus, options.accountStatus)
      : undefined,
    options.status ? eq(dbSchema.memberships.status, options.status) : undefined,
    queryText
      ? or(
          ilike(dbSchema.users.name, `%${queryText}%`),
          ilike(dbSchema.users.email, `%${queryText}%`),
        )
      : undefined,
    invitationCondition,
    spaceMembershipQuery
      ? inArray(dbSchema.memberships.id, spaceMembershipQuery)
      : undefined,
  );
  const [countRow] = await getDb()
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(dbSchema.memberships)
    .leftJoin(dbSchema.users, eq(dbSchema.users.id, dbSchema.memberships.userId))
    .where(filters);
  const total = countRow?.total ?? 0;
  const pageCount = total ? Math.ceil(total / pageSize) : 0;
  const page = pageCount ? Math.min(requestedPage, pageCount) : 1;
  const rows = await getDb()
    .select({
      membership: dbSchema.memberships,
      user: dbSchema.users,
      profile: dbSchema.profiles,
    })
    .from(dbSchema.memberships)
    .leftJoin(dbSchema.users, eq(dbSchema.users.id, dbSchema.memberships.userId))
    .leftJoin(dbSchema.profiles, eq(dbSchema.profiles.membershipId, dbSchema.memberships.id))
    .where(filters)
    .orderBy(desc(dbSchema.memberships.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [cohortsByMembershipId, spacesByMembershipId] = await Promise.all([
    listCohortsByMembershipIds(
      orgId,
      rows.map((row) => row.membership.id),
    ),
    listSpaceMembershipRecordsByMembershipIds(
      orgId,
      rows.map((row) => row.membership.id),
    ),
  ]);

  return {
    records: rows.map((row) => ({
      membership: membershipFromRow(row.membership),
      user: row.user ? userFromRow(row.user) : undefined,
      profile: row.profile ? profileFromRow(row.profile) : undefined,
      spaces: spacesByMembershipId.get(row.membership.id) ?? [],
      cohorts: cohortsByMembershipId.get(row.membership.id) ?? [],
    })),
    total,
    page,
    pageSize,
    pageCount,
  };
}

export async function listMemberImportCandidatesForOrg(
  orgId: string,
  emails: string[],
  destinationSpaceId?: string,
): Promise<MemberImportCandidateRecord[]> {
  const normalizedEmails = [
    ...new Set(emails.map(normalizeEmailAddress).filter(Boolean)),
  ];
  if (normalizedEmails.length > 100) {
    throw new Error("Member imports are limited to 100 unique email addresses.");
  }

  const destinationSpace = destinationSpaceId
    ? await getSpaceById(destinationSpaceId)
    : undefined;
  if (destinationSpaceId && (!destinationSpace || destinationSpace.orgId !== orgId)) {
    throw new Error("The selected community or event could not be found.");
  }
  if (destinationSpace?.lifecycle === "archived") {
    throw new Error("Restore this archived event before adding participants.");
  }
  const legacyCohort = destinationSpace?.kind === "event"
    ? await getCohortById(destinationSpace.id)
    : undefined;
  if (legacyCohort && legacyCohort.orgId !== orgId) {
    throw new Error("Legacy Event mapping is invalid.");
  }

  if (!normalizedEmails.length) {
    return [];
  }

  if (!usesDatabase) {
    const store = getStore();
    return normalizedEmails.map((email) => {
      const user = store.users.find(
        (candidate) => normalizeEmailAddress(candidate.email) === email,
      );
      if (!user) {
        return { email, inCohort: false };
      }
      const membership = user
        ? store.memberships.find(
            (candidate) => candidate.orgId === orgId && candidate.userId === user.id,
          )
        : undefined;
      const spaceMembership =
        destinationSpace && membership
          ? store.spaceMemberships.find(
              (candidate) =>
                candidate.orgId === orgId &&
                candidate.spaceId === destinationSpace.id &&
                candidate.membershipId === membership.id,
            )
          : undefined;
      const cohortMember =
        legacyCohort && membership
          ? store.cohortMembers.find(
              (candidate) =>
                candidate.orgId === orgId &&
                candidate.cohortId === legacyCohort.id &&
                candidate.membershipId === membership.id,
            )
          : undefined;

      return {
        email,
        user,
        membership,
        space: destinationSpace,
        spaceMembership,
        inSpace: Boolean(spaceMembership),
        cohortMember,
        inCohort: Boolean(cohortMember),
      };
    });
  }

  const rows = await getDb()
    .select({
      user: dbSchema.users,
      membership: dbSchema.memberships,
    })
    .from(dbSchema.users)
    .leftJoin(
      dbSchema.memberships,
      and(
        eq(dbSchema.memberships.orgId, orgId),
        eq(dbSchema.memberships.userId, dbSchema.users.id),
      ),
    )
    .where(inArray(sql<string>`lower(${dbSchema.users.email})`, normalizedEmails));
  const recordsByEmail = new Map<string, MemberImportCandidateRecord>(
    normalizedEmails.map((email) => [email, {
      email,
      inCohort: false,
    }]),
  );
  const membershipIds: string[] = [];
  for (const row of rows) {
    const email = normalizeEmailAddress(row.user.email);
    const membership = row.membership ? membershipFromRow(row.membership) : undefined;
    recordsByEmail.set(email, {
      email,
      user: userFromRow(row.user),
      membership,
      space: destinationSpace,
      inSpace: false,
      inCohort: false,
    });
    if (membership) {
      membershipIds.push(membership.id);
    }
  }

  if (destinationSpace && membershipIds.length) {
    const [spaceMembershipRows, cohortMemberRows] = await Promise.all([
      getDb()
        .select()
        .from(dbSchema.spaceMemberships)
        .where(
          and(
            eq(dbSchema.spaceMemberships.orgId, orgId),
            eq(dbSchema.spaceMemberships.spaceId, destinationSpace.id),
            inArray(dbSchema.spaceMemberships.membershipId, membershipIds),
          ),
        ),
      legacyCohort
        ? getDb()
            .select()
            .from(dbSchema.cohortMembers)
            .where(
              and(
                eq(dbSchema.cohortMembers.orgId, orgId),
                eq(dbSchema.cohortMembers.cohortId, legacyCohort.id),
                inArray(dbSchema.cohortMembers.membershipId, membershipIds),
              ),
            )
        : Promise.resolve([]),
    ]);
    const spaceMembershipsByMembershipId = new Map(
      spaceMembershipRows.map((row) => {
        const spaceMembership = spaceMembershipFromRow(row);
        return [spaceMembership.membershipId, spaceMembership] as const;
      }),
    );
    const cohortMembersByMembershipId = new Map(
      cohortMemberRows.map((row) => {
        const cohortMember = cohortMemberFromRow(row);
        return [cohortMember.membershipId, cohortMember] as const;
      }),
    );
    for (const record of recordsByEmail.values()) {
      const spaceMembership = record.membership
        ? spaceMembershipsByMembershipId.get(record.membership.id)
        : undefined;
      const cohortMember = record.membership
        ? cohortMembersByMembershipId.get(record.membership.id)
        : undefined;
      record.spaceMembership = spaceMembership;
      record.inSpace = Boolean(spaceMembership);
      record.cohortMember = cohortMember;
      record.inCohort = Boolean(cohortMember);
    }
  }

  return normalizedEmails.map((email) => recordsByEmail.get(email)!);
}

function cohortRecordFromMembers(
  cohort: Cohort,
  members: CohortMember[],
  membershipsById: Map<string, Membership>,
): CohortRecord {
  const cohortMembers = members.filter((member) => member.cohortId === cohort.id);
  const memberships = cohortMembers
    .map((member) => membershipsById.get(member.membershipId))
    .filter((membership): membership is Membership => Boolean(membership));
  const needsDecisionMembers = memberships.filter(
    (membership) => membership.status === "pending" || membership.status === "waitlist",
  ).length;
  const activeMembers = memberships.filter(
    (membership) => membership.status === "approved",
  ).length;
  const needsAttentionMembers = memberships.filter(
    (membership) =>
      membership.status === "rejected" ||
      membership.status === "suspended" ||
      membership.clerkInvitationStatus === "failed" ||
      membership.clerkInvitationStatus === "expired" ||
      membership.clerkInvitationStatus === "revoked" ||
      Boolean(membership.clerkInvitationError),
  ).length;

  return {
    cohort,
    totalMembers: memberships.length,
    needsDecisionMembers,
    activeMembers,
    needsAttentionMembers,
    invitedMembers: needsDecisionMembers,
    promotedMembers: activeMembers,
  };
}

function cohortMemberStatusForMembership(membership: Membership): CohortMemberStatus {
  return membership.status === "approved" ? "promoted" : "invited";
}

function promotedAtForMembership(
  membership: Membership,
  status: CohortMemberStatus,
  fallback: string,
) {
  return status === "promoted" ? membership.approvedAt ?? fallback : undefined;
}

export async function createCohort(input: {
  orgId: string;
  name: string;
  description?: string;
  eventLabel?: string;
  createdByMembershipId?: string;
}) {
  const space = await createEventSpace({
    ...input,
    id: `coh_${nanoid(8)}`,
    lifecycle: "active",
  });
  return legacyCohortForSpace(space);
}

export async function updateCohort(
  orgId: string,
  cohortId: string,
  input: {
    name?: string;
    description?: string;
    eventLabel?: string;
  },
) {
  const space = await updateEventSpace(orgId, cohortId, input);
  return space ? legacyCohortForSpace(space) : undefined;
}

export async function archiveCohort(orgId: string, cohortId: string) {
  const space = await archiveEventSpace(orgId, cohortId);
  return space ? legacyCohortForSpace(space) : undefined;
}

export async function getCohortById(cohortId: string) {
  if (!usesDatabase) {
    return getStore().cohorts.find((cohort) => cohort.id === cohortId);
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.cohorts)
    .where(eq(dbSchema.cohorts.id, cohortId))
    .limit(1);
  return row ? cohortFromRow(row) : undefined;
}

export async function getCohortRecordForOrg(
  orgId: string,
  cohortId: string,
): Promise<CohortRecord | undefined> {
  const cohort = await getCohortById(cohortId);
  if (!cohort || cohort.orgId !== orgId) {
    return undefined;
  }

  const [cohortMembers, memberships] = await Promise.all([
    listCohortMembersForOrg(orgId),
    listMembershipsForOrg(orgId),
  ]);
  return cohortRecordFromMembers(
    cohort,
    cohortMembers,
    new Map(memberships.map((membership) => [membership.id, membership])),
  );
}

export async function listCohortRecordsForOrg(orgId: string): Promise<CohortRecord[]> {
  if (!usesDatabase) {
    const store = getStore();
    const cohorts = store.cohorts
      .filter((cohort) => cohort.orgId === orgId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const members = store.cohortMembers.filter((member) => member.orgId === orgId);
    const membershipsById = new Map(
      store.memberships
        .filter((membership) => membership.orgId === orgId)
        .map((membership) => [membership.id, membership]),
    );
    return cohorts.map((cohort) =>
      cohortRecordFromMembers(cohort, members, membershipsById),
    );
  }

  const [cohortRows, memberRows, membershipRows] = await Promise.all([
    getDb()
      .select()
      .from(dbSchema.cohorts)
      .where(eq(dbSchema.cohorts.orgId, orgId))
      .orderBy(desc(dbSchema.cohorts.createdAt)),
    getDb()
      .select()
      .from(dbSchema.cohortMembers)
      .where(eq(dbSchema.cohortMembers.orgId, orgId)),
    getDb()
      .select()
      .from(dbSchema.memberships)
      .where(eq(dbSchema.memberships.orgId, orgId)),
  ]);
  const members = memberRows.map(cohortMemberFromRow);
  const membershipsById = new Map(
    membershipRows.map((row) => {
      const membership = membershipFromRow(row);
      return [membership.id, membership] as const;
    }),
  );
  return cohortRows.map((row) =>
    cohortRecordFromMembers(cohortFromRow(row), members, membershipsById),
  );
}

export async function listCohortMembersForOrg(orgId: string) {
  if (!usesDatabase) {
    return getStore().cohortMembers.filter((member) => member.orgId === orgId);
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.cohortMembers)
    .where(eq(dbSchema.cohortMembers.orgId, orgId));
  return rows.map(cohortMemberFromRow);
}

export async function listCohortMemberRecordsForCohort(
  orgId: string,
  cohortId: string,
): Promise<CohortMemberRecord[]> {
  if (!usesDatabase) {
    const store = getStore();
    const records: CohortMemberRecord[] = [];
    for (const cohortMember of store.cohortMembers.filter(
      (candidate) => candidate.orgId === orgId && candidate.cohortId === cohortId,
    )) {
      const membership = store.memberships.find(
        (candidate) => candidate.id === cohortMember.membershipId,
      );
      if (!membership) {
        continue;
      }

      records.push({
        cohortMember,
        membership,
        user: store.users.find((user) => user.id === membership.userId),
        profile: store.profiles.find((profile) => profile.membershipId === membership.id),
      });
    }

    return records.sort((left, right) => {
      const statusOrder = left.cohortMember.status.localeCompare(right.cohortMember.status);
      return statusOrder || right.cohortMember.createdAt.localeCompare(left.cohortMember.createdAt);
    });
  }

  const rows = await getDb()
    .select({
      cohortMember: dbSchema.cohortMembers,
      membership: dbSchema.memberships,
      user: dbSchema.users,
      profile: dbSchema.profiles,
    })
    .from(dbSchema.cohortMembers)
    .innerJoin(dbSchema.memberships, eq(dbSchema.memberships.id, dbSchema.cohortMembers.membershipId))
    .leftJoin(dbSchema.users, eq(dbSchema.users.id, dbSchema.memberships.userId))
    .leftJoin(dbSchema.profiles, eq(dbSchema.profiles.membershipId, dbSchema.memberships.id))
    .where(
      and(
        eq(dbSchema.cohortMembers.orgId, orgId),
        eq(dbSchema.cohortMembers.cohortId, cohortId),
      ),
    )
    .orderBy(asc(dbSchema.cohortMembers.status), desc(dbSchema.cohortMembers.createdAt));

  return rows.map((row) => ({
    cohortMember: cohortMemberFromRow(row.cohortMember),
    membership: membershipFromRow(row.membership),
    user: row.user ? userFromRow(row.user) : undefined,
    profile: row.profile ? profileFromRow(row.profile) : undefined,
  }));
}

async function upsertCohortMember(input: {
  orgId: string;
  cohortId: string;
  membership: Membership;
  email: string;
  name: string;
}) {
  const now = new Date().toISOString();
  const nextStatus = cohortMemberStatusForMembership(input.membership);
  const promotedAt = promotedAtForMembership(input.membership, nextStatus, now);

  if (!usesDatabase) {
    const store = getStore();
    const existing = store.cohortMembers.find(
      (candidate) =>
        candidate.cohortId === input.cohortId &&
        candidate.membershipId === input.membership.id,
    );

    if (existing) {
      return { cohortMember: existing, created: false };
    }

    const cohortMember: CohortMember = {
      id: `chm_${nanoid(8)}`,
      orgId: input.orgId,
      cohortId: input.cohortId,
      membershipId: input.membership.id,
      invitedEmail: input.email,
      invitedName: input.name,
      status: nextStatus,
      invitedAt: now,
      promotedAt,
      createdAt: now,
      updatedAt: now,
    };
    store.cohortMembers.unshift(cohortMember);
    return { cohortMember, created: true };
  }

  const [existingRow] = await getDb()
    .select()
    .from(dbSchema.cohortMembers)
    .where(
      and(
        eq(dbSchema.cohortMembers.cohortId, input.cohortId),
        eq(dbSchema.cohortMembers.membershipId, input.membership.id),
      ),
    )
    .limit(1);

  if (existingRow) {
    return { cohortMember: cohortMemberFromRow(existingRow), created: false };
  }

  const cohortMember: CohortMember = {
    id: `chm_${nanoid(8)}`,
    orgId: input.orgId,
    cohortId: input.cohortId,
    membershipId: input.membership.id,
    invitedEmail: input.email,
    invitedName: input.name,
    status: nextStatus,
    invitedAt: now,
    promotedAt,
    createdAt: now,
    updatedAt: now,
  };
  const [row] = await getDb()
    .insert(dbSchema.cohortMembers)
    .values(cohortMemberInsert(cohortMember))
    .onConflictDoNothing({
      target: [dbSchema.cohortMembers.cohortId, dbSchema.cohortMembers.membershipId],
    })
    .returning();
  if (row) {
    return { cohortMember: cohortMemberFromRow(row), created: true };
  }

  const [concurrentRow] = await getDb()
    .select()
    .from(dbSchema.cohortMembers)
    .where(
      and(
        eq(dbSchema.cohortMembers.cohortId, input.cohortId),
        eq(dbSchema.cohortMembers.membershipId, input.membership.id),
      ),
    )
    .limit(1);
  if (!concurrentRow) {
    throw new Error("Unable to add membership to cohort.");
  }
  return { cohortMember: cohortMemberFromRow(concurrentRow), created: false };
}

export async function addMembershipToCohort(
  orgId: string,
  cohortId: string,
  membership: Membership,
  input: { email: string; name: string },
) {
  const cohort = await getCohortById(cohortId);
  if (!cohort || cohort.orgId !== orgId) {
    throw new Error("Cohort not found.");
  }
  if (cohort.status !== "active") {
    throw new Error("Archived cohorts cannot accept new members.");
  }
  if (membership.orgId !== orgId) {
    throw new Error("Membership does not belong to this organization.");
  }
  if (membership.status === "rejected" || membership.status === "suspended") {
    throw new Error("Inactive memberships cannot be added to a cohort.");
  }

  const email = normalizeEmailAddress(input.email);
  if (!email.includes("@")) {
    throw new Error("A valid email is required.");
  }

  const existingLegacyMember = !usesDatabase
    ? getStore().cohortMembers.find(
        (candidate) =>
          candidate.cohortId === cohortId &&
          candidate.membershipId === membership.id,
      )
    : (
        await getDb()
          .select()
          .from(dbSchema.cohortMembers)
          .where(
            and(
              eq(dbSchema.cohortMembers.cohortId, cohortId),
              eq(dbSchema.cohortMembers.membershipId, membership.id),
            ),
          )
          .limit(1)
      )[0];

  const grant = await grantSpaceMembership({
    orgId,
    spaceId: cohortId,
    membershipId: membership.id,
    accessStatus: "active",
    joinedVia: "direct",
  });
  if (grant.outcome === "conflict") {
    throw new Error("Review this person’s existing event access before continuing.");
  }

  const linked = await upsertCohortMember({
    orgId,
    cohortId,
    membership,
    email,
    name: input.name.trim() || displayNameForEmail(email),
  });
  return { ...linked, created: !existingLegacyMember };
}

function importedMembershipForUser(input: {
  orgId: string;
  user: User;
  /** Retained only as migration-era metadata; Space access is authoritative. */
  status: "pending" | "waitlist" | "approved";
  invitedByUserId: string;
  destinationSpace: Space;
  now: string;
}): Membership {
  const { destinationSpace, now } = input;
  const eventSpace = destinationSpace.kind === "event" ? destinationSpace : undefined;
  return {
    id: `mem_${nanoid(8)}`,
    orgId: input.orgId,
    userId: input.user.id,
    role: "member",
    accountStatus: input.user.clerkUserId ? "connected" : "invited",
    affiliationType: eventSpace ? "current participant" : "invited outsider",
    status: input.status,
    archetypes: eventSpace
      ? ["cohort_participant", "student"]
      : ["invited_outsider"],
    programName: eventSpace?.name ?? WAVESPARKS_COMMUNITY_NAME,
    cohortNameOrYear: eventSpace
      ? eventSpace.eventLabel || eventSpace.name
      : WAVESPARKS_COMMUNITY_NAME,
    invitedByUserId: input.invitedByUserId,
    approvalNote: `Invited with access to ${getCommunityDisplayName(destinationSpace)}.`,
    approvedAt: input.status === "approved" ? now : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

function membershipNeedsInvitation(membership: Membership) {
  if (membership.clerkMembershipId) {
    return false;
  }

  return (
    !membership.clerkInvitationStatus ||
    membership.clerkInvitationStatus === "failed" ||
    membership.clerkInvitationStatus === "expired" ||
    membership.clerkInvitationStatus === "revoked"
  );
}

export async function bulkImportMembersForOrg(input: {
  orgId: string;
  destinationSpaceId?: string;
  accessStatus?: Extract<SpaceAccessStatus, "active" | "waitlist">;
  /** @deprecated Use `destinationSpaceId`. */
  cohortId?: string;
  /** @deprecated Space access is stored in `space_memberships`. */
  status?: "pending" | "waitlist" | "approved";
  members: BulkMemberImportInput[];
  invitedByUserId: string;
}): Promise<BulkMemberImportResult[]> {
  if (input.members.length > 100) {
    throw new Error("Member imports are limited to 100 rows.");
  }
  if (!input.invitedByUserId) {
    throw new Error("An inviting user is required.");
  }

  const uniqueMembers = new Map<
    string,
    { email: string; name: string; rowNumber?: number }
  >();
  for (const member of input.members) {
    const email = normalizeEmailAddress(member.email);
    if (!email.includes("@")) {
      throw new Error(`Invalid email: ${member.email}`);
    }
    if (!uniqueMembers.has(email)) {
      uniqueMembers.set(email, {
        email,
        name: member.name?.trim() || displayNameForEmail(email),
        rowNumber: member.rowNumber,
      });
    }
  }

  if (!uniqueMembers.size) {
    return [];
  }

  const canonicalRequest = input.destinationSpaceId !== undefined;
  if (canonicalRequest && !input.destinationSpaceId?.trim()) {
    throw new Error("Choose Wavesparks Community or an event.");
  }
  if (canonicalRequest && !input.accessStatus) {
    throw new Error("Choose active access or waitlist for this import.");
  }
  const spaces = await listSpacesForOrg(input.orgId);
  const destinationSpaceId = input.destinationSpaceId?.trim()
    || input.cohortId?.trim()
    || spaces.find((space) => space.kind === "main")?.id;
  const destinationSpace = spaces.find((space) => space.id === destinationSpaceId);
  if (!destinationSpace) {
    throw new Error("The selected community or event could not be found.");
  }
  if (destinationSpace.lifecycle === "archived") {
    throw new Error(
      canonicalRequest
        ? "Restore this archived event before adding participants."
        : "Archived cohorts cannot accept new members.",
    );
  }
  if (destinationSpace.kind === "main" && destinationSpace.lifecycle !== "active") {
    throw new Error("Wavesparks Community is not available right now.");
  }
  const accessStatus = input.accessStatus
    ?? (input.status === "approved" ? "active" : "waitlist");
  if (accessStatus !== "active" && accessStatus !== "waitlist") {
    throw new Error("Choose active access or waitlist.");
  }
  const legacyMembershipStatus = canonicalRequest ? "pending" : input.status ?? "pending";

  const initialCandidates = await listMemberImportCandidatesForOrg(
    input.orgId,
    [...uniqueMembers.keys()],
    destinationSpace.id,
  );
  const initialByEmail = new Map(
    initialCandidates.map((candidate) => [candidate.email, candidate]),
  );
  const now = new Date().toISOString();

  const newUsers = [...uniqueMembers.values()]
    .filter((member) => !initialByEmail.get(member.email)?.user)
    .map<User>((member) => ({
      id: `usr_${nanoid(8)}`,
      email: member.email,
      name: member.name,
      imageUrl: `https://api.dicebear.com/9.x/notionists/svg?seed=${member.name}`,
      platformRole: "standard",
      createdAt: now,
      updatedAt: now,
    }));
  if (newUsers.length) {
    if (!usesDatabase) {
      getStore().users.unshift(...newUsers);
    } else {
      await getDb()
        .insert(dbSchema.users)
        .values(newUsers.map(userInsert))
        .onConflictDoNothing({ target: dbSchema.users.email });
    }
  }

  const candidatesWithUsers = await listMemberImportCandidatesForOrg(
    input.orgId,
    [...uniqueMembers.keys()],
    destinationSpace.id,
  );
  const membershipsToCreate = candidatesWithUsers
    .filter(
      (candidate): candidate is MemberImportCandidateRecord & { user: User } =>
        Boolean(candidate.user && !candidate.membership),
    )
    .map((candidate) =>
      importedMembershipForUser({
        orgId: input.orgId,
        user: candidate.user,
        status: legacyMembershipStatus,
        invitedByUserId: input.invitedByUserId,
        destinationSpace,
        now,
      }),
    );
  const createdMembershipIds = new Set<string>();
  if (membershipsToCreate.length) {
    if (!usesDatabase) {
      getStore().memberships.unshift(...membershipsToCreate);
      membershipsToCreate.forEach((membership) => createdMembershipIds.add(membership.id));
    } else {
      const createdRows = await getDb()
        .insert(dbSchema.memberships)
        .values(membershipsToCreate.map(membershipInsert))
        .onConflictDoNothing({
          target: [dbSchema.memberships.orgId, dbSchema.memberships.userId],
        })
        .returning({ id: dbSchema.memberships.id });
      for (const row of createdRows) createdMembershipIds.add(row.id);
    }
  }

  const candidatesWithMemberships = await listMemberImportCandidatesForOrg(
    input.orgId,
    [...uniqueMembers.keys()],
    destinationSpace.id,
  );
  const initialCohortMemberIds = new Set(
    initialCandidates.flatMap((candidate) => candidate.cohortMember?.id ?? []),
  );
  const inviterMembership = await getMembershipByUserAndOrg(
    input.invitedByUserId,
    input.orgId,
  );
  const grantsByMembershipId = new Map<string, SpaceMembershipGrantResult>();
  const conflictsByMembershipId = new Map<
    string,
    NonNullable<BulkMemberImportResult["conflictReason"]>
  >();
  for (const candidate of candidatesWithMemberships) {
    if (!candidate.membership) continue;
    const membership = candidate.membership;
    const accountConflict = membership.accountStatus === "suspended"
      ? canonicalRequest ? "account_suspended" as const : "suspended" as const
      : membership.accountStatus === "deprovisioned"
        ? "deprovisioned" as const
        : undefined;
    const legacyConflict = !canonicalRequest &&
      (membership.status === "rejected" || membership.status === "suspended")
      ? membership.status
      : undefined;
    if (accountConflict || legacyConflict) {
      conflictsByMembershipId.set(membership.id, accountConflict ?? legacyConflict!);
      continue;
    }
    const grant = await grantSpaceMembership({
      orgId: input.orgId,
      spaceId: destinationSpace.id,
      membershipId: membership.id,
      accessStatus,
      joinedVia: "import",
      invitedByMembershipId: inviterMembership?.id,
    });
    grantsByMembershipId.set(membership.id, grant);
    if (grant.outcome === "conflict" && grant.conflictStatus) {
      conflictsByMembershipId.set(membership.id, grant.conflictStatus);
    }
  }

  const finalCandidates = await listMemberImportCandidatesForOrg(
    input.orgId,
    [...uniqueMembers.keys()],
    destinationSpace.id,
  );
  const finalByEmail = new Map(finalCandidates.map((candidate) => [candidate.email, candidate]));

  return [...uniqueMembers.values()].map((normalizedInput) => {
    const candidate = finalByEmail.get(normalizedInput.email);
    if (!candidate?.user || !candidate.membership) {
      throw new Error(`Unable to create membership for ${normalizedInput.email}.`);
    }

    const { membership } = candidate;
    const conflictReason = conflictsByMembershipId.get(membership.id);
    const conflict = Boolean(conflictReason);
    const grant = grantsByMembershipId.get(membership.id);
    return {
      input: normalizedInput,
      user: candidate.user,
      membership,
      spaceMembership: conflict ? undefined : candidate.spaceMembership,
      spaceMembershipCreated: Boolean(grant?.created),
      spaceMembershipUpdated: Boolean(grant?.updated),
      cohortMember: conflict ? undefined : candidate.cohortMember,
      membershipCreated: createdMembershipIds.has(membership.id),
      cohortMemberCreated: Boolean(
        !conflict &&
          candidate.cohortMember &&
          !initialCohortMemberIds.has(candidate.cohortMember.id),
      ),
      classification: conflict
        ? "conflict" as const
        : createdMembershipIds.has(membership.id)
          ? "created" as const
          : "existing" as const,
      conflictReason,
      shouldInvite: conflict ? false : membershipNeedsInvitation(membership),
    };
  });
}

export async function importCohortMembers(
  orgId: string,
  cohortId: string,
  students: CohortImportInput[],
  options: { invitedByUserId?: string } = {},
): Promise<CohortImportResult[]> {
  const cohort = await getCohortById(cohortId);
  if (!cohort || cohort.orgId !== orgId) {
    throw new Error("Cohort not found.");
  }

  const uniqueStudents = new Map<string, { email: string; name: string }>();
  for (const student of students) {
    const email = normalizeEmailAddress(student.email);
    if (!email.includes("@")) {
      throw new Error(`Invalid email: ${student.email}`);
    }

    if (!uniqueStudents.has(email)) {
      uniqueStudents.set(email, {
        email,
        name: student.name?.trim() || displayNameForEmail(email),
      });
    }
  }

  const candidates = await listMemberImportCandidatesForOrg(
    orgId,
    [...uniqueStudents.keys()],
    cohortId,
  );
  const inactiveCandidate = candidates.find(
    (candidate) =>
      candidate.membership?.status === "rejected" ||
      candidate.membership?.status === "suspended",
  );
  if (inactiveCandidate) {
    throw new Error(`Inactive membership cannot be imported: ${inactiveCandidate.email}`);
  }

  const creatorMembership = cohort.createdByMembershipId
    ? await getMembershipById(cohort.createdByMembershipId)
    : undefined;
  const invitedByUserId = options.invitedByUserId ?? creatorMembership?.userId;
  if (!invitedByUserId) {
    throw new Error("An inviting user is required.");
  }

  const imported = await bulkImportMembersForOrg({
    orgId,
    destinationSpaceId: cohortId,
    accessStatus: "active",
    members: [...uniqueStudents.values()],
    invitedByUserId,
  });
  return Promise.all(
    imported.map(async (result) => {
      if (!result.cohortMember) {
        throw new Error(`Unable to add ${result.input.email} to cohort.`);
      }
      return {
        cohortMember: result.cohortMember,
        membership: result.membership,
        user: result.user,
        profile: await getProfileByMembershipId(result.membership.id),
        membershipCreated: result.membershipCreated,
        cohortMemberCreated: result.cohortMemberCreated,
        shouldInvite: result.shouldInvite,
      };
    }),
  );
}

export async function promoteCohortMembers(
  orgId: string,
  cohortId: string,
  membershipIds: string[],
  approvalNote?: string,
): Promise<CohortPromotionResult[]> {
  const uniqueMembershipIds = [...new Set(membershipIds.filter(Boolean))];
  if (!uniqueMembershipIds.length) {
    return [];
  }

  const cohort = await getCohortById(cohortId);
  if (!cohort || cohort.orgId !== orgId) {
    throw new Error("Cohort not found.");
  }

  const cohortMembers = !usesDatabase
    ? getStore().cohortMembers.filter(
        (cohortMember) =>
          cohortMember.orgId === orgId &&
          cohortMember.cohortId === cohortId &&
          uniqueMembershipIds.includes(cohortMember.membershipId),
      )
    : (
        await getDb()
          .select()
          .from(dbSchema.cohortMembers)
          .where(
            and(
              eq(dbSchema.cohortMembers.orgId, orgId),
              eq(dbSchema.cohortMembers.cohortId, cohortId),
              inArray(dbSchema.cohortMembers.membershipId, uniqueMembershipIds),
            ),
          )
      ).map(cohortMemberFromRow);

  const results: CohortPromotionResult[] = [];
  for (const cohortMember of cohortMembers) {
    const existingMembership = await getMembershipById(cohortMember.membershipId);
    if (!existingMembership || existingMembership.orgId !== orgId) {
      continue;
    }

    const statusChanged = existingMembership.status !== "approved";
    const membership = statusChanged
      ? await updateMembershipStatus(
          existingMembership.id,
          "approved",
          approvalNote ?? `Approved from cohort ${cohort.name}.`,
          { existingMembership, recomputeMatches: false },
        )
      : existingMembership;
    if (!membership) {
      continue;
    }

    const now = new Date().toISOString();
    let updatedCohortMember = cohortMember;
    if (!usesDatabase) {
      const stored = getStore().cohortMembers.find(
        (candidate) => candidate.id === cohortMember.id,
      );
      if (stored) {
        stored.status = "promoted";
        stored.promotedAt = stored.promotedAt ?? membership.approvedAt ?? now;
        stored.updatedAt = now;
        updatedCohortMember = stored;
      }
    } else {
      const [row] = await getDb()
        .update(dbSchema.cohortMembers)
        .set({
          status: "promoted",
          promotedAt: maybeDate(cohortMember.promotedAt ?? membership.approvedAt ?? now),
          updatedAt: new Date(now),
        })
        .where(eq(dbSchema.cohortMembers.id, cohortMember.id))
        .returning();
      updatedCohortMember = cohortMemberFromRow(row);
    }

    results.push({
      cohortMember: updatedCohortMember,
      membership,
      profile: await getProfileByMembershipId(membership.id),
      statusChanged,
    });
  }

  return results;
}

export async function listMembershipRecordsForOrg(
  orgId: string,
  options: MembershipRecordListOptions = {},
): Promise<MembershipRecord[]> {
  const limit = positiveIntegerLimit(options.limit);
  const statuses = [
    ...new Set([
      ...(options.status ? [options.status] : []),
      ...(options.statuses ?? []),
    ]),
  ];
  const statusSet = statuses.length ? new Set(statuses) : undefined;

  if (!usesDatabase) {
    const store = getStore();
    const records = store.memberships
      .filter(
        (membership) =>
          membership.orgId === orgId &&
          (!statusSet || statusSet.has(membership.status)),
      )
      .map((membership) => ({
        membership,
        user: store.users.find((user) => user.id === membership.userId),
        profile: store.profiles.find((profile) => profile.membershipId === membership.id),
      }));
    const ordered =
      options.orderBy === "none"
        ? records
        : records.sort((left, right) =>
            right.membership.createdAt.localeCompare(left.membership.createdAt),
          );

    return limit ? ordered.slice(0, limit) : ordered;
  }

  const query = getDb()
    .select({
      membership: dbSchema.memberships,
      user: dbSchema.users,
      profile: dbSchema.profiles,
    })
    .from(dbSchema.memberships)
    .leftJoin(dbSchema.users, eq(dbSchema.users.id, dbSchema.memberships.userId))
    .leftJoin(dbSchema.profiles, eq(dbSchema.profiles.membershipId, dbSchema.memberships.id))
    .where(
      and(
        eq(dbSchema.memberships.orgId, orgId),
        statuses.length === 1
          ? eq(dbSchema.memberships.status, statuses[0])
          : statuses.length > 1
            ? inArray(dbSchema.memberships.status, statuses)
            : undefined,
      ),
    );
  const ordered =
    options.orderBy === "none"
      ? query
      : query.orderBy(desc(dbSchema.memberships.createdAt));
  const rows = await (limit ? ordered.limit(limit) : ordered);
  return rows.map((row) => ({
    membership: membershipFromRow(row.membership),
    user: row.user ? userFromRow(row.user) : undefined,
    profile: row.profile ? profileFromRow(row.profile) : undefined,
  }));
}

export async function listMembershipProfileRecordsForOrg(
  orgId: string,
  options: MembershipProfileRecordListOptions = {},
): Promise<MembershipRecord[]> {
  const limit = positiveIntegerLimit(options.limit);
  const statuses = [
    ...new Set([
      ...(options.status ? [options.status] : []),
      ...(options.statuses ?? []),
    ]),
  ];
  const statusSet = statuses.length ? new Set(statuses) : undefined;

  if (!usesDatabase) {
    const store = getStore();
    const records = store.memberships
      .filter(
        (membership) =>
          membership.orgId === orgId &&
          (!statusSet || statusSet.has(membership.status)),
      )
      .map((membership) => ({
        membership,
        profile: store.profiles.find((profile) => profile.membershipId === membership.id),
      }))
      .filter(
        (record) =>
          (!options.profileRequired || record.profile) &&
          (options.featured === undefined || record.profile?.featured === options.featured) &&
          (options.stale === undefined || record.profile?.stale === options.stale),
      );
    const ordered =
      options.orderBy === "none"
        ? records
        : records.sort((left, right) =>
            right.membership.createdAt.localeCompare(left.membership.createdAt),
          );

    return limit ? ordered.slice(0, limit) : ordered;
  }

  const query = getDb()
    .select({
      membership: dbSchema.memberships,
      profile: dbSchema.profiles,
    })
    .from(dbSchema.memberships)
    .leftJoin(dbSchema.profiles, eq(dbSchema.profiles.membershipId, dbSchema.memberships.id))
    .where(
      and(
        eq(dbSchema.memberships.orgId, orgId),
        statuses.length === 1
          ? eq(dbSchema.memberships.status, statuses[0])
          : statuses.length > 1
            ? inArray(dbSchema.memberships.status, statuses)
            : undefined,
        options.profileRequired ? sql`${dbSchema.profiles.id} is not null` : undefined,
        options.featured === undefined
          ? undefined
          : eq(dbSchema.profiles.featured, options.featured),
        options.stale === undefined ? undefined : eq(dbSchema.profiles.stale, options.stale),
      ),
    );
  const ordered =
    options.orderBy === "none"
      ? query
      : query.orderBy(desc(dbSchema.memberships.createdAt));
  const rows = await (limit ? ordered.limit(limit) : ordered);

  return rows.map((row) => ({
    membership: membershipFromRow(row.membership),
    profile: row.profile ? profileFromRow(row.profile) : undefined,
  }));
}

export async function listMembershipUserRecordsForOrg(
  orgId: string,
  options: { status?: MembershipStatus; limit?: number } = {},
): Promise<MembershipRecord[]> {
  const limit = positiveIntegerLimit(options.limit);

  if (!usesDatabase) {
    const store = getStore();
    const records = store.memberships
      .filter(
        (membership) =>
          membership.orgId === orgId &&
          (options.status ? membership.status === options.status : true),
      )
      .map((membership) => ({
        membership,
        user: store.users.find((user) => user.id === membership.userId),
      }));
    const ordered = records.sort((left, right) =>
      right.membership.createdAt.localeCompare(left.membership.createdAt),
    );

    return limit ? ordered.slice(0, limit) : ordered;
  }

  const query = getDb()
    .select({
      membership: dbSchema.memberships,
      user: dbSchema.users,
    })
    .from(dbSchema.memberships)
    .leftJoin(dbSchema.users, eq(dbSchema.users.id, dbSchema.memberships.userId))
    .where(
      options.status
        ? and(
            eq(dbSchema.memberships.orgId, orgId),
            eq(dbSchema.memberships.status, options.status),
          )
        : eq(dbSchema.memberships.orgId, orgId),
    )
    .orderBy(desc(dbSchema.memberships.createdAt));
  const rows = await (limit ? query.limit(limit) : query);

  return rows.map((row) => ({
    membership: membershipFromRow(row.membership),
    user: row.user ? userFromRow(row.user) : undefined,
  }));
}

export async function listMembershipRecordsByIds(
  membershipIds: string[],
  options: { orgId?: string } = {},
): Promise<MembershipRecord[]> {
  const uniqueIds = [...new Set(membershipIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return [];
  }

  if (!usesDatabase) {
    const ids = new Set(uniqueIds);
    const store = getStore();
    return store.memberships
      .filter(
        (membership) =>
          ids.has(membership.id) &&
          (options.orgId ? membership.orgId === options.orgId : true),
      )
      .map((membership) => ({
        membership,
        user: store.users.find((user) => user.id === membership.userId),
        profile: store.profiles.find((profile) => profile.membershipId === membership.id),
      }));
  }

  const rows = await getDb()
    .select({
      membership: dbSchema.memberships,
      user: dbSchema.users,
      profile: dbSchema.profiles,
    })
    .from(dbSchema.memberships)
    .leftJoin(dbSchema.users, eq(dbSchema.users.id, dbSchema.memberships.userId))
    .leftJoin(dbSchema.profiles, eq(dbSchema.profiles.membershipId, dbSchema.memberships.id))
    .where(
      options.orgId
        ? and(
            inArray(dbSchema.memberships.id, uniqueIds),
            eq(dbSchema.memberships.orgId, options.orgId),
          )
        : inArray(dbSchema.memberships.id, uniqueIds),
    );

  return rows.map((row) => ({
    membership: membershipFromRow(row.membership),
    user: row.user ? userFromRow(row.user) : undefined,
    profile: row.profile ? profileFromRow(row.profile) : undefined,
  }));
}

export async function listMembershipUserRecordsByIds(
  membershipIds: string[],
  options: { orgId?: string } = {},
): Promise<MembershipRecord[]> {
  const uniqueIds = [...new Set(membershipIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return [];
  }

  if (!usesDatabase) {
    const ids = new Set(uniqueIds);
    const store = getStore();
    return store.memberships
      .filter(
        (membership) =>
          ids.has(membership.id) &&
          (options.orgId ? membership.orgId === options.orgId : true),
      )
      .map((membership) => ({
        membership,
        user: store.users.find((user) => user.id === membership.userId),
      }));
  }

  const rows = await getDb()
    .select({
      membership: dbSchema.memberships,
      user: dbSchema.users,
    })
    .from(dbSchema.memberships)
    .leftJoin(dbSchema.users, eq(dbSchema.users.id, dbSchema.memberships.userId))
    .where(
      options.orgId
        ? and(
            inArray(dbSchema.memberships.id, uniqueIds),
            eq(dbSchema.memberships.orgId, options.orgId),
          )
        : inArray(dbSchema.memberships.id, uniqueIds),
    );

  return rows.map((row) => ({
    membership: membershipFromRow(row.membership),
    user: row.user ? userFromRow(row.user) : undefined,
  }));
}

export async function listMembershipProfileRecordsByIds(
  membershipIds: string[],
  options: { orgId?: string } = {},
): Promise<MembershipRecord[]> {
  const uniqueIds = [...new Set(membershipIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return [];
  }

  if (!usesDatabase) {
    const ids = new Set(uniqueIds);
    const store = getStore();
    return store.memberships
      .filter(
        (membership) =>
          ids.has(membership.id) &&
          (options.orgId ? membership.orgId === options.orgId : true),
      )
      .map((membership) => ({
        membership,
        profile: store.profiles.find((profile) => profile.membershipId === membership.id),
      }));
  }

  const rows = await getDb()
    .select({
      membership: dbSchema.memberships,
      profile: dbSchema.profiles,
    })
    .from(dbSchema.memberships)
    .leftJoin(dbSchema.profiles, eq(dbSchema.profiles.membershipId, dbSchema.memberships.id))
    .where(
      options.orgId
        ? and(
            inArray(dbSchema.memberships.id, uniqueIds),
            eq(dbSchema.memberships.orgId, options.orgId),
          )
        : inArray(dbSchema.memberships.id, uniqueIds),
    );

  return rows.map((row) => ({
    membership: membershipFromRow(row.membership),
    profile: row.profile ? profileFromRow(row.profile) : undefined,
  }));
}

export async function listProfilesForOrg(orgId: string) {
  if (!usesDatabase) {
    const membershipIds = getStore()
      .memberships.filter((membership) => membership.orgId === orgId)
      .map((membership) => membership.id);
    const ids = new Set(membershipIds);
    return getStore().profiles.filter((profile) => ids.has(profile.membershipId));
  }

  const rows = await getDb()
    .select({ profile: dbSchema.profiles })
    .from(dbSchema.profiles)
    .innerJoin(dbSchema.memberships, eq(dbSchema.memberships.id, dbSchema.profiles.membershipId))
    .where(eq(dbSchema.memberships.orgId, orgId));
  return rows.map((row) => profileFromRow(row.profile));
}

export async function listPostsForOrg(
  orgId: string,
  options: PostListOptions = {},
) {
  const limit = positiveIntegerLimit(options.limit);

  if (!usesDatabase) {
    const types = options.types?.length ? new Set(options.types) : undefined;
    const opportunitySources = options.opportunitySources?.length
      ? new Set(options.opportunitySources)
      : undefined;
    const posts = getStore().posts
      .filter((post) => post.orgId === orgId)
      .filter((post) => !options.spaceId || post.spaceId === options.spaceId)
      .filter((post) => options.hidden === undefined || post.hidden === options.hidden)
      .filter((post) => !types || types.has(post.type))
      .filter(
        (post) =>
          !opportunitySources ||
          (post.opportunitySource && opportunitySources.has(post.opportunitySource)),
      );
    const ordered =
      options.orderBy === "none"
        ? posts
        : posts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return limit ? ordered.slice(0, limit) : ordered;
  }

  const where = and(
    eq(dbSchema.posts.orgId, orgId),
    options.spaceId ? eq(dbSchema.posts.spaceId, options.spaceId) : undefined,
    options.hidden === undefined ? undefined : eq(dbSchema.posts.hidden, options.hidden),
    options.types?.length ? inArray(dbSchema.posts.type, options.types) : undefined,
    options.opportunitySources?.length
      ? inArray(dbSchema.posts.opportunitySource, options.opportunitySources)
      : undefined,
  );

  if (options.orderBy === "none") {
    const query = getDb().select().from(dbSchema.posts).where(where);
    const rows = await (limit ? query.limit(limit) : query);
    return rows.map(postFromRow);
  }

  const query = getDb()
    .select()
    .from(dbSchema.posts)
    .where(where)
    .orderBy(desc(dbSchema.posts.createdAt));
  const rows = await (limit ? query.limit(limit) : query);

  return rows.map(postFromRow);
}

/**
 * Canonical member-facing post list. The Space id is required so callers cannot
 * accidentally fall back to an organization-wide feed.
 */
export async function listPostsForSpace(
  spaceId: string,
  options: Omit<PostListOptions, "spaceId"> = {},
) {
  const space = await getSpaceById(spaceId);
  if (!space) return [];
  return listPostsForOrg(space.orgId, { ...options, spaceId });
}

/**
 * Admin audit totals for one Space. Every branch starts from the explicit
 * Space id; callers never load organization-wide resources and filter them in
 * the UI.
 */
export async function getSpaceAuditMetrics(
  spaceId: string,
): Promise<SpaceAuditMetrics | undefined> {
  const space = await getSpaceById(spaceId);
  if (!space) return undefined;

  if (!usesDatabase) {
    const store = getStore();
    const postIds = new Set(
      store.posts
        .filter((post) => post.orgId === space.orgId && post.spaceId === spaceId)
        .map((post) => post.id),
    );
    const matches = store.matches.filter(
      (match) => match.orgId === space.orgId && match.spaceId === spaceId,
    );
    const introRequests = store.introRequests.filter(
      (request) => request.orgId === space.orgId && request.spaceId === spaceId,
    );

    return {
      posts: postIds.size,
      visibleComments: store.comments.filter(
        (comment) => postIds.has(comment.postId) && comment.status === "visible",
      ).length,
      follows: store.follows.filter(
        (follow) => follow.orgId === space.orgId && follow.spaceId === spaceId,
      ).length,
      savedPosts: store.postSaves.filter((postSave) => postIds.has(postSave.postId)).length,
      notifications: store.notifications.filter(
        (notification) =>
          notification.orgId === space.orgId && notification.spaceId === spaceId,
      ).length,
      introRequests: introRequests.length,
      pendingIntroRequests: introRequests.filter((request) => request.status === "pending")
        .length,
      matches: matches.length,
      visibleMatches: matches.filter(
        (match) => !match.hiddenByAdmin && !match.dismissedBySource,
      ).length,
    };
  }

  const [
    postRows,
    commentRows,
    followRows,
    savedPostRows,
    notificationRows,
    introRows,
    pendingIntroRows,
    matchRows,
    visibleMatchRows,
  ] = await Promise.all([
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.posts)
      .where(
        and(
          eq(dbSchema.posts.orgId, space.orgId),
          eq(dbSchema.posts.spaceId, spaceId),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.comments)
      .innerJoin(dbSchema.posts, eq(dbSchema.posts.id, dbSchema.comments.postId))
      .where(
        and(
          eq(dbSchema.posts.orgId, space.orgId),
          eq(dbSchema.posts.spaceId, spaceId),
          eq(dbSchema.comments.status, "visible"),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.follows)
      .where(
        and(
          eq(dbSchema.follows.orgId, space.orgId),
          eq(dbSchema.follows.spaceId, spaceId),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.postSaves)
      .innerJoin(dbSchema.posts, eq(dbSchema.posts.id, dbSchema.postSaves.postId))
      .where(
        and(
          eq(dbSchema.posts.orgId, space.orgId),
          eq(dbSchema.posts.spaceId, spaceId),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.notifications)
      .where(
        and(
          eq(dbSchema.notifications.orgId, space.orgId),
          eq(dbSchema.notifications.spaceId, spaceId),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.introRequests)
      .where(
        and(
          eq(dbSchema.introRequests.orgId, space.orgId),
          eq(dbSchema.introRequests.spaceId, spaceId),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.introRequests)
      .where(
        and(
          eq(dbSchema.introRequests.orgId, space.orgId),
          eq(dbSchema.introRequests.spaceId, spaceId),
          eq(dbSchema.introRequests.status, "pending"),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.matches)
      .where(
        and(
          eq(dbSchema.matches.orgId, space.orgId),
          eq(dbSchema.matches.spaceId, spaceId),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.matches)
      .where(
        and(
          eq(dbSchema.matches.orgId, space.orgId),
          eq(dbSchema.matches.spaceId, spaceId),
          eq(dbSchema.matches.hiddenByAdmin, false),
          eq(dbSchema.matches.dismissedBySource, false),
        ),
      ),
  ]);

  return {
    posts: countFromRows(postRows),
    visibleComments: countFromRows(commentRows),
    follows: countFromRows(followRows),
    savedPosts: countFromRows(savedPostRows),
    notifications: countFromRows(notificationRows),
    introRequests: countFromRows(introRows),
    pendingIntroRequests: countFromRows(pendingIntroRows),
    matches: countFromRows(matchRows),
    visibleMatches: countFromRows(visibleMatchRows),
  };
}

export async function listPublicFeedPostRecordsForOrg(
  orgId: string,
  options: PostListOptions = {},
): Promise<PublicFeedPostRecord[]> {
  const limit = positiveIntegerLimit(options.limit);

  if (!usesDatabase) {
    const posts = await listPostsForOrg(orgId, options);
    const store = getStore();
    const membershipsById = new Map(
      store.memberships
        .filter((membership) => membership.orgId === orgId)
        .map((membership) => [membership.id, membership]),
    );
    const profilesByMembershipId = new Map(
      store.profiles.map((profile) => [profile.membershipId, profile]),
    );
    const commentCountByPostId = await listVisibleCommentCountsForOrg(orgId, {
      postIds: posts.map((post) => post.id),
    });

    return posts
      .map((post) => {
        const membership = membershipsById.get(post.authorMembershipId);
        const profile = profilesByMembershipId.get(post.authorMembershipId);

        if (!membership || !profile) {
          return null;
        }

        return {
          post,
          membership,
          profile,
          commentCount: commentCountByPostId.get(post.id) ?? 0,
        };
      })
      .filter((record): record is PublicFeedPostRecord => Boolean(record));
  }

  const where = and(
    eq(dbSchema.posts.orgId, orgId),
    options.spaceId ? eq(dbSchema.posts.spaceId, options.spaceId) : undefined,
    options.hidden === undefined ? undefined : eq(dbSchema.posts.hidden, options.hidden),
    options.types?.length ? inArray(dbSchema.posts.type, options.types) : undefined,
    options.opportunitySources?.length
      ? inArray(dbSchema.posts.opportunitySource, options.opportunitySources)
      : undefined,
  );

  const query = getDb()
    .select({
      post: dbSchema.posts,
      membership: dbSchema.memberships,
      profile: dbSchema.profiles,
      commentCount: sql<number>`count(${dbSchema.comments.id})::int`,
    })
    .from(dbSchema.posts)
    .innerJoin(
      dbSchema.memberships,
      eq(dbSchema.memberships.id, dbSchema.posts.authorMembershipId),
    )
    .innerJoin(
      dbSchema.profiles,
      eq(dbSchema.profiles.membershipId, dbSchema.memberships.id),
    )
    .leftJoin(
      dbSchema.comments,
      and(
        eq(dbSchema.comments.postId, dbSchema.posts.id),
        eq(dbSchema.comments.status, "visible"),
      ),
    )
    .where(where)
    .groupBy(dbSchema.posts.id, dbSchema.memberships.id, dbSchema.profiles.id);

  const ordered =
    options.orderBy === "none"
      ? query
      : query.orderBy(desc(dbSchema.posts.createdAt));
  const rows = await (limit ? ordered.limit(limit) : ordered);

  return rows.map((row) => ({
    post: postFromRow(row.post),
    membership: membershipFromRow(row.membership),
    profile: profileFromRow(row.profile),
    commentCount: Number(row.commentCount),
  }));
}

export async function listFeedPostRecordsForSpace(
  spaceId: string,
  options: Omit<PostListOptions, "spaceId"> = {},
): Promise<PublicFeedPostRecord[]> {
  const space = await getSpaceById(spaceId);
  if (!space) return [];
  return listPublicFeedPostRecordsForOrg(space.orgId, { ...options, spaceId });
}

export async function hasPostForMembership(orgId: string, membershipId: string) {
  if (!usesDatabase) {
    return getStore().posts.some(
      (post) => post.orgId === orgId && post.authorMembershipId === membershipId,
    );
  }

  const [row] = await getDb()
    .select({ id: dbSchema.posts.id })
    .from(dbSchema.posts)
    .where(
      and(
        eq(dbSchema.posts.orgId, orgId),
        eq(dbSchema.posts.authorMembershipId, membershipId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function getMemberActivationSignals(input: {
  orgId: string;
  membershipId: string;
  profileId: string;
}): Promise<MemberActivationSignals> {
  if (!usesDatabase) {
    const store = getStore();
    return {
      hasPost: store.posts.some(
        (post) =>
          post.orgId === input.orgId &&
          post.authorMembershipId === input.membershipId,
      ),
      hasFollow: store.follows.some(
        (follow) => follow.followerMembershipId === input.membershipId,
      ),
      hasVisibleMatch: store.matches.some(
        (match) =>
          match.sourceProfileId === input.profileId &&
          !match.hiddenByAdmin &&
          !match.dismissedBySource,
      ),
      hasRequestedIntro: store.introRequests.some(
        (request) => request.requesterMembershipId === input.membershipId,
      ),
    };
  }

  const [row] = await getDb()
    .select({
      hasPost: sql<boolean>`exists (
        select 1 from ${dbSchema.posts}
        where ${dbSchema.posts.orgId} = ${input.orgId}
          and ${dbSchema.posts.authorMembershipId} = ${input.membershipId}
      )`,
      hasFollow: sql<boolean>`exists (
        select 1 from ${dbSchema.follows}
        where ${dbSchema.follows.followerMembershipId} = ${input.membershipId}
      )`,
      hasVisibleMatch: sql<boolean>`exists (
        select 1 from ${dbSchema.matches}
        where ${dbSchema.matches.sourceProfileId} = ${input.profileId}
          and ${dbSchema.matches.hiddenByAdmin} = false
          and ${dbSchema.matches.dismissedBySource} = false
      )`,
      hasRequestedIntro: sql<boolean>`exists (
        select 1 from ${dbSchema.introRequests}
        where ${dbSchema.introRequests.requesterMembershipId} = ${input.membershipId}
      )`,
    })
    .from(dbSchema.organizations)
    .where(eq(dbSchema.organizations.id, input.orgId))
    .limit(1);

  return {
    hasPost: Boolean(row?.hasPost),
    hasFollow: Boolean(row?.hasFollow),
    hasVisibleMatch: Boolean(row?.hasVisibleMatch),
    hasRequestedIntro: Boolean(row?.hasRequestedIntro),
  };
}

export async function listAllCommentsForOrg(
  orgId: string,
  options: TimeOrderedListOptions = {},
) {
  const limit = positiveIntegerLimit(options.limit);

  if (!usesDatabase) {
    const postIds = new Set(
      getStore()
        .posts.filter(
          (post) =>
            post.orgId === orgId &&
            (!options.spaceId || post.spaceId === options.spaceId),
        )
        .map((post) => post.id),
    );
    const comments = getStore().comments.filter((comment) => postIds.has(comment.postId));
    const ordered =
      options.orderBy === "none"
        ? comments
        : comments.sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return limit ? ordered.slice(0, limit) : ordered;
  }

  const query = getDb()
    .select({ comment: dbSchema.comments })
    .from(dbSchema.comments)
    .innerJoin(dbSchema.posts, eq(dbSchema.posts.id, dbSchema.comments.postId))
    .where(
      and(
        eq(dbSchema.posts.orgId, orgId),
        options.spaceId ? eq(dbSchema.posts.spaceId, options.spaceId) : undefined,
      ),
    );
  const ordered =
    options.orderBy === "none"
      ? query
      : query.orderBy(desc(dbSchema.comments.createdAt));
  const rows = await (limit ? ordered.limit(limit) : ordered);
  return rows.map((row) => commentFromRow(row.comment));
}

export async function listCommentRecordsForOrg(
  orgId: string,
  options: TimeOrderedListOptions = {},
): Promise<CommentRecord[]> {
  const limit = positiveIntegerLimit(options.limit);

  if (!usesDatabase) {
    const store = getStore();
    const postById = new Map(
      store.posts
        .filter(
          (post) =>
            post.orgId === orgId &&
            (!options.spaceId || post.spaceId === options.spaceId),
        )
        .map((post) => [post.id, post]),
    );
    const records = store.comments
      .filter((comment) => postById.has(comment.postId))
      .map((comment) => ({
        comment,
        post: postById.get(comment.postId),
      }));
    const ordered =
      options.orderBy === "none"
        ? records
        : records.sort((left, right) =>
            right.comment.createdAt.localeCompare(left.comment.createdAt),
          );

    return limit ? ordered.slice(0, limit) : ordered;
  }

  const query = getDb()
    .select({
      comment: dbSchema.comments,
      post: dbSchema.posts,
    })
    .from(dbSchema.comments)
    .innerJoin(dbSchema.posts, eq(dbSchema.posts.id, dbSchema.comments.postId))
    .where(
      and(
        eq(dbSchema.posts.orgId, orgId),
        options.spaceId ? eq(dbSchema.posts.spaceId, options.spaceId) : undefined,
      ),
    );
  const ordered =
    options.orderBy === "none"
      ? query
      : query.orderBy(desc(dbSchema.comments.createdAt));
  const rows = await (limit ? ordered.limit(limit) : ordered);
  return rows.map((row) => ({
    comment: commentFromRow(row.comment),
    post: postFromRow(row.post),
  }));
}

export async function getCommentRecordById(
  commentId: string,
): Promise<CommentRecord | undefined> {
  if (!usesDatabase) {
    const store = getStore();
    const comment = store.comments.find((candidate) => candidate.id === commentId);
    if (!comment) {
      return undefined;
    }

    return {
      comment,
      post: store.posts.find((post) => post.id === comment.postId),
    };
  }

  const [row] = await getDb()
    .select({
      comment: dbSchema.comments,
      post: dbSchema.posts,
    })
    .from(dbSchema.comments)
    .innerJoin(dbSchema.posts, eq(dbSchema.posts.id, dbSchema.comments.postId))
    .where(eq(dbSchema.comments.id, commentId))
    .limit(1);

  return row
    ? {
        comment: commentFromRow(row.comment),
        post: postFromRow(row.post),
      }
    : undefined;
}

export async function listVisibleCommentCountsForOrg(
  orgId: string,
  options: VisibleCommentCountOptions = {},
) {
  const scopedPostIds = options.postIds
    ? [...new Set(options.postIds.filter(Boolean))]
    : undefined;

  if (scopedPostIds?.length === 0) {
    return new Map<string, number>();
  }

  if (!usesDatabase) {
    const postIds = new Set(
      getStore()
        .posts.filter(
          (post) =>
            post.orgId === orgId &&
            (!options.spaceId || post.spaceId === options.spaceId),
        )
        .filter((post) => !scopedPostIds || scopedPostIds.includes(post.id))
        .map((post) => post.id),
    );

    return getStore().comments.reduce((counts, comment) => {
      if (!postIds.has(comment.postId) || comment.status !== "visible") {
        return counts;
      }

      counts.set(comment.postId, (counts.get(comment.postId) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
  }

  const rows = await getDb()
    .select({
      postId: dbSchema.comments.postId,
      count: sql<number>`count(*)::int`,
    })
    .from(dbSchema.comments)
    .innerJoin(dbSchema.posts, eq(dbSchema.posts.id, dbSchema.comments.postId))
    .where(
      and(
        eq(dbSchema.posts.orgId, orgId),
        options.spaceId ? eq(dbSchema.posts.spaceId, options.spaceId) : undefined,
        eq(dbSchema.comments.status, "visible"),
        scopedPostIds ? inArray(dbSchema.comments.postId, scopedPostIds) : undefined,
      ),
    )
    .groupBy(dbSchema.comments.postId);

  return new Map(rows.map((row) => [row.postId, Number(row.count)]));
}

export async function listCommentRecordsForSpace(
  spaceId: string,
  options: Omit<TimeOrderedListOptions, "spaceId"> = {},
) {
  const space = await getSpaceById(spaceId);
  if (!space) return [];
  return listCommentRecordsForOrg(space.orgId, { ...options, spaceId });
}

export async function listVisibleCommentCountsForSpace(
  spaceId: string,
  options: Omit<VisibleCommentCountOptions, "spaceId"> = {},
) {
  const space = await getSpaceById(spaceId);
  if (!space) return new Map<string, number>();
  return listVisibleCommentCountsForOrg(space.orgId, { ...options, spaceId });
}

async function getOrgAnalyticsInput(orgId: string) {
  if (!usesDatabase) {
    const store = getStore();
    const memberships = store.memberships.filter((membership) => membership.orgId === orgId);
    const membershipIds = new Set(memberships.map((membership) => membership.id));
    const posts = store.posts.filter((post) => post.orgId === orgId);
    const postIds = new Set(posts.map((post) => post.id));
    return {
      memberships: memberships.map((membership) => ({ status: membership.status })),
      profiles: store.profiles
        .filter((profile) => membershipIds.has(profile.membershipId))
        .map((profile) => ({ onboardingComplete: profile.onboardingComplete })),
      posts: posts.map((post) => ({
        authorMembershipId: post.authorMembershipId,
        createdAt: post.createdAt,
      })),
      comments: store.comments
        .filter((comment) => postIds.has(comment.postId))
        .map((comment) => ({ createdAt: comment.createdAt })),
      introRequests: store.introRequests
        .filter((event) => event.orgId === orgId)
        .map((intro) => ({
          createdAt: intro.createdAt,
          introPurpose: intro.introPurpose,
          respondedAt: intro.respondedAt,
          status: intro.status,
        })),
      analyticsEvents: store.analyticsEvents
        .filter((event) => event.orgId === orgId)
        .map((event) => ({ eventName: event.eventName })),
    };
  }

  const [
    membershipRows,
    profileRows,
    postRows,
    commentRows,
    introRequestRows,
    analyticsRows,
  ] = await Promise.all([
    getDb()
      .select({ status: dbSchema.memberships.status })
      .from(dbSchema.memberships)
      .where(eq(dbSchema.memberships.orgId, orgId)),
    getDb()
      .select({ onboardingComplete: dbSchema.profiles.onboardingComplete })
      .from(dbSchema.profiles)
      .innerJoin(dbSchema.memberships, eq(dbSchema.memberships.id, dbSchema.profiles.membershipId))
      .where(eq(dbSchema.memberships.orgId, orgId)),
    getDb()
      .select({
        authorMembershipId: dbSchema.posts.authorMembershipId,
        createdAt: dbSchema.posts.createdAt,
      })
      .from(dbSchema.posts)
      .where(eq(dbSchema.posts.orgId, orgId)),
    getDb()
      .select({ createdAt: dbSchema.comments.createdAt })
      .from(dbSchema.comments)
      .innerJoin(dbSchema.posts, eq(dbSchema.posts.id, dbSchema.comments.postId))
      .where(eq(dbSchema.posts.orgId, orgId)),
    getDb()
      .select({
        createdAt: dbSchema.introRequests.createdAt,
        introPurpose: dbSchema.introRequests.introPurpose,
        respondedAt: dbSchema.introRequests.respondedAt,
        status: dbSchema.introRequests.status,
      })
      .from(dbSchema.introRequests)
      .where(eq(dbSchema.introRequests.orgId, orgId)),
    getDb()
      .select({ eventName: dbSchema.analyticsEvents.eventName })
      .from(dbSchema.analyticsEvents)
      .where(eq(dbSchema.analyticsEvents.orgId, orgId)),
  ]);

  return {
    memberships: membershipRows,
    profiles: profileRows,
    posts: postRows.map((post) => ({
      authorMembershipId: post.authorMembershipId,
      createdAt: requiredIso(post.createdAt),
    })),
    comments: commentRows.map((comment) => ({
      createdAt: requiredIso(comment.createdAt),
    })),
    introRequests: introRequestRows.map((intro) => ({
      createdAt: requiredIso(intro.createdAt),
      introPurpose: intro.introPurpose,
      respondedAt: maybeIso(intro.respondedAt),
      status: intro.status,
    })),
    analyticsEvents: analyticsRows,
  };
}

export async function listFollowsForMembership(followerMembershipId: string) {
  if (!usesDatabase) {
    return getStore().follows
      .filter((follow) => follow.followerMembershipId === followerMembershipId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.follows)
    .where(eq(dbSchema.follows.followerMembershipId, followerMembershipId))
    .orderBy(desc(dbSchema.follows.createdAt));
  return rows.map(followFromRow);
}

export async function listFollowedMembershipIdsForMembership(
  followerMembershipId: string,
  options: { followedMembershipIds?: string[] } = {},
) {
  const scopedIds = options.followedMembershipIds
    ? [...new Set(options.followedMembershipIds.filter(Boolean))]
    : undefined;

  if (scopedIds?.length === 0) {
    return [];
  }

  if (!usesDatabase) {
    const scopedSet = scopedIds ? new Set(scopedIds) : undefined;
    return getStore().follows
      .filter(
        (follow) =>
          follow.followerMembershipId === followerMembershipId &&
          (!scopedSet || scopedSet.has(follow.followedMembershipId)),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((follow) => follow.followedMembershipId);
  }

  const rows = await getDb()
    .select({ followedMembershipId: dbSchema.follows.followedMembershipId })
    .from(dbSchema.follows)
    .where(
      and(
        eq(dbSchema.follows.followerMembershipId, followerMembershipId),
        scopedIds ? inArray(dbSchema.follows.followedMembershipId, scopedIds) : undefined,
      ),
    )
    .orderBy(desc(dbSchema.follows.createdAt));
  return rows.map((row) => row.followedMembershipId);
}

async function getFollowBetweenMemberships(
  followerMembershipId: string,
  followedMembershipId: string,
) {
  if (!usesDatabase) {
    return getStore().follows.find(
      (follow) =>
        follow.followerMembershipId === followerMembershipId &&
        follow.followedMembershipId === followedMembershipId,
    );
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.follows)
    .where(
      and(
        eq(dbSchema.follows.followerMembershipId, followerMembershipId),
        eq(dbSchema.follows.followedMembershipId, followedMembershipId),
      ),
    )
    .limit(1);
  return row ? followFromRow(row) : undefined;
}

export async function isFollowingMembership(
  followerMembershipId: string,
  followedMembershipId: string,
) {
  return Boolean(await getFollowBetweenMemberships(followerMembershipId, followedMembershipId));
}

export async function hasFollowForMembership(followerMembershipId: string) {
  if (!usesDatabase) {
    return getStore().follows.some(
      (follow) => follow.followerMembershipId === followerMembershipId,
    );
  }

  const [row] = await getDb()
    .select({ id: dbSchema.follows.id })
    .from(dbSchema.follows)
    .where(eq(dbSchema.follows.followerMembershipId, followerMembershipId))
    .limit(1);
  return Boolean(row);
}

export async function followMembership(
  orgId: string,
  followerMembershipId: string,
  followedMembershipId: string,
) {
  if (followerMembershipId === followedMembershipId) {
    return null;
  }

  const existing = await getFollowBetweenMemberships(
    followerMembershipId,
    followedMembershipId,
  );
  if (existing) {
    return existing;
  }

  const follow: Follow = {
    id: `flw_${nanoid(8)}`,
    orgId,
    followerMembershipId,
    followedMembershipId,
    createdAt: new Date().toISOString(),
  };

  if (!usesDatabase) {
    getStore().follows.unshift(follow);
    return follow;
  }

  const [row] = await getDb()
    .insert(dbSchema.follows)
    .values({ ...follow, createdAt: new Date(follow.createdAt) })
    .returning();
  return followFromRow(row);
}

export async function unfollowMembership(
  followerMembershipId: string,
  followedMembershipId: string,
) {
  if (!usesDatabase) {
    const store = getStore();
    const before = store.follows.length;
    store.follows = store.follows.filter(
      (follow) =>
        follow.followerMembershipId !== followerMembershipId ||
        follow.followedMembershipId !== followedMembershipId,
    );
    return store.follows.length < before;
  }

  const deleted = await getDb()
    .delete(dbSchema.follows)
    .where(
      and(
        eq(dbSchema.follows.followerMembershipId, followerMembershipId),
        eq(dbSchema.follows.followedMembershipId, followedMembershipId),
      ),
    )
    .returning({ id: dbSchema.follows.id });
  return deleted.length > 0;
}

export async function listFollowsForMembershipInSpace(
  spaceId: string,
  followerMembershipId: string,
) {
  if (!usesDatabase) {
    return getStore().follows
      .filter(
        (follow) =>
          follow.spaceId === spaceId &&
          follow.followerMembershipId === followerMembershipId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.follows)
    .where(
      and(
        eq(dbSchema.follows.spaceId, spaceId),
        eq(dbSchema.follows.followerMembershipId, followerMembershipId),
      ),
    )
    .orderBy(desc(dbSchema.follows.createdAt));
  return rows.map(followFromRow);
}

export async function listFollowedMembershipIdsForMembershipInSpace(
  spaceId: string,
  followerMembershipId: string,
  options: { followedMembershipIds?: string[] } = {},
) {
  const scopedIds = options.followedMembershipIds
    ? [...new Set(options.followedMembershipIds.filter(Boolean))]
    : undefined;
  if (scopedIds?.length === 0) return [];

  if (!usesDatabase) {
    const scopedSet = scopedIds ? new Set(scopedIds) : undefined;
    return getStore().follows
      .filter(
        (follow) =>
          follow.spaceId === spaceId &&
          follow.followerMembershipId === followerMembershipId &&
          (!scopedSet || scopedSet.has(follow.followedMembershipId)),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((follow) => follow.followedMembershipId);
  }

  const rows = await getDb()
    .select({ followedMembershipId: dbSchema.follows.followedMembershipId })
    .from(dbSchema.follows)
    .where(
      and(
        eq(dbSchema.follows.spaceId, spaceId),
        eq(dbSchema.follows.followerMembershipId, followerMembershipId),
        scopedIds
          ? inArray(dbSchema.follows.followedMembershipId, scopedIds)
          : undefined,
      ),
    )
    .orderBy(desc(dbSchema.follows.createdAt));
  return rows.map((row) => row.followedMembershipId);
}

async function getFollowBetweenMembershipsInSpace(
  spaceId: string,
  followerMembershipId: string,
  followedMembershipId: string,
) {
  if (!usesDatabase) {
    return getStore().follows.find(
      (follow) =>
        follow.spaceId === spaceId &&
        follow.followerMembershipId === followerMembershipId &&
        follow.followedMembershipId === followedMembershipId,
    );
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.follows)
    .where(
      and(
        eq(dbSchema.follows.spaceId, spaceId),
        eq(dbSchema.follows.followerMembershipId, followerMembershipId),
        eq(dbSchema.follows.followedMembershipId, followedMembershipId),
      ),
    )
    .limit(1);
  return row ? followFromRow(row) : undefined;
}

export async function isFollowingMembershipInSpace(
  spaceId: string,
  followerMembershipId: string,
  followedMembershipId: string,
) {
  return Boolean(
    await getFollowBetweenMembershipsInSpace(
      spaceId,
      followerMembershipId,
      followedMembershipId,
    ),
  );
}

async function requireActiveMembershipsInSpace(
  spaceId: string,
  membershipIds: string[],
) {
  const space = await getSpaceById(spaceId);
  if (!space || !spaceLifecycleAllowsMemberAccess(space)) {
    throw new Error("This community or event is not available right now.");
  }

  const records = await Promise.all(
    [...new Set(membershipIds)].map(async (membershipId) => ({
      membership: await getMembershipById(membershipId),
      spaceMembership: await getSpaceMembership(spaceId, membershipId),
    })),
  );
  if (
    records.some(
      ({ membership, spaceMembership }) =>
        !membership ||
        membership.orgId !== space.orgId ||
        membership.accountStatus !== "connected" ||
        spaceMembership?.accessStatus !== "active",
    )
  ) {
    throw new Error("Both people need active access to this community or event.");
  }
  return space;
}

async function authorizedSpaceIdsForConnectedMembership(
  membershipId: string,
  requestedSpaceIds?: string[],
) {
  const membership = await getMembershipById(membershipId);
  if (!membership || membership.accountStatus !== "connected") return null;

  const authorizedIds = new Set(
    (await listVisibleSpacesForMembership(membershipId)).map(
      ({ space }) => space.id,
    ),
  );
  return requestedSpaceIds
    ? [...new Set(requestedSpaceIds.filter((spaceId) => authorizedIds.has(spaceId)))]
    : [...authorizedIds];
}

export async function followMembershipInSpace(input: {
  orgId: string;
  spaceId: string;
  followerMembershipId: string;
  followedMembershipId: string;
}) {
  if (input.followerMembershipId === input.followedMembershipId) return null;
  const space = await requireActiveMembershipsInSpace(input.spaceId, [
    input.followerMembershipId,
    input.followedMembershipId,
  ]);
  if (space.orgId !== input.orgId) throw new Error("Space not found.");

  const existing = await getFollowBetweenMembershipsInSpace(
    input.spaceId,
    input.followerMembershipId,
    input.followedMembershipId,
  );
  if (existing) return existing;

  const follow: Follow = {
    id: `flw_${nanoid(8)}`,
    orgId: input.orgId,
    spaceId: input.spaceId,
    followerMembershipId: input.followerMembershipId,
    followedMembershipId: input.followedMembershipId,
    createdAt: new Date().toISOString(),
  };
  if (!usesDatabase) {
    getStore().follows.unshift(follow);
    return follow;
  }

  const [row] = await getDb()
    .insert(dbSchema.follows)
    .values({ ...follow, createdAt: new Date(follow.createdAt) })
    .onConflictDoNothing({
      target: [
        dbSchema.follows.spaceId,
        dbSchema.follows.followerMembershipId,
        dbSchema.follows.followedMembershipId,
      ],
    })
    .returning();
  return row
    ? followFromRow(row)
    : getFollowBetweenMembershipsInSpace(
        input.spaceId,
        input.followerMembershipId,
        input.followedMembershipId,
      );
}

export async function unfollowMembershipInSpace(
  spaceId: string,
  followerMembershipId: string,
  followedMembershipId: string,
) {
  if (!usesDatabase) {
    const store = getStore();
    const before = store.follows.length;
    store.follows = store.follows.filter(
      (follow) =>
        follow.spaceId !== spaceId ||
        follow.followerMembershipId !== followerMembershipId ||
        follow.followedMembershipId !== followedMembershipId,
    );
    return store.follows.length < before;
  }

  const deleted = await getDb()
    .delete(dbSchema.follows)
    .where(
      and(
        eq(dbSchema.follows.spaceId, spaceId),
        eq(dbSchema.follows.followerMembershipId, followerMembershipId),
        eq(dbSchema.follows.followedMembershipId, followedMembershipId),
      ),
    )
    .returning({ id: dbSchema.follows.id });
  return deleted.length > 0;
}

export async function savePostForMembership(
  orgId: string,
  membershipId: string,
  postId: string,
) {
  const post = await getPostById(postId);
  if (!post?.spaceId || post.orgId !== orgId) {
    throw new Error("This post is not available to you.");
  }
  const space = await requireActiveMembershipsInSpace(post.spaceId, [membershipId]);
  if (space.orgId !== orgId) {
    throw new Error("This post is not available to you.");
  }

  if (!usesDatabase) {
    const store = getStore();
    const existing = store.postSaves.find(
      (save) => save.membershipId === membershipId && save.postId === postId,
    );
    if (existing) {
      return existing;
    }

    const save: PostSave = {
      id: `save_${nanoid(8)}`,
      orgId,
      membershipId,
      postId,
      createdAt: new Date().toISOString(),
    };
    store.postSaves.unshift(save);
    return save;
  }

  const save: PostSave = {
    id: `save_${nanoid(8)}`,
    orgId,
    membershipId,
    postId,
    createdAt: new Date().toISOString(),
  };
  const [row] = await getDb()
    .insert(dbSchema.postSaves)
    .values(postSaveInsert(save))
    .onConflictDoNothing({
      target: [dbSchema.postSaves.membershipId, dbSchema.postSaves.postId],
    })
    .returning();

  if (row) {
    return postSaveFromRow(row);
  }

  const [existing] = await getDb()
    .select()
    .from(dbSchema.postSaves)
    .where(
      and(
        eq(dbSchema.postSaves.membershipId, membershipId),
        eq(dbSchema.postSaves.postId, postId),
      ),
    )
    .limit(1);
  return existing ? postSaveFromRow(existing) : null;
}

export async function unsavePostForMembership(membershipId: string, postId: string) {
  const post = await getPostById(postId);
  if (!post?.spaceId) {
    throw new Error("This post is not available to you.");
  }
  await requireActiveMembershipsInSpace(post.spaceId, [membershipId]);

  if (!usesDatabase) {
    const store = getStore();
    const before = store.postSaves.length;
    store.postSaves = store.postSaves.filter(
      (save) => save.membershipId !== membershipId || save.postId !== postId,
    );
    return store.postSaves.length < before;
  }

  const deleted = await getDb()
    .delete(dbSchema.postSaves)
    .where(
      and(
        eq(dbSchema.postSaves.membershipId, membershipId),
        eq(dbSchema.postSaves.postId, postId),
      ),
    )
    .returning({ id: dbSchema.postSaves.id });
  return deleted.length > 0;
}

export async function listSavedPostIdsForMembership(
  membershipId: string,
  options: { postIds?: string[] } = {},
) {
  const scopedPostIds = options.postIds
    ? [...new Set(options.postIds.filter(Boolean))]
    : undefined;

  if (scopedPostIds?.length === 0) {
    return new Map<string, PostSave>();
  }

  const authorizedSpaceIds = await authorizedSpaceIdsForConnectedMembership(
    membershipId,
  );
  if (!authorizedSpaceIds?.length) return new Map<string, PostSave>();

  if (!usesDatabase) {
    const scopedIds = scopedPostIds ? new Set(scopedPostIds) : undefined;
    const authorizedIds = new Set(authorizedSpaceIds);
    const postSpaceById = new Map(
      getStore().posts.map((post) => [post.id, post.spaceId] as const),
    );
    return getStore().postSaves.reduce((saves, save) => {
      if (
        save.membershipId === membershipId &&
        authorizedIds.has(postSpaceById.get(save.postId) ?? "") &&
        (!scopedIds || scopedIds.has(save.postId))
      ) {
        saves.set(save.postId, save);
      }
      return saves;
    }, new Map<string, PostSave>());
  }

  const rows = await getDb()
    .select({ save: dbSchema.postSaves })
    .from(dbSchema.postSaves)
    .innerJoin(dbSchema.posts, eq(dbSchema.posts.id, dbSchema.postSaves.postId))
    .where(
      and(
        eq(dbSchema.postSaves.membershipId, membershipId),
        inArray(dbSchema.posts.spaceId, authorizedSpaceIds),
        scopedPostIds ? inArray(dbSchema.postSaves.postId, scopedPostIds) : undefined,
      ),
    )
    .orderBy(desc(dbSchema.postSaves.createdAt));

  return new Map(rows.map(({ save: row }) => {
    const save = postSaveFromRow(row);
    return [save.postId, save] as const;
  }));
}

export async function savePostForMembershipInSpace(
  orgId: string,
  spaceId: string,
  membershipId: string,
  postId: string,
) {
  const space = await requireActiveMembershipsInSpace(spaceId, [membershipId]);
  const post = await getPostByIdInSpace(spaceId, postId);
  if (!post || post.orgId !== orgId || space.orgId !== orgId) {
    throw new Error("Post not found in this community or event.");
  }
  return savePostForMembership(orgId, membershipId, postId);
}

export async function unsavePostForMembershipInSpace(
  spaceId: string,
  membershipId: string,
  postId: string,
) {
  await requireActiveMembershipsInSpace(spaceId, [membershipId]);
  if (!(await getPostByIdInSpace(spaceId, postId))) {
    throw new Error("Post not found in this community or event.");
  }
  return unsavePostForMembership(membershipId, postId);
}

export async function listSavedPostIdsForMembershipInSpace(
  spaceId: string,
  membershipId: string,
  options: { postIds?: string[] } = {},
) {
  await requireActiveMembershipsInSpace(spaceId, [membershipId]);
  const scopedPostIds = options.postIds
    ? [...new Set(options.postIds.filter(Boolean))]
    : undefined;
  if (scopedPostIds?.length === 0) return new Map<string, PostSave>();

  if (!usesDatabase) {
    const postIdsInSpace = new Set(
      getStore().posts
        .filter(
          (post) =>
            post.spaceId === spaceId &&
            (!scopedPostIds || scopedPostIds.includes(post.id)),
        )
        .map((post) => post.id),
    );
    return getStore().postSaves.reduce((saves, save) => {
      if (save.membershipId === membershipId && postIdsInSpace.has(save.postId)) {
        saves.set(save.postId, save);
      }
      return saves;
    }, new Map<string, PostSave>());
  }

  const rows = await getDb()
    .select({ save: dbSchema.postSaves })
    .from(dbSchema.postSaves)
    .innerJoin(dbSchema.posts, eq(dbSchema.posts.id, dbSchema.postSaves.postId))
    .where(
      and(
        eq(dbSchema.postSaves.membershipId, membershipId),
        eq(dbSchema.posts.spaceId, spaceId),
        scopedPostIds ? inArray(dbSchema.postSaves.postId, scopedPostIds) : undefined,
      ),
    )
    .orderBy(desc(dbSchema.postSaves.createdAt));
  return new Map(
    rows.map(({ save: row }) => {
      const save = postSaveFromRow(row);
      return [save.postId, save] as const;
    }),
  );
}

export async function getPostById(postId: string) {
  if (!usesDatabase) {
    return getStore().posts.find((post) => post.id === postId);
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.posts)
    .where(eq(dbSchema.posts.id, postId))
    .limit(1);
  return row ? postFromRow(row) : undefined;
}

export async function getPostByIdInSpace(spaceId: string, postId: string) {
  if (!usesDatabase) {
    return getStore().posts.find(
      (post) => post.id === postId && post.spaceId === spaceId,
    );
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.posts)
    .where(and(eq(dbSchema.posts.id, postId), eq(dbSchema.posts.spaceId, spaceId)))
    .limit(1);
  return row ? postFromRow(row) : undefined;
}

export async function getPostThreadRecord(
  postId: string,
  orgId: string,
): Promise<PostThreadRecord | undefined> {
  if (!usesDatabase) {
    const store = getStore();
    const post = store.posts.find(
      (candidate) => candidate.id === postId && candidate.orgId === orgId,
    );
    if (!post) {
      return undefined;
    }

    const authorMembership = store.memberships.find(
      (membership) => membership.id === post.authorMembershipId,
    );
    const comments = store.comments
      .filter((comment) => comment.postId === post.id && comment.status === "visible")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((comment) => {
        const membership = store.memberships.find(
          (candidate) => candidate.id === comment.authorMembershipId,
        );
        return {
          comment,
          membership,
          profile: membership
            ? store.profiles.find((profile) => profile.membershipId === membership.id)
            : undefined,
        };
      });

    return {
      post,
      author: authorMembership
        ? {
            membership: authorMembership,
            profile: store.profiles.find(
              (profile) => profile.membershipId === authorMembership.id,
            ),
          }
        : undefined,
      comments,
    };
  }

  const [postRows, commentRows] = await Promise.all([
    getDb()
      .select({
        post: dbSchema.posts,
        membership: dbSchema.memberships,
        profile: dbSchema.profiles,
      })
      .from(dbSchema.posts)
      .leftJoin(dbSchema.memberships, eq(dbSchema.memberships.id, dbSchema.posts.authorMembershipId))
      .leftJoin(dbSchema.profiles, eq(dbSchema.profiles.membershipId, dbSchema.memberships.id))
      .where(and(eq(dbSchema.posts.id, postId), eq(dbSchema.posts.orgId, orgId)))
      .limit(1),
    getDb()
      .select({
        comment: dbSchema.comments,
        membership: dbSchema.memberships,
        profile: dbSchema.profiles,
      })
      .from(dbSchema.comments)
      .innerJoin(dbSchema.posts, eq(dbSchema.posts.id, dbSchema.comments.postId))
      .leftJoin(
        dbSchema.memberships,
        eq(dbSchema.memberships.id, dbSchema.comments.authorMembershipId),
      )
      .leftJoin(dbSchema.profiles, eq(dbSchema.profiles.membershipId, dbSchema.memberships.id))
      .where(
        and(
          eq(dbSchema.comments.postId, postId),
          eq(dbSchema.comments.status, "visible"),
          eq(dbSchema.posts.orgId, orgId),
        ),
      )
      .orderBy(asc(dbSchema.comments.createdAt)),
  ]);
  const postRow = postRows[0];

  if (!postRow) {
    return undefined;
  }

  return {
    post: postFromRow(postRow.post),
    author: postRow.membership
      ? {
          membership: membershipFromRow(postRow.membership),
          profile: postRow.profile ? profileFromRow(postRow.profile) : undefined,
        }
      : undefined,
    comments: commentRows.map((row) => ({
      comment: commentFromRow(row.comment),
      membership: row.membership ? membershipFromRow(row.membership) : undefined,
      profile: row.profile ? profileFromRow(row.profile) : undefined,
    })),
  };
}

export async function getPostThreadRecordForSpace(
  spaceId: string,
  postId: string,
): Promise<PostThreadRecord | undefined> {
  const space = await getSpaceById(spaceId);
  if (!space) return undefined;
  const thread = await getPostThreadRecord(postId, space.orgId);
  return thread?.post.spaceId === spaceId ? thread : undefined;
}

export async function listCommentsForPost(postId: string) {
  if (!usesDatabase) {
    return getStore().comments
      .filter((comment) => comment.postId === postId && comment.status === "visible")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.comments)
    .where(and(eq(dbSchema.comments.postId, postId), eq(dbSchema.comments.status, "visible")))
    .orderBy(asc(dbSchema.comments.createdAt));
  return rows.map(commentFromRow);
}

export async function listMatchTypeConfigsForOrg(
  orgId: string,
  options: { includeInactive?: boolean } = {},
) {
  if (!usesDatabase) {
    return getStore().matchTypeConfigs
      .filter(
        (config) =>
          config.orgId === orgId && (options.includeInactive || config.active),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }
  const rows = await getDb()
    .select()
    .from(dbSchema.matchTypeConfigs)
    .where(
      and(
        eq(dbSchema.matchTypeConfigs.orgId, orgId),
        options.includeInactive
          ? undefined
          : eq(dbSchema.matchTypeConfigs.active, true),
      ),
    )
    .orderBy(asc(dbSchema.matchTypeConfigs.name));
  return rows.map(matchTypeConfigFromRow);
}

export async function saveMatchTypeConfig(config: MatchTypeConfig) {
  if (!usesDatabase) {
    const store = getStore();
    const index = store.matchTypeConfigs.findIndex(
      (candidate) => candidate.orgId === config.orgId && candidate.slug === config.slug,
    );
    if (index >= 0) {
      store.matchTypeConfigs[index] = config;
    } else {
      store.matchTypeConfigs.push(config);
    }
    return config;
  }
  const [row] = await getDb()
    .insert(dbSchema.matchTypeConfigs)
    .values(matchTypeConfigInsert(config))
    .onConflictDoUpdate({
      target: [dbSchema.matchTypeConfigs.orgId, dbSchema.matchTypeConfigs.slug],
      set: {
        name: config.name,
        description: config.description,
        direction: config.direction,
        seekerLabel: config.seekerLabel,
        providerLabel: config.providerLabel,
        weightsJson: config.weights,
        minimumScore: config.minimumScore,
        active: config.active,
        version: config.version,
        updatedAt: new Date(config.updatedAt),
      },
    })
    .returning();
  return matchTypeConfigFromRow(row);
}

export async function listMatchRunsForOrg(orgId: string, limit = 10) {
  if (!usesDatabase) {
    return getStore().matchRuns
      .filter((run) => run.orgId === orgId)
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, limit);
  }
  const rows = await getDb()
    .select()
    .from(dbSchema.matchRuns)
    .where(eq(dbSchema.matchRuns.orgId, orgId))
    .orderBy(desc(dbSchema.matchRuns.startedAt))
    .limit(limit);
  return rows.map(matchRunFromRow);
}

export async function listMatchRunsForSpace(spaceId: string, limit = 10) {
  const space = await getSpaceById(spaceId);
  if (!space) return [];
  const safeLimit = positiveIntegerLimit(limit) ?? 10;

  if (!usesDatabase) {
    return getStore().matchRuns
      .filter(
        (run) => run.orgId === space.orgId && run.spaceId === spaceId,
      )
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, safeLimit);
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.matchRuns)
    .where(
      and(
        eq(dbSchema.matchRuns.orgId, space.orgId),
        eq(dbSchema.matchRuns.spaceId, spaceId),
      ),
    )
    .orderBy(desc(dbSchema.matchRuns.startedAt))
    .limit(safeLimit);
  return rows.map(matchRunFromRow);
}

export async function recordMatchFeedback(input: {
  orgId: string;
  spaceId?: string;
  matchId: string;
  sourceProfileId: string;
  value: MatchFeedback["value"];
  reasons: string[];
}) {
  const now = new Date().toISOString();
  const reasons = sanitizeMatchFeedbackReasons(input.reasons).slice(0, 4);
  const buildFeedback = (
    match: Pick<MatchRecord, "spaceId" | "matchType" | "algorithmVersion" | "score">,
  ): MatchFeedback => ({
    id: `mfb_${nanoid(8)}`,
    ...input,
    spaceId: match.spaceId,
    matchType: match.matchType,
    algorithmVersion: match.algorithmVersion,
    score: match.score,
    reasons,
    createdAt: now,
    updatedAt: now,
  });
  if (!usesDatabase) {
    const store = getStore();
    const match = store.matches.find(
      (candidate) =>
        candidate.id === input.matchId &&
        candidate.orgId === input.orgId &&
        (!input.spaceId || candidate.spaceId === input.spaceId) &&
        candidate.sourceProfileId === input.sourceProfileId,
    );
    if (!match) return null;
    const feedback = buildFeedback(match);
    const existing = store.matchFeedback.findIndex(
      (candidate) =>
        candidate.matchId === input.matchId &&
        candidate.sourceProfileId === input.sourceProfileId,
    );
    if (existing >= 0) {
      feedback.id = store.matchFeedback[existing].id;
      feedback.createdAt = store.matchFeedback[existing].createdAt;
      store.matchFeedback[existing] = feedback;
    } else {
      store.matchFeedback.push(feedback);
    }
    match.dismissedBySource = input.value === "not_relevant";
    match.updatedAt = now;
    return feedback;
  }

  const [match] = await getDb()
    .select({
      id: dbSchema.matches.id,
      spaceId: dbSchema.matches.spaceId,
      matchType: dbSchema.matches.matchType,
      algorithmVersion: dbSchema.matches.algorithmVersion,
      score: dbSchema.matches.score,
    })
    .from(dbSchema.matches)
    .where(
      and(
        eq(dbSchema.matches.id, input.matchId),
        eq(dbSchema.matches.orgId, input.orgId),
        input.spaceId ? eq(dbSchema.matches.spaceId, input.spaceId) : undefined,
        eq(dbSchema.matches.sourceProfileId, input.sourceProfileId),
      ),
    )
    .limit(1);
  if (!match) return null;
  const feedback = buildFeedback({ ...match, spaceId: match.spaceId ?? undefined });
  const [row] = await getDb()
    .insert(dbSchema.matchFeedback)
    .values(matchFeedbackInsert(feedback))
    .onConflictDoUpdate({
      target: [dbSchema.matchFeedback.matchId, dbSchema.matchFeedback.sourceProfileId],
      set: {
        matchType: feedback.matchType,
        algorithmVersion: feedback.algorithmVersion,
        score: feedback.score,
        value: feedback.value,
        reasons: feedback.reasons,
        updatedAt: new Date(feedback.updatedAt),
      },
    })
    .returning();
  await getDb()
    .update(dbSchema.matches)
    .set({
      dismissedBySource: input.value === "not_relevant",
      updatedAt: new Date(now),
    })
    .where(eq(dbSchema.matches.id, input.matchId));
  return matchFeedbackFromRow(row);
}

function summarizeMatchFeedback(feedback: MatchFeedback[]): MatchFeedbackSummary {
  const byMatchType = new Map<
    string,
    MatchFeedbackSummary["byMatchType"][number]
  >();
  const reasons = new Map<string, number>();
  let helpful = 0;
  let notRelevant = 0;

  for (const item of feedback) {
    if (item.value === "helpful") helpful += 1;
    else notRelevant += 1;
    const typeSummary = byMatchType.get(item.matchType) ?? {
      matchType: item.matchType,
      helpful: 0,
      notRelevant: 0,
      total: 0,
    };
    typeSummary.total += 1;
    if (item.value === "helpful") typeSummary.helpful += 1;
    else typeSummary.notRelevant += 1;
    byMatchType.set(item.matchType, typeSummary);
    for (const reason of item.reasons) {
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
  }

  return {
    total: feedback.length,
    helpful,
    notRelevant,
    byMatchType: [...byMatchType.values()].sort(
      (left, right) => right.total - left.total || left.matchType.localeCompare(right.matchType),
    ),
    reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
  };
}

export async function getMatchFeedbackSummaryForOrg(orgId: string) {
  if (!usesDatabase) {
    return summarizeMatchFeedback(
      getStore().matchFeedback.filter((feedback) => feedback.orgId === orgId),
    );
  }
  const rows = await getDb()
    .select()
    .from(dbSchema.matchFeedback)
    .where(eq(dbSchema.matchFeedback.orgId, orgId));
  return summarizeMatchFeedback(rows.map(matchFeedbackFromRow));
}

function eligibleMatchTargetRecord(
  store: StoreState,
  match: MatchRecord,
) {
  if (!match.spaceId) return undefined;
  const space = store.spaces.find(
    (candidate) => candidate.id === match.spaceId && candidate.orgId === match.orgId,
  );
  const targetProfile = store.profiles.find(
    (profile) => profile.id === match.targetProfileId,
  );
  const targetMembership = targetProfile
    ? store.memberships.find(
        (membership) =>
          membership.id === targetProfile.membershipId &&
          membership.orgId === match.orgId,
      )
    : undefined;
  const spaceMembership = targetMembership
    ? store.spaceMemberships.find(
        (candidate) =>
          candidate.spaceId === match.spaceId &&
          candidate.membershipId === targetMembership.id &&
          candidate.orgId === match.orgId,
      )
    : undefined;
  const intent = targetMembership
    ? store.spaceIntents.find(
        (candidate) =>
          candidate.spaceId === match.spaceId &&
          candidate.membershipId === targetMembership.id &&
          candidate.orgId === match.orgId,
      )
    : undefined;

  if (
    !space ||
    !targetProfile ||
    !targetMembership ||
    !spaceMembership ||
    !intent ||
    !isSpaceMatchingMemberEligible(space, {
      membership: targetMembership,
      profile: targetProfile,
      spaceMembership,
      intent,
    })
  ) {
    return undefined;
  }

  return { targetMembership, targetProfile };
}

export async function listMatchesForProfile(
  profileId: string,
  options: { spaceId?: string; limit?: number } = {},
) {
  const limit = positiveIntegerLimit(options.limit) ?? 12;
  if (!usesDatabase) {
    const store = getStore();
    return store.matches
      .filter(
        (match) =>
          match.sourceProfileId === profileId &&
          (!options.spaceId || match.spaceId === options.spaceId) &&
          (!options.spaceId || Boolean(eligibleMatchTargetRecord(store, match))) &&
          !match.hiddenByAdmin &&
          !match.dismissedBySource,
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  const targetProfiles = alias(dbSchema.profiles, "listed_match_target_profiles");
  const targetMemberships = alias(
    dbSchema.memberships,
    "listed_match_target_memberships",
  );
  const rows = await getDb()
    .select({ match: dbSchema.matches })
    .from(dbSchema.matches)
    .leftJoin(targetProfiles, eq(targetProfiles.id, dbSchema.matches.targetProfileId))
    .leftJoin(
      targetMemberships,
      and(
        eq(targetMemberships.id, targetProfiles.membershipId),
        eq(targetMemberships.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaces,
      and(
        eq(dbSchema.spaces.id, dbSchema.matches.spaceId),
        eq(dbSchema.spaces.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaceMemberships,
      and(
        eq(dbSchema.spaceMemberships.spaceId, dbSchema.matches.spaceId),
        eq(dbSchema.spaceMemberships.membershipId, targetMemberships.id),
        eq(dbSchema.spaceMemberships.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaceIntents,
      and(
        eq(dbSchema.spaceIntents.spaceId, dbSchema.matches.spaceId),
        eq(dbSchema.spaceIntents.membershipId, targetMemberships.id),
        eq(dbSchema.spaceIntents.orgId, dbSchema.matches.orgId),
      ),
    )
    .where(
      and(
        eq(dbSchema.matches.sourceProfileId, profileId),
        options.spaceId ? eq(dbSchema.matches.spaceId, options.spaceId) : undefined,
        options.spaceId
          ? and(
              eq(targetMemberships.accountStatus, "connected"),
              eq(targetProfiles.onboardingComplete, true),
              eq(dbSchema.spaceMemberships.accessStatus, "active"),
              eq(dbSchema.spaceIntents.matchingOptIn, true),
              eq(dbSchema.spaceIntents.intentComplete, true),
              eq(dbSchema.spaces.matchingEnabled, true),
              sql`${dbSchema.spaces.lifecycle} in ('upcoming', 'active', 'ended')`,
            )
          : undefined,
        eq(dbSchema.matches.hiddenByAdmin, false),
        eq(dbSchema.matches.dismissedBySource, false),
      ),
    )
    .orderBy(desc(dbSchema.matches.score))
    .limit(limit);
  return rows.map((row) => matchFromRow(row.match));
}

export async function listMatchesForMembership(
  membershipId: string,
  options: { spaceId?: string; limit?: number } = {},
) {
  const profile = await getProfileByMembershipId(membershipId);
  return profile ? listMatchesForProfile(profile.id, options) : [];
}

export async function listMatchTargetRecordsForProfile(
  profileId: string,
  followerMembershipId: string,
  options: { spaceId?: string; limit?: number; matchType?: string } = {},
): Promise<MatchTargetRecord[]> {
  const limit = positiveIntegerLimit(options.limit) ?? 12;

  if (!usesDatabase) {
    const store = getStore();
    const profileById = new Map(store.profiles.map((profile) => [profile.id, profile]));
    const membershipById = new Map(
      store.memberships.map((membership) => [membership.id, membership]),
    );
    const followedIds = new Set(
      store.follows
        .filter(
          (follow) =>
            follow.followerMembershipId === followerMembershipId &&
            (!options.spaceId || follow.spaceId === options.spaceId),
        )
        .map((follow) => follow.followedMembershipId),
    );

    return store.matches
      .filter(
        (match) =>
          match.sourceProfileId === profileId &&
          (!options.spaceId || match.spaceId === options.spaceId) &&
          (!options.spaceId || Boolean(eligibleMatchTargetRecord(store, match))) &&
          (!options.matchType || match.matchType === options.matchType) &&
          !match.hiddenByAdmin &&
          !match.dismissedBySource,
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((match) => {
        const targetProfile = profileById.get(match.targetProfileId);
        const targetMembership = targetProfile
          ? membershipById.get(targetProfile.membershipId)
          : undefined;

        return {
          match,
          targetMembership,
          targetProfile,
          following: targetMembership ? followedIds.has(targetMembership.id) : false,
        };
      });
  }

  const targetProfiles = alias(dbSchema.profiles, "match_target_profiles");
  const targetMemberships = alias(dbSchema.memberships, "match_target_memberships");
  const rows = await getDb()
    .select({
      match: dbSchema.matches,
      targetProfile: targetProfiles,
      targetMembership: targetMemberships,
      followId: dbSchema.follows.id,
    })
    .from(dbSchema.matches)
    .leftJoin(targetProfiles, eq(targetProfiles.id, dbSchema.matches.targetProfileId))
    .leftJoin(
      targetMemberships,
      and(
        eq(targetMemberships.id, targetProfiles.membershipId),
        eq(targetMemberships.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaces,
      and(
        eq(dbSchema.spaces.id, dbSchema.matches.spaceId),
        eq(dbSchema.spaces.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaceMemberships,
      and(
        eq(dbSchema.spaceMemberships.spaceId, dbSchema.matches.spaceId),
        eq(dbSchema.spaceMemberships.membershipId, targetMemberships.id),
        eq(dbSchema.spaceMemberships.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaceIntents,
      and(
        eq(dbSchema.spaceIntents.spaceId, dbSchema.matches.spaceId),
        eq(dbSchema.spaceIntents.membershipId, targetMemberships.id),
        eq(dbSchema.spaceIntents.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.follows,
      and(
        eq(dbSchema.follows.followerMembershipId, followerMembershipId),
        eq(dbSchema.follows.followedMembershipId, targetMemberships.id),
        options.spaceId ? eq(dbSchema.follows.spaceId, options.spaceId) : undefined,
      ),
    )
    .where(
      and(
        eq(dbSchema.matches.sourceProfileId, profileId),
        options.spaceId ? eq(dbSchema.matches.spaceId, options.spaceId) : undefined,
        options.spaceId
          ? and(
              eq(targetMemberships.accountStatus, "connected"),
              eq(targetProfiles.onboardingComplete, true),
              eq(dbSchema.spaceMemberships.accessStatus, "active"),
              eq(dbSchema.spaceIntents.matchingOptIn, true),
              eq(dbSchema.spaceIntents.intentComplete, true),
              eq(dbSchema.spaces.matchingEnabled, true),
              sql`${dbSchema.spaces.lifecycle} in ('upcoming', 'active', 'ended')`,
            )
          : undefined,
        options.matchType ? eq(dbSchema.matches.matchType, options.matchType) : undefined,
        eq(dbSchema.matches.hiddenByAdmin, false),
        eq(dbSchema.matches.dismissedBySource, false),
      ),
    )
    .orderBy(desc(dbSchema.matches.score))
    .limit(limit);

  return rows.map((row) => ({
    match: matchFromRow(row.match),
    targetMembership: row.targetMembership
      ? membershipFromRow(row.targetMembership)
      : undefined,
    targetProfile: row.targetProfile ? profileFromRow(row.targetProfile) : undefined,
    following: Boolean(row.followId),
  }));
}

export async function listVisibleMatchTargetMembershipIdsForProfile(
  profileId: string,
  options: { spaceId?: string; limit?: number } = {},
) {
  const limit = positiveIntegerLimit(options.limit) ?? 12;
  if (!usesDatabase) {
    const store = getStore();
    const profileById = new Map(
      store.profiles.map((profile) => [profile.id, profile]),
    );
    return store.matches
      .filter(
        (match) =>
          match.sourceProfileId === profileId &&
          (!options.spaceId || match.spaceId === options.spaceId) &&
          (!options.spaceId || Boolean(eligibleMatchTargetRecord(store, match))) &&
          !match.hiddenByAdmin &&
          !match.dismissedBySource,
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((match) => profileById.get(match.targetProfileId)?.membershipId)
      .filter((membershipId): membershipId is string => Boolean(membershipId));
  }

  const targetProfiles = alias(dbSchema.profiles, "visible_match_target_profiles");
  const targetMemberships = alias(
    dbSchema.memberships,
    "visible_match_target_memberships",
  );
  const rows = await getDb()
    .select({ membershipId: targetProfiles.membershipId })
    .from(dbSchema.matches)
    .innerJoin(targetProfiles, eq(targetProfiles.id, dbSchema.matches.targetProfileId))
    .innerJoin(
      targetMemberships,
      and(
        eq(targetMemberships.id, targetProfiles.membershipId),
        eq(targetMemberships.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaces,
      and(
        eq(dbSchema.spaces.id, dbSchema.matches.spaceId),
        eq(dbSchema.spaces.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaceMemberships,
      and(
        eq(dbSchema.spaceMemberships.spaceId, dbSchema.matches.spaceId),
        eq(dbSchema.spaceMemberships.membershipId, targetMemberships.id),
        eq(dbSchema.spaceMemberships.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaceIntents,
      and(
        eq(dbSchema.spaceIntents.spaceId, dbSchema.matches.spaceId),
        eq(dbSchema.spaceIntents.membershipId, targetMemberships.id),
        eq(dbSchema.spaceIntents.orgId, dbSchema.matches.orgId),
      ),
    )
    .where(
      and(
        eq(dbSchema.matches.sourceProfileId, profileId),
        options.spaceId ? eq(dbSchema.matches.spaceId, options.spaceId) : undefined,
        options.spaceId
          ? and(
              eq(targetMemberships.accountStatus, "connected"),
              eq(targetProfiles.onboardingComplete, true),
              eq(dbSchema.spaceMemberships.accessStatus, "active"),
              eq(dbSchema.spaceIntents.matchingOptIn, true),
              eq(dbSchema.spaceIntents.intentComplete, true),
              eq(dbSchema.spaces.matchingEnabled, true),
              sql`${dbSchema.spaces.lifecycle} in ('upcoming', 'active', 'ended')`,
            )
          : undefined,
        eq(dbSchema.matches.hiddenByAdmin, false),
        eq(dbSchema.matches.dismissedBySource, false),
      ),
    )
    .orderBy(desc(dbSchema.matches.score))
    .limit(limit);
  return rows.map((row) => row.membershipId);
}

export async function listVisibleMatchTargetMembershipIdsForMembership(
  membershipId: string,
  options: { spaceId?: string; limit?: number } = {},
) {
  const limit = positiveIntegerLimit(options.limit) ?? 12;
  if (!usesDatabase) {
    const profile = await getProfileByMembershipId(membershipId);
    return profile
      ? listVisibleMatchTargetMembershipIdsForProfile(profile.id, options)
      : [];
  }

  const sourceProfiles = alias(dbSchema.profiles, "source_profiles");
  const targetProfiles = alias(dbSchema.profiles, "target_profiles");
  const targetMemberships = alias(
    dbSchema.memberships,
    "visible_membership_match_targets",
  );
  const rows = await getDb()
    .select({ membershipId: targetProfiles.membershipId })
    .from(dbSchema.matches)
    .innerJoin(sourceProfiles, eq(sourceProfiles.id, dbSchema.matches.sourceProfileId))
    .innerJoin(targetProfiles, eq(targetProfiles.id, dbSchema.matches.targetProfileId))
    .innerJoin(
      targetMemberships,
      and(
        eq(targetMemberships.id, targetProfiles.membershipId),
        eq(targetMemberships.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaces,
      and(
        eq(dbSchema.spaces.id, dbSchema.matches.spaceId),
        eq(dbSchema.spaces.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaceMemberships,
      and(
        eq(dbSchema.spaceMemberships.spaceId, dbSchema.matches.spaceId),
        eq(dbSchema.spaceMemberships.membershipId, targetMemberships.id),
        eq(dbSchema.spaceMemberships.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaceIntents,
      and(
        eq(dbSchema.spaceIntents.spaceId, dbSchema.matches.spaceId),
        eq(dbSchema.spaceIntents.membershipId, targetMemberships.id),
        eq(dbSchema.spaceIntents.orgId, dbSchema.matches.orgId),
      ),
    )
    .where(
      and(
        eq(sourceProfiles.membershipId, membershipId),
        options.spaceId ? eq(dbSchema.matches.spaceId, options.spaceId) : undefined,
        options.spaceId
          ? and(
              eq(targetMemberships.accountStatus, "connected"),
              eq(targetProfiles.onboardingComplete, true),
              eq(dbSchema.spaceMemberships.accessStatus, "active"),
              eq(dbSchema.spaceIntents.matchingOptIn, true),
              eq(dbSchema.spaceIntents.intentComplete, true),
              eq(dbSchema.spaces.matchingEnabled, true),
              sql`${dbSchema.spaces.lifecycle} in ('upcoming', 'active', 'ended')`,
            )
          : undefined,
        eq(dbSchema.matches.hiddenByAdmin, false),
        eq(dbSchema.matches.dismissedBySource, false),
      ),
    )
    .orderBy(desc(dbSchema.matches.score))
    .limit(limit);
  return rows.map((row) => row.membershipId);
}

export async function hasVisibleMatchForProfile(
  profileId: string,
  options: { spaceId?: string } = {},
) {
  if (!usesDatabase) {
    const store = getStore();
    return store.matches.some(
      (match) =>
        match.sourceProfileId === profileId &&
        (!options.spaceId || match.spaceId === options.spaceId) &&
        (!options.spaceId || Boolean(eligibleMatchTargetRecord(store, match))) &&
        !match.hiddenByAdmin &&
        !match.dismissedBySource,
    );
  }

  const targetProfiles = alias(dbSchema.profiles, "existing_match_target_profiles");
  const targetMemberships = alias(
    dbSchema.memberships,
    "existing_match_target_memberships",
  );
  const [row] = await getDb()
    .select({ id: dbSchema.matches.id })
    .from(dbSchema.matches)
    .leftJoin(targetProfiles, eq(targetProfiles.id, dbSchema.matches.targetProfileId))
    .leftJoin(
      targetMemberships,
      and(
        eq(targetMemberships.id, targetProfiles.membershipId),
        eq(targetMemberships.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaces,
      and(
        eq(dbSchema.spaces.id, dbSchema.matches.spaceId),
        eq(dbSchema.spaces.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaceMemberships,
      and(
        eq(dbSchema.spaceMemberships.spaceId, dbSchema.matches.spaceId),
        eq(dbSchema.spaceMemberships.membershipId, targetMemberships.id),
        eq(dbSchema.spaceMemberships.orgId, dbSchema.matches.orgId),
      ),
    )
    .leftJoin(
      dbSchema.spaceIntents,
      and(
        eq(dbSchema.spaceIntents.spaceId, dbSchema.matches.spaceId),
        eq(dbSchema.spaceIntents.membershipId, targetMemberships.id),
        eq(dbSchema.spaceIntents.orgId, dbSchema.matches.orgId),
      ),
    )
    .where(
      and(
        eq(dbSchema.matches.sourceProfileId, profileId),
        options.spaceId ? eq(dbSchema.matches.spaceId, options.spaceId) : undefined,
        options.spaceId
          ? and(
              eq(targetMemberships.accountStatus, "connected"),
              eq(targetProfiles.onboardingComplete, true),
              eq(dbSchema.spaceMemberships.accessStatus, "active"),
              eq(dbSchema.spaceIntents.matchingOptIn, true),
              eq(dbSchema.spaceIntents.intentComplete, true),
              eq(dbSchema.spaces.matchingEnabled, true),
              sql`${dbSchema.spaces.lifecycle} in ('upcoming', 'active', 'ended')`,
            )
          : undefined,
        eq(dbSchema.matches.hiddenByAdmin, false),
        eq(dbSchema.matches.dismissedBySource, false),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function hasVisibleMatchForMembership(
  membershipId: string,
  options: { spaceId?: string } = {},
) {
  const profile = await getProfileByMembershipId(membershipId);
  return profile ? hasVisibleMatchForProfile(profile.id, options) : false;
}

export async function getIntroRequestById(introRequestId: string) {
  if (!usesDatabase) {
    return getStore().introRequests.find((request) => request.id === introRequestId);
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.introRequests)
    .where(eq(dbSchema.introRequests.id, introRequestId))
    .limit(1);
  return row ? introRequestFromRow(row) : undefined;
}

export async function getIntroRequestByIdInSpace(
  spaceId: string,
  introRequestId: string,
) {
  if (!usesDatabase) {
    return getStore().introRequests.find(
      (request) => request.id === introRequestId && request.spaceId === spaceId,
    );
  }
  const [row] = await getDb()
    .select()
    .from(dbSchema.introRequests)
    .where(
      and(
        eq(dbSchema.introRequests.id, introRequestId),
        eq(dbSchema.introRequests.spaceId, spaceId),
      ),
    )
    .limit(1);
  return row ? introRequestFromRow(row) : undefined;
}

export async function listIntroRequestsForMembership(
  membershipId: string,
  options: IntroRequestListOptions = {},
) {
  const limit = positiveIntegerLimit(options.limit);

  if (!usesDatabase) {
    const requests = getStore().introRequests
      .filter(
        (request) =>
          (!options.spaceId || request.spaceId === options.spaceId) &&
          (options.direction === "incoming"
            ? request.receiverMembershipId === membershipId
            : options.direction === "outgoing"
              ? request.requesterMembershipId === membershipId
              : request.requesterMembershipId === membershipId ||
                request.receiverMembershipId === membershipId) &&
          (!options.status || request.status === options.status),
      );
    const ordered =
      options.orderBy === "none"
        ? requests
        : requests.sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return limit ? ordered.slice(0, limit) : ordered;
  }

  if (options.orderBy === "none") {
    const query = getDb()
      .select()
      .from(dbSchema.introRequests)
      .where(
        and(
          options.spaceId
            ? eq(dbSchema.introRequests.spaceId, options.spaceId)
            : undefined,
          options.direction === "incoming"
            ? eq(dbSchema.introRequests.receiverMembershipId, membershipId)
            : options.direction === "outgoing"
              ? eq(dbSchema.introRequests.requesterMembershipId, membershipId)
              : or(
                  eq(dbSchema.introRequests.requesterMembershipId, membershipId),
                  eq(dbSchema.introRequests.receiverMembershipId, membershipId),
                ),
          options.status ? eq(dbSchema.introRequests.status, options.status) : undefined,
        ),
      );
    const rows = await (limit ? query.limit(limit) : query);
    return rows.map(introRequestFromRow);
  }

  const query = getDb()
    .select()
    .from(dbSchema.introRequests)
    .where(
      and(
        options.spaceId
          ? eq(dbSchema.introRequests.spaceId, options.spaceId)
          : undefined,
        options.direction === "incoming"
          ? eq(dbSchema.introRequests.receiverMembershipId, membershipId)
          : options.direction === "outgoing"
            ? eq(dbSchema.introRequests.requesterMembershipId, membershipId)
            : or(
                eq(dbSchema.introRequests.requesterMembershipId, membershipId),
                eq(dbSchema.introRequests.receiverMembershipId, membershipId),
              ),
        options.status ? eq(dbSchema.introRequests.status, options.status) : undefined,
      ),
    )
    .orderBy(desc(dbSchema.introRequests.createdAt));
  const rows = await (limit ? query.limit(limit) : query);
  return rows.map(introRequestFromRow);
}

export async function listIntroRequestsForMembershipInSpace(
  spaceId: string,
  membershipId: string,
  options: Omit<IntroRequestListOptions, "spaceId"> = {},
) {
  return listIntroRequestsForMembership(membershipId, { ...options, spaceId });
}

/**
 * Account-level private connection history. Completed intros remain visible
 * after Space removal; pending/expired records remain visible only while the
 * member can still access their source Space.
 */
export async function listIntroRequestsForMembershipWithSpaceAccess(
  membershipId: string,
  accessibleSpaceIds: string[],
  options: Omit<IntroRequestListOptions, "spaceId"> = {},
) {
  const ids = [...new Set(accessibleSpaceIds.filter(Boolean))];
  const limit = positiveIntegerLimit(options.limit);
  const directionMatches = (request: IntroRequest) =>
    options.direction === "incoming"
      ? request.receiverMembershipId === membershipId
      : options.direction === "outgoing"
        ? request.requesterMembershipId === membershipId
        : request.requesterMembershipId === membershipId ||
          request.receiverMembershipId === membershipId;
  const canRetain = (request: IntroRequest) =>
    request.status === "accepted" ||
    request.status === "declined" ||
    Boolean(request.spaceId && ids.includes(request.spaceId));

  if (!usesDatabase) {
    const requests = getStore().introRequests
      .filter(
        (request) =>
          directionMatches(request) &&
          canRetain(request) &&
          (!options.status || request.status === options.status),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return limit ? requests.slice(0, limit) : requests;
  }

  const participantCondition =
    options.direction === "incoming"
      ? eq(dbSchema.introRequests.receiverMembershipId, membershipId)
      : options.direction === "outgoing"
        ? eq(dbSchema.introRequests.requesterMembershipId, membershipId)
        : or(
            eq(dbSchema.introRequests.requesterMembershipId, membershipId),
            eq(dbSchema.introRequests.receiverMembershipId, membershipId),
          );
  const accessCondition = ids.length
    ? or(
        inArray(dbSchema.introRequests.status, ["accepted", "declined"]),
        inArray(dbSchema.introRequests.spaceId, ids),
      )
    : inArray(dbSchema.introRequests.status, ["accepted", "declined"]);
  const where = and(
    participantCondition,
    accessCondition,
    options.status ? eq(dbSchema.introRequests.status, options.status) : undefined,
  );
  const query = getDb()
    .select()
    .from(dbSchema.introRequests)
    .where(where)
    .orderBy(desc(dbSchema.introRequests.createdAt));
  const rows = await (limit ? query.limit(limit) : query);
  return rows.map(introRequestFromRow);
}

export async function getPendingIntroRequestBetweenMembershipsInSpace(
  spaceId: string,
  firstMembershipId: string,
  secondMembershipId: string,
) {
  if (!usesDatabase) {
    return getStore().introRequests.find(
      (request) =>
        request.spaceId === spaceId &&
        request.status === "pending" &&
        ((request.requesterMembershipId === firstMembershipId &&
          request.receiverMembershipId === secondMembershipId) ||
          (request.requesterMembershipId === secondMembershipId &&
            request.receiverMembershipId === firstMembershipId)),
    );
  }
  const [row] = await getDb()
    .select()
    .from(dbSchema.introRequests)
    .where(
      and(
        eq(dbSchema.introRequests.spaceId, spaceId),
        eq(dbSchema.introRequests.status, "pending"),
        or(
          and(
            eq(dbSchema.introRequests.requesterMembershipId, firstMembershipId),
            eq(dbSchema.introRequests.receiverMembershipId, secondMembershipId),
          ),
          and(
            eq(dbSchema.introRequests.requesterMembershipId, secondMembershipId),
            eq(dbSchema.introRequests.receiverMembershipId, firstMembershipId),
          ),
        ),
      ),
    )
    .limit(1);
  return row ? introRequestFromRow(row) : undefined;
}

export async function getPendingIntroRequestBetweenMembershipsInOrg(
  orgId: string,
  firstMembershipId: string,
  secondMembershipId: string,
) {
  if (!usesDatabase) {
    return getStore().introRequests.find(
      (request) =>
        request.orgId === orgId &&
        request.status === "pending" &&
        ((request.requesterMembershipId === firstMembershipId &&
          request.receiverMembershipId === secondMembershipId) ||
          (request.requesterMembershipId === secondMembershipId &&
            request.receiverMembershipId === firstMembershipId)),
    );
  }
  const [row] = await getDb()
    .select()
    .from(dbSchema.introRequests)
    .where(
      and(
        eq(dbSchema.introRequests.orgId, orgId),
        eq(dbSchema.introRequests.status, "pending"),
        or(
          and(
            eq(dbSchema.introRequests.requesterMembershipId, firstMembershipId),
            eq(dbSchema.introRequests.receiverMembershipId, secondMembershipId),
          ),
          and(
            eq(dbSchema.introRequests.requesterMembershipId, secondMembershipId),
            eq(dbSchema.introRequests.receiverMembershipId, firstMembershipId),
          ),
        ),
      ),
    )
    .limit(1);
  return row ? introRequestFromRow(row) : undefined;
}

export async function hasIntroRequestFromMembership(membershipId: string) {
  if (!usesDatabase) {
    return getStore().introRequests.some(
      (request) => request.requesterMembershipId === membershipId,
    );
  }

  const [row] = await getDb()
    .select({ id: dbSchema.introRequests.id })
    .from(dbSchema.introRequests)
    .where(eq(dbSchema.introRequests.requesterMembershipId, membershipId))
    .limit(1);
  return Boolean(row);
}

export async function listActiveIntroRequestStatusesForRequester(
  requesterMembershipId: string,
  receiverMembershipIds?: string[],
) {
  const uniqueReceiverIds = receiverMembershipIds
    ? [...new Set(receiverMembershipIds.filter(Boolean))]
    : undefined;
  if (receiverMembershipIds && !uniqueReceiverIds?.length) {
    return new Map<string, IntroStatus>();
  }

  if (!usesDatabase) {
    const receiverIds = uniqueReceiverIds ? new Set(uniqueReceiverIds) : undefined;
    const requests = getStore().introRequests
      .filter(
        (request) =>
          request.requesterMembershipId === requesterMembershipId &&
          (!receiverIds || receiverIds.has(request.receiverMembershipId)) &&
          request.status !== "expired",
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return requests.reduce((statuses, request) => {
      if (!statuses.has(request.receiverMembershipId)) {
        statuses.set(request.receiverMembershipId, request.status);
      }
      return statuses;
    }, new Map<string, IntroStatus>());
  }

  const rows = await getDb()
    .select({
      receiverMembershipId: dbSchema.introRequests.receiverMembershipId,
      status: dbSchema.introRequests.status,
    })
    .from(dbSchema.introRequests)
    .where(
      and(
        eq(dbSchema.introRequests.requesterMembershipId, requesterMembershipId),
        uniqueReceiverIds
          ? inArray(dbSchema.introRequests.receiverMembershipId, uniqueReceiverIds)
          : undefined,
        sql`${dbSchema.introRequests.status} <> 'expired'`,
      ),
    )
    .orderBy(desc(dbSchema.introRequests.createdAt));

  return rows.reduce((statuses, row) => {
    if (!statuses.has(row.receiverMembershipId)) {
      statuses.set(row.receiverMembershipId, row.status);
    }
    return statuses;
  }, new Map<string, IntroStatus>());
}

export async function listActiveIntroRequestStatusesForRequesterInSpace(
  spaceId: string,
  requesterMembershipId: string,
  receiverMembershipIds?: string[],
) {
  const uniqueReceiverIds = receiverMembershipIds
    ? [...new Set(receiverMembershipIds.filter(Boolean))]
    : undefined;
  if (receiverMembershipIds && !uniqueReceiverIds?.length) {
    return new Map<string, IntroStatus>();
  }

  if (!usesDatabase) {
    const receiverIds = uniqueReceiverIds ? new Set(uniqueReceiverIds) : undefined;
    return getStore().introRequests
      .filter(
        (request) => {
          const otherMembershipId =
            request.requesterMembershipId === requesterMembershipId
              ? request.receiverMembershipId
              : request.receiverMembershipId === requesterMembershipId
                ? request.requesterMembershipId
                : undefined;
          return Boolean(
            otherMembershipId &&
              (!receiverIds || receiverIds.has(otherMembershipId)) &&
              request.status !== "expired" &&
              (request.spaceId === spaceId || request.status === "pending"),
          );
        },
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .reduce((statuses, request) => {
        const otherMembershipId =
          request.requesterMembershipId === requesterMembershipId
            ? request.receiverMembershipId
            : request.requesterMembershipId;
        if (!statuses.has(otherMembershipId)) {
          statuses.set(otherMembershipId, request.status);
        }
        return statuses;
      }, new Map<string, IntroStatus>());
  }

  const participantCondition = uniqueReceiverIds
    ? or(
        and(
          eq(dbSchema.introRequests.requesterMembershipId, requesterMembershipId),
          inArray(dbSchema.introRequests.receiverMembershipId, uniqueReceiverIds),
        ),
        and(
          eq(dbSchema.introRequests.receiverMembershipId, requesterMembershipId),
          inArray(dbSchema.introRequests.requesterMembershipId, uniqueReceiverIds),
        ),
      )
    : or(
        eq(dbSchema.introRequests.requesterMembershipId, requesterMembershipId),
        eq(dbSchema.introRequests.receiverMembershipId, requesterMembershipId),
      );
  const rows = await getDb()
    .select({
      requesterMembershipId: dbSchema.introRequests.requesterMembershipId,
      receiverMembershipId: dbSchema.introRequests.receiverMembershipId,
      status: dbSchema.introRequests.status,
    })
    .from(dbSchema.introRequests)
    .where(
      and(
        or(
          eq(dbSchema.introRequests.spaceId, spaceId),
          eq(dbSchema.introRequests.status, "pending"),
        ),
        participantCondition,
        sql`${dbSchema.introRequests.status} <> 'expired'`,
      ),
    )
    .orderBy(desc(dbSchema.introRequests.createdAt));
  return rows.reduce((statuses, row) => {
    const otherMembershipId =
      row.requesterMembershipId === requesterMembershipId
        ? row.receiverMembershipId
        : row.requesterMembershipId;
    if (!statuses.has(otherMembershipId)) {
      statuses.set(otherMembershipId, row.status);
    }
    return statuses;
  }, new Map<string, IntroStatus>());
}

export async function listNotificationsForMembership(
  membershipId: string,
  options: TimeOrderedListOptions = {},
) {
  const authorizedSpaceIds = await authorizedSpaceIdsForConnectedMembership(
    membershipId,
  );
  if (!authorizedSpaceIds) return [];
  return listNotificationsForMembershipWithSpaceAccess(
    membershipId,
    authorizedSpaceIds,
    options,
  );
}

export async function hasUnreadNotificationsForMembership(membershipId: string) {
  const authorizedSpaceIds = await authorizedSpaceIdsForConnectedMembership(
    membershipId,
  );
  if (!authorizedSpaceIds) return false;
  return hasUnreadNotificationsForMembershipWithSpaceAccess(
    membershipId,
    authorizedSpaceIds,
  );
}

export async function markNotificationsReadForMembership(membershipId: string) {
  const authorizedSpaceIds = await authorizedSpaceIdsForConnectedMembership(
    membershipId,
  );
  if (!authorizedSpaceIds) return 0;
  return markNotificationsReadForMembershipWithSpaceAccess(
    membershipId,
    authorizedSpaceIds,
  );
}

export async function listNotificationsForMembershipInSpace(
  spaceId: string,
  membershipId: string,
  options: Omit<TimeOrderedListOptions, "spaceId"> = {},
) {
  await requireActiveMembershipsInSpace(spaceId, [membershipId]);
  const limit = positiveIntegerLimit(options.limit);
  if (!usesDatabase) {
    const notifications = getStore().notifications
      .filter(
        (notification) =>
          notification.membershipId === membershipId &&
          notification.spaceId === spaceId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return limit ? notifications.slice(0, limit) : notifications;
  }

  const query = getDb()
    .select()
    .from(dbSchema.notifications)
    .where(
      and(
        eq(dbSchema.notifications.membershipId, membershipId),
        eq(dbSchema.notifications.spaceId, spaceId),
      ),
    )
    .orderBy(desc(dbSchema.notifications.createdAt));
  const rows = await (limit ? query.limit(limit) : query);
  return rows.map(notificationFromRow);
}

/** Account Inbox query: account-level records plus records from Spaces the caller
 * has already authorized. Callers must derive accessibleSpaceIds server-side. */
export async function listNotificationsForMembershipWithSpaceAccess(
  membershipId: string,
  accessibleSpaceIds: string[],
  options: Omit<TimeOrderedListOptions, "spaceId"> = {},
) {
  const limit = positiveIntegerLimit(options.limit);
  const ids = await authorizedSpaceIdsForConnectedMembership(
    membershipId,
    accessibleSpaceIds,
  );
  if (!ids) return [];
  if (!usesDatabase) {
    const idSet = new Set(ids);
    const notifications = getStore().notifications
      .filter(
        (notification) =>
          notification.membershipId === membershipId &&
          (!notification.spaceId || idSet.has(notification.spaceId)),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return limit ? notifications.slice(0, limit) : notifications;
  }

  const query = getDb()
    .select()
    .from(dbSchema.notifications)
    .where(
      and(
        eq(dbSchema.notifications.membershipId, membershipId),
        ids.length
          ? or(
              sql`${dbSchema.notifications.spaceId} is null`,
              inArray(dbSchema.notifications.spaceId, ids),
            )
          : sql`${dbSchema.notifications.spaceId} is null`,
      ),
    )
    .orderBy(desc(dbSchema.notifications.createdAt));
  const rows = await (limit ? query.limit(limit) : query);
  return rows.map(notificationFromRow);
}

export async function hasUnreadNotificationsForMembershipWithSpaceAccess(
  membershipId: string,
  accessibleSpaceIds: string[],
) {
  const ids = await authorizedSpaceIdsForConnectedMembership(
    membershipId,
    accessibleSpaceIds,
  );
  if (!ids) return false;
  if (!usesDatabase) {
    const idSet = new Set(ids);
    return getStore().notifications.some(
      (notification) =>
        notification.membershipId === membershipId &&
        !notification.readAt &&
        (!notification.spaceId || idSet.has(notification.spaceId)),
    );
  }

  const [row] = await getDb()
    .select({ id: dbSchema.notifications.id })
    .from(dbSchema.notifications)
    .where(
      and(
        eq(dbSchema.notifications.membershipId, membershipId),
        sql`${dbSchema.notifications.readAt} is null`,
        ids.length
          ? or(
              sql`${dbSchema.notifications.spaceId} is null`,
              inArray(dbSchema.notifications.spaceId, ids),
            )
          : sql`${dbSchema.notifications.spaceId} is null`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function markNotificationsReadForMembershipWithSpaceAccess(
  membershipId: string,
  accessibleSpaceIds: string[],
) {
  const ids = await authorizedSpaceIdsForConnectedMembership(
    membershipId,
    accessibleSpaceIds,
  );
  if (!ids) return 0;
  const readAt = new Date().toISOString();
  if (!usesDatabase) {
    const idSet = new Set(ids);
    const notifications = getStore().notifications.filter(
      (notification) =>
        notification.membershipId === membershipId &&
        !notification.readAt &&
        (!notification.spaceId || idSet.has(notification.spaceId)),
    );
    notifications.forEach((notification) => {
      notification.readAt = readAt;
    });
    return notifications.length;
  }

  const rows = await getDb()
    .update(dbSchema.notifications)
    .set({ readAt: new Date(readAt) })
    .where(
      and(
        eq(dbSchema.notifications.membershipId, membershipId),
        sql`${dbSchema.notifications.readAt} is null`,
        ids.length
          ? or(
              sql`${dbSchema.notifications.spaceId} is null`,
              inArray(dbSchema.notifications.spaceId, ids),
            )
          : sql`${dbSchema.notifications.spaceId} is null`,
      ),
    )
    .returning({ id: dbSchema.notifications.id });
  return rows.length;
}

export async function markNotificationsReadForMembershipInSpace(
  spaceId: string,
  membershipId: string,
) {
  await requireActiveMembershipsInSpace(spaceId, [membershipId]);
  const readAt = new Date().toISOString();
  if (!usesDatabase) {
    const notifications = getStore().notifications.filter(
      (notification) =>
        notification.membershipId === membershipId &&
        notification.spaceId === spaceId &&
        !notification.readAt,
    );
    notifications.forEach((notification) => {
      notification.readAt = readAt;
    });
    return notifications.length;
  }

  const rows = await getDb()
    .update(dbSchema.notifications)
    .set({ readAt: new Date(readAt) })
    .where(
      and(
        eq(dbSchema.notifications.membershipId, membershipId),
        eq(dbSchema.notifications.spaceId, spaceId),
        sql`${dbSchema.notifications.readAt} is null`,
      ),
    )
    .returning({ id: dbSchema.notifications.id });
  return rows.length;
}

export async function listIntroRequestsForOrg(
  orgId: string,
  options: OrgIntroRequestListOptions = {},
) {
  const limit = positiveIntegerLimit(options.limit);

  if (!usesDatabase) {
    const requests = getStore().introRequests.filter(
      (request) =>
        request.orgId === orgId &&
        (!options.spaceId || request.spaceId === options.spaceId) &&
        (!options.status || request.status === options.status) &&
        (!options.sourceType || request.sourceType === options.sourceType),
    );
    const ordered =
      options.orderBy === "none"
        ? requests
        : requests.sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return limit ? ordered.slice(0, limit) : ordered;
  }

  if (options.orderBy === "none") {
    const query = getDb()
      .select()
      .from(dbSchema.introRequests)
      .where(
        and(
          eq(dbSchema.introRequests.orgId, orgId),
          options.spaceId
            ? eq(dbSchema.introRequests.spaceId, options.spaceId)
            : undefined,
          options.status ? eq(dbSchema.introRequests.status, options.status) : undefined,
          options.sourceType
            ? eq(dbSchema.introRequests.sourceType, options.sourceType)
            : undefined,
        ),
      );
    const rows = await (limit ? query.limit(limit) : query);
    return rows.map(introRequestFromRow);
  }

  const query = getDb()
    .select()
    .from(dbSchema.introRequests)
    .where(
      and(
        eq(dbSchema.introRequests.orgId, orgId),
        options.spaceId
          ? eq(dbSchema.introRequests.spaceId, options.spaceId)
          : undefined,
        options.status ? eq(dbSchema.introRequests.status, options.status) : undefined,
        options.sourceType ? eq(dbSchema.introRequests.sourceType, options.sourceType) : undefined,
      ),
    )
    .orderBy(desc(dbSchema.introRequests.createdAt));
  const rows = await (limit ? query.limit(limit) : query);

  return rows.map(introRequestFromRow);
}

export async function listIntroRequestsForSpace(
  spaceId: string,
  options: Omit<OrgIntroRequestListOptions, "spaceId"> = {},
) {
  const space = await getSpaceById(spaceId);
  if (!space) return [];
  return listIntroRequestsForOrg(space.orgId, { ...options, spaceId });
}

export async function listMatchesForOrg(
  orgId: string,
  options: { spaceId?: string; limit?: number } = {},
) {
  const limit =
    options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;

  if (!usesDatabase) {
    const matches = getStore().matches
      .filter(
        (match) =>
          match.orgId === orgId &&
          (!options.spaceId || match.spaceId === options.spaceId),
      )
      .sort((left, right) => right.score - left.score);

    return limit ? matches.slice(0, limit) : matches;
  }

  const query = getDb()
    .select()
    .from(dbSchema.matches)
    .where(
      and(
        eq(dbSchema.matches.orgId, orgId),
        options.spaceId ? eq(dbSchema.matches.spaceId, options.spaceId) : undefined,
      ),
    )
    .orderBy(desc(dbSchema.matches.score));
  const rows = await (limit ? query.limit(limit) : query);

  return rows.map(matchFromRow);
}

export async function listMatchProfileRecordsForOrg(
  orgId: string,
  options: MatchProfileRecordListOptions = {},
): Promise<MatchProfileRecord[]> {
  const limit = positiveIntegerLimit(options.limit);

  if (!usesDatabase) {
    const store = getStore();
    const profileById = new Map(store.profiles.map((profile) => [profile.id, profile]));
    const matches = store.matches
      .filter(
        (match) =>
          match.orgId === orgId &&
          (!options.spaceId || match.spaceId === options.spaceId) &&
          (!options.matchType || match.matchType === options.matchType) &&
          (!options.scoreBand || match.scoreBand === options.scoreBand),
      )
      .sort((left, right) => right.score - left.score);
    const visibleMatches = limit ? matches.slice(0, limit) : matches;

    return visibleMatches.map((match) => ({
      match,
      sourceProfile: profileById.get(match.sourceProfileId),
      targetProfile: profileById.get(match.targetProfileId),
    }));
  }

  const sourceProfiles = alias(dbSchema.profiles, "source_profiles");
  const targetProfiles = alias(dbSchema.profiles, "target_profiles");
  const query = getDb()
    .select({
      match: dbSchema.matches,
      sourceProfile: sourceProfiles,
      targetProfile: targetProfiles,
    })
    .from(dbSchema.matches)
    .leftJoin(sourceProfiles, eq(sourceProfiles.id, dbSchema.matches.sourceProfileId))
    .leftJoin(targetProfiles, eq(targetProfiles.id, dbSchema.matches.targetProfileId))
    .where(
      and(
        eq(dbSchema.matches.orgId, orgId),
        options.spaceId ? eq(dbSchema.matches.spaceId, options.spaceId) : undefined,
        options.matchType ? eq(dbSchema.matches.matchType, options.matchType) : undefined,
        options.scoreBand ? eq(dbSchema.matches.scoreBand, options.scoreBand) : undefined,
      ),
    )
    .orderBy(desc(dbSchema.matches.score));
  const rows = await (limit ? query.limit(limit) : query);

  return rows.map((row) => ({
    match: matchFromRow(row.match),
    sourceProfile: row.sourceProfile ? profileFromRow(row.sourceProfile) : undefined,
    targetProfile: row.targetProfile ? profileFromRow(row.targetProfile) : undefined,
  }));
}

export async function listMatchProfileRecordsForSpace(
  spaceId: string,
  options: Omit<MatchProfileRecordListOptions, "spaceId"> = {},
): Promise<MatchProfileRecord[]> {
  const space = await getSpaceById(spaceId);
  if (!space) return [];
  return listMatchProfileRecordsForOrg(space.orgId, { ...options, spaceId });
}

export async function addNotification(notification: Notification) {
  if (
    spaceScopedNotificationTypes.has(notification.type) &&
    !notification.spaceId
  ) {
    throw new Error("Content notifications must belong to a Space.");
  }
  const membership = await getMembershipById(notification.membershipId);
  const isAccessNotification = notification.type === "membership_approved";
  if (
    !membership ||
    membership.orgId !== notification.orgId ||
    (isAccessNotification
      ? membership.accountStatus === "suspended" ||
        membership.accountStatus === "deprovisioned"
      : membership.accountStatus !== "connected")
  ) {
    throw new Error("Notification recipient account is not eligible.");
  }
  if (notification.spaceId) {
    const [space, spaceMembership] = await Promise.all([
      getSpaceById(notification.spaceId),
      getSpaceMembership(notification.spaceId, notification.membershipId),
    ]);
    if (
      !space ||
      space.orgId !== notification.orgId ||
      !spaceLifecycleAllowsMemberAccess(space) ||
      spaceMembership?.orgId !== notification.orgId ||
      spaceMembership.accessStatus !== "active"
    ) {
      throw new Error("The notification recipient no longer has access to this community or event.");
    }
    const linkPath = notification.link.split(/[?#]/, 1)[0];
    const spacePath = `/s/${space.slug}`;
    if (
      !linkPath.startsWith("/org/") ||
      (linkPath !== spacePath &&
        !linkPath.endsWith(spacePath) &&
        !linkPath.includes(`${spacePath}/`))
    ) {
      throw new Error("Space notification link must target its owning Space.");
    }
    if (!isAccessNotification && membership.accountStatus !== "connected") {
      throw new Error("Notification recipient must have a connected account.");
    }
  }
  if (!usesDatabase) {
    getStore().notifications.unshift(notification);
    return;
  }

  await getDb().insert(dbSchema.notifications).values(notificationInsert(notification));
}

export async function addAnalyticsEvent(event: AnalyticsEvent) {
  if (!usesDatabase) {
    getStore().analyticsEvents.unshift(event);
    return;
  }

  await getDb().insert(dbSchema.analyticsEvents).values(analyticsEventInsert(event));
}

export async function createPost(
  input: Omit<Post, "id" | "createdAt" | "updatedAt">,
  options: { recordAnalytics?: boolean } = {},
) {
  const post: Post = {
    id: `pst_${nanoid(8)}`,
    ...input,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!usesDatabase) {
    getStore().posts.unshift(post);
  } else {
    await getDb().insert(dbSchema.posts).values(postInsert(post));
  }

  if (options.recordAnalytics !== false) {
    await addAnalyticsEvent({
      id: `evt_${nanoid(8)}`,
      orgId: input.orgId,
      spaceId: input.spaceId,
      membershipId: input.authorMembershipId,
      eventName: "post_created",
      payload: { postId: post.id, type: post.type },
      createdAt: new Date().toISOString(),
    });
  }
  return post;
}

export async function createPostInSpace(
  input: Omit<Post, "id" | "createdAt" | "updatedAt" | "visibility"> & {
    spaceId: string;
    visibility?: "space_only";
  },
  options: { recordAnalytics?: boolean } = {},
) {
  const space = await requireActiveMembershipsInSpace(input.spaceId, [
    input.authorMembershipId,
  ]);
  if (space.orgId !== input.orgId) throw new Error("Space not found.");
  return createPost({ ...input, visibility: "space_only" }, options);
}

export async function createComment(
  input: Omit<Comment, "id" | "createdAt" | "updatedAt" | "status">,
  options: { orgId?: string; recordAnalytics?: boolean } = {},
) {
  const comment: Comment = {
    id: `cmt_${nanoid(8)}`,
    status: "visible",
    ...input,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!usesDatabase) {
    getStore().comments.unshift(comment);
  } else {
    await getDb().insert(dbSchema.comments).values(commentInsert(comment));
  }

  if (options.recordAnalytics !== false) {
    const post = await getPostById(input.postId);
    await addAnalyticsEvent({
      id: `evt_${nanoid(8)}`,
      orgId: options.orgId ?? post?.orgId ?? seedOrganization.id,
      spaceId: post?.spaceId,
      membershipId: input.authorMembershipId,
      eventName: "comment_created",
      payload: { postId: input.postId },
      createdAt: new Date().toISOString(),
    });
  }
  return comment;
}

export async function createCommentInSpace(
  spaceId: string,
  input: Omit<Comment, "id" | "createdAt" | "updatedAt" | "status">,
  options: { recordAnalytics?: boolean } = {},
) {
  const [space, post] = await Promise.all([
    requireActiveMembershipsInSpace(spaceId, [input.authorMembershipId]),
    getPostByIdInSpace(spaceId, input.postId),
  ]);
  if (!post || post.orgId !== space.orgId) {
    throw new Error("Post not found in this community or event.");
  }
  return createComment(input, {
    orgId: space.orgId,
    recordAnalytics: options.recordAnalytics,
  });
}

export async function upsertProfile(
  profile: Profile,
  links: ProfileLink[] | undefined,
  options: { orgId?: string; recomputeMatches?: boolean } = {},
) {
  const shouldRecomputeMatches = options.recomputeMatches ?? true;

  if (!usesDatabase) {
    const store = getStore();
    const existingIndex = store.profiles.findIndex(
      (candidate) => candidate.membershipId === profile.membershipId,
    );

    if (existingIndex >= 0) {
      store.profiles[existingIndex] = profile;
    } else {
      store.profiles.unshift(profile);
    }

    if (links) {
      store.profileLinks = store.profileLinks.filter((link) => link.profileId !== profile.id);
      store.profileLinks.unshift(...links);
    }

    const membership = store.memberships.find(
      (candidate) => candidate.id === profile.membershipId,
    );
    const orgId = options.orgId ?? membership?.orgId;
    if (membership) {
      membership.updatedAt = new Date().toISOString();
    }
    if (orgId && shouldRecomputeMatches) {
      await recomputeMatchesForProfile(orgId, profile.id);
    }
    return profile;
  }

  const db = getDb();
  const existing = await getProfileByMembershipId(profile.membershipId);
  if (existing) {
    await db
      .update(dbSchema.profiles)
      .set(profileInsert(profile))
      .where(eq(dbSchema.profiles.membershipId, profile.membershipId));
  } else {
    await db.insert(dbSchema.profiles).values(profileInsert(profile));
  }

  if (links) {
    await db.delete(dbSchema.profileLinks).where(eq(dbSchema.profileLinks.profileId, profile.id));
    if (links.length) {
      await db.insert(dbSchema.profileLinks).values(links);
    }
  }

  const [membershipUpdate] = await db
    .update(dbSchema.memberships)
    .set({ updatedAt: new Date() })
    .where(eq(dbSchema.memberships.id, profile.membershipId))
    .returning({ orgId: dbSchema.memberships.orgId });
  const orgId = options.orgId ?? membershipUpdate?.orgId;
  if (orgId && shouldRecomputeMatches) {
    await recomputeMatchesForProfile(orgId, profile.id);
  }
  return profile;
}

export async function createIntroRequest(
  input: Omit<IntroRequest, "id" | "createdAt" | "updatedAt">,
  options: { recordAnalytics?: boolean } = {},
) {
  const intro: IntroRequest = {
    id: `intro_${nanoid(8)}`,
    ...input,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!usesDatabase) {
    getStore().introRequests.unshift(intro);
  } else {
    await getDb().insert(dbSchema.introRequests).values(introRequestInsert(intro));
  }

  if (options.recordAnalytics !== false) {
    await addAnalyticsEvent({
      id: `evt_${nanoid(8)}`,
      orgId: input.orgId,
      spaceId: input.spaceId,
      membershipId: input.requesterMembershipId,
      eventName: "intro_requested",
      payload: { receiverMembershipId: input.receiverMembershipId, sourceType: input.sourceType },
      createdAt: new Date().toISOString(),
    });
  }
  return intro;
}

export async function createIntroRequestInSpace(
  input: Omit<IntroRequest, "id" | "createdAt" | "updatedAt"> & {
    spaceId: string;
  },
  options: { recordAnalytics?: boolean } = {},
) {
  const space = await requireActiveMembershipsInSpace(input.spaceId, [
    input.requesterMembershipId,
    input.receiverMembershipId,
  ]);
  if (space.orgId !== input.orgId) {
    throw new Error("The selected community or event could not be found.");
  }
  const pending = await getPendingIntroRequestBetweenMembershipsInOrg(
    input.orgId,
    input.requesterMembershipId,
    input.receiverMembershipId,
  );
  if (pending) {
    throw new Error("These two people already have a pending introduction request here.");
  }
  return createIntroRequest(input, options);
}

export async function respondToIntroRequest(
  introRequestId: string,
  status: "accepted" | "declined",
  options: { recordAnalytics?: boolean } = {},
) {
  const now = new Date().toISOString();

  if (!usesDatabase) {
    const intro = getStore().introRequests.find((request) => request.id === introRequestId);
    if (!intro) {
      return null;
    }

    intro.status = status;
    intro.respondedAt = now;
    intro.updatedAt = now;
    if (status === "accepted") {
      intro.contactRevealedAt = now;
    }

    if (options.recordAnalytics !== false) {
      await addAnalyticsEvent({
        id: `evt_${nanoid(8)}`,
        orgId: intro.orgId,
        spaceId: intro.spaceId,
        membershipId: intro.receiverMembershipId,
        eventName: `intro_${status}`,
        payload: { introRequestId: intro.id },
        createdAt: now,
      });
    }

    return intro;
  }

  const [row] = await getDb()
    .update(dbSchema.introRequests)
    .set({
      status,
      respondedAt: new Date(now),
      updatedAt: new Date(now),
      contactRevealedAt: status === "accepted" ? new Date(now) : undefined,
    })
    .where(eq(dbSchema.introRequests.id, introRequestId))
    .returning();

  if (!row) {
    return null;
  }

  const intro = introRequestFromRow(row);
  if (options.recordAnalytics !== false) {
    await addAnalyticsEvent({
      id: `evt_${nanoid(8)}`,
      orgId: intro.orgId,
      spaceId: intro.spaceId,
      membershipId: intro.receiverMembershipId,
      eventName: `intro_${status}`,
      payload: { introRequestId: intro.id },
      createdAt: now,
    });
  }
  return intro;
}

export async function respondToIntroRequestInSpace(
  spaceId: string,
  introRequestId: string,
  status: "accepted" | "declined",
  options: { recordAnalytics?: boolean } = {},
) {
  if (!(await getIntroRequestByIdInSpace(spaceId, introRequestId))) return null;
  return respondToIntroRequest(introRequestId, status, options);
}

export async function updateMembershipStatus(
  membershipId: string,
  status: MembershipStatus,
  approvalNote?: string,
  options: { existingMembership?: Membership; recomputeMatches?: boolean } = {},
) {
  const membership = options.existingMembership ?? (await getMembershipById(membershipId));
  if (!membership) {
    return null;
  }
  const shouldRecomputeMatches = options.recomputeMatches ?? true;

  const now = new Date().toISOString();
  const approvedAt =
    status === "approved" ? membership.approvedAt ?? now : membership.approvedAt;
  if (!usesDatabase) {
    membership.status = status;
    membership.approvalNote = approvalNote ?? membership.approvalNote;
    membership.updatedAt = now;
    membership.approvedAt = approvedAt;
    if (shouldRecomputeMatches) {
      await recomputeMatchesForMembership(membership.orgId, membership.id);
    }
    return membership;
  }

  const [row] = await getDb()
    .update(dbSchema.memberships)
    .set({
      status,
      approvalNote: approvalNote ?? membership.approvalNote,
      updatedAt: new Date(now),
      approvedAt: maybeDate(approvedAt),
    })
    .where(eq(dbSchema.memberships.id, membershipId))
    .returning();
  if (!row) {
    return null;
  }
  const updatedMembership = membershipFromRow(row);

  if (shouldRecomputeMatches) {
    await recomputeMatchesForMembership(row.orgId, row.id);
  }
  return updatedMembership;
}

export async function updateMembershipAccountStatus(
  membershipId: string,
  accountStatus: AccountStatus,
  options: {
    adminNote?: string;
    existingMembership?: Membership;
    recomputeMatches?: boolean;
  } = {},
) {
  const membership = options.existingMembership ?? (await getMembershipById(membershipId));
  if (!membership) return null;
  const now = new Date().toISOString();

  if (!usesDatabase) {
    membership.accountStatus = accountStatus;
    if (options.adminNote !== undefined) membership.approvalNote = options.adminNote;
    membership.updatedAt = now;
  } else {
    const [row] = await getDb()
      .update(dbSchema.memberships)
      .set({
        accountStatus,
        approvalNote: options.adminNote ?? membership.approvalNote,
        updatedAt: new Date(now),
      })
      .where(eq(dbSchema.memberships.id, membershipId))
      .returning();
    if (!row) return null;
    Object.assign(membership, membershipFromRow(row));
  }

  if (options.recomputeMatches ?? true) {
    await recomputeMatchesForMembership(membership.orgId, membership.id);
  }
  return membership;
}

export async function updateMembershipRole(
  membershipId: string,
  role: MembershipRole,
  options: { existingMembership?: Membership } = {},
) {
  const membership = options.existingMembership ?? (await getMembershipById(membershipId));
  if (!membership) {
    return null;
  }
  const now = new Date().toISOString();

  if (!usesDatabase) {
    membership.role = role;
    membership.updatedAt = now;
    return membership;
  }

  const [row] = await getDb()
    .update(dbSchema.memberships)
    .set({ role, updatedAt: new Date(now) })
    .where(eq(dbSchema.memberships.id, membershipId))
    .returning();
  return row ? membershipFromRow(row) : null;
}

export async function updateMembershipClerkState(
  membershipId: string,
  input: {
    clerkMembershipId?: string | null;
    clerkRole?: ClerkOrgRole | string | null;
    clerkInvitationId?: string | null;
    clerkInvitationStatus?: ClerkInvitationStatus | null;
    clerkInvitationError?: string | null;
    clerkInvitationUpdatedAt?: string | null;
  },
  options: { existingMembership?: Membership } = {},
) {
  const membership = options.existingMembership ?? (await getMembershipById(membershipId));
  if (!membership) {
    return null;
  }

  const now = new Date().toISOString();
  const next = { ...membership, updatedAt: now };
  if ("clerkMembershipId" in input) {
    next.clerkMembershipId = input.clerkMembershipId ?? undefined;
    if (input.clerkMembershipId) next.accountStatus = "connected";
  }
  if ("clerkRole" in input) {
    next.clerkRole = (input.clerkRole as ClerkOrgRole | null) ?? undefined;
  }
  if ("clerkInvitationId" in input) {
    next.clerkInvitationId = input.clerkInvitationId ?? undefined;
  }
  if ("clerkInvitationStatus" in input) {
    next.clerkInvitationStatus = input.clerkInvitationStatus ?? undefined;
  }
  if ("clerkInvitationError" in input) {
    next.clerkInvitationError = input.clerkInvitationError ?? undefined;
  }
  if ("clerkInvitationUpdatedAt" in input) {
    next.clerkInvitationUpdatedAt = input.clerkInvitationUpdatedAt ?? undefined;
  }

  if (!usesDatabase) {
    Object.assign(membership, next);
    return membership;
  }

  const updateValues: Partial<typeof dbSchema.memberships.$inferInsert> = {
    updatedAt: new Date(now),
  };
  if ("clerkMembershipId" in input) {
    updateValues.clerkMembershipId = input.clerkMembershipId ?? null;
    if (input.clerkMembershipId) updateValues.accountStatus = "connected";
  }
  if ("clerkRole" in input) {
    updateValues.clerkRole = input.clerkRole ?? null;
  }
  if ("clerkInvitationId" in input) {
    updateValues.clerkInvitationId = input.clerkInvitationId ?? null;
  }
  if ("clerkInvitationStatus" in input) {
    updateValues.clerkInvitationStatus = input.clerkInvitationStatus ?? null;
  }
  if ("clerkInvitationError" in input) {
    updateValues.clerkInvitationError = input.clerkInvitationError ?? null;
  }
  if ("clerkInvitationUpdatedAt" in input) {
    updateValues.clerkInvitationUpdatedAt = input.clerkInvitationUpdatedAt
      ? new Date(input.clerkInvitationUpdatedAt)
      : null;
  }

  const [row] = await getDb()
    .update(dbSchema.memberships)
    .set(updateValues)
    .where(eq(dbSchema.memberships.id, membershipId))
    .returning();
  return row ? membershipFromRow(row) : null;
}

export async function updatePostModeration(
  postId: string,
  input: Partial<Pick<Post, "hidden" | "featured" | "commentsLocked" | "status">>,
  options: { existingPost?: Post } = {},
) {
  const next = { ...input, updatedAt: new Date().toISOString() };

  if (!usesDatabase) {
    const post =
      options.existingPost ?? getStore().posts.find((candidate) => candidate.id === postId);
    if (!post) {
      return null;
    }

    Object.assign(post, next);
    return post;
  }

  const updateValues: Partial<typeof dbSchema.posts.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.hidden !== undefined) {
    updateValues.hidden = input.hidden;
  }
  if (input.featured !== undefined) {
    updateValues.featured = input.featured;
  }
  if (input.commentsLocked !== undefined) {
    updateValues.commentsLocked = input.commentsLocked;
  }
  if (input.status !== undefined) {
    updateValues.status = input.status;
  }

  const [row] = await getDb()
    .update(dbSchema.posts)
    .set(updateValues)
    .where(eq(dbSchema.posts.id, postId))
    .returning();
  return row ? postFromRow(row) : null;
}

export async function updateCommentStatus(
  commentId: string,
  status: Comment["status"],
  options: { existingComment?: Comment } = {},
) {
  if (!usesDatabase) {
    const comment =
      options.existingComment ?? getStore().comments.find((entry) => entry.id === commentId);
    if (!comment) {
      return null;
    }

    comment.status = status;
    comment.updatedAt = new Date().toISOString();
    return comment;
  }

  const [row] = await getDb()
    .update(dbSchema.comments)
    .set({ status, updatedAt: new Date() })
    .where(eq(dbSchema.comments.id, commentId))
    .returning();
  return row ? commentFromRow(row) : null;
}

export async function updateProfileFlags(
  profileId: string,
  input: Partial<Pick<Profile, "featured" | "stale">>,
  options: { existingProfile?: Profile; orgId?: string; recomputeMatches?: boolean } = {},
) {
  const shouldRecomputeMatches = options.recomputeMatches ?? true;

  if (!usesDatabase) {
    const profile =
      options.existingProfile ??
      getStore().profiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      return null;
    }

    Object.assign(profile, { ...input, updatedAt: new Date().toISOString() });
    const orgId =
      options.orgId ??
      getStore().memberships.find((membership) => membership.id === profile.membershipId)?.orgId;
    if (orgId && shouldRecomputeMatches) {
      await recomputeMatchesForProfile(orgId, profile.id);
    }
    return profile;
  }

  const updateValues: Partial<typeof dbSchema.profiles.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.featured !== undefined) {
    updateValues.featured = input.featured;
  }
  if (input.stale !== undefined) {
    updateValues.stale = input.stale;
  }

  const [row] = await getDb()
    .update(dbSchema.profiles)
    .set(updateValues)
    .where(eq(dbSchema.profiles.id, profileId))
    .returning();
  if (!row) {
    return null;
  }

  const updated = profileFromRow(row);
  const orgId =
    options.orgId ?? (await getMembershipById(updated.membershipId))?.orgId;
  if (orgId && shouldRecomputeMatches) {
    await recomputeMatchesForProfile(orgId, updated.id);
  }
  return updated;
}

export async function updateOrganizationSettings(
  orgId: string,
  input: Partial<
    Pick<Organization, "name" | "tagline" | "description" | "inviteSettings" | "logoUrl">
  >,
) {
  if (!usesDatabase) {
    const organization = getStore().organizations.find((candidate) => candidate.id === orgId);
    if (!organization) {
      return null;
    }

    Object.assign(organization, input);
    return organization;
  }

  const [row] = await getDb()
    .update(dbSchema.organizations)
    .set(input)
    .where(eq(dbSchema.organizations.id, orgId))
    .returning();
  return row ? organizationFromRow(row) : null;
}

async function getOrganizationById(orgId: string) {
  if (!usesDatabase) {
    return getStore().organizations.find((candidate) => candidate.id === orgId);
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.organizations)
    .where(eq(dbSchema.organizations.id, orgId))
    .limit(1);
  return row ? organizationFromRow(row) : undefined;
}

async function listMatchingSpacesForMembership(orgId: string, membershipId: string) {
  if (!usesDatabase) {
    const store = getStore();
    const activeSpaceIds = new Set(
      store.spaceMemberships
        .filter(
          (spaceMembership) =>
            spaceMembership.orgId === orgId &&
            spaceMembership.membershipId === membershipId &&
            spaceMembership.accessStatus === "active",
        )
        .map((spaceMembership) => spaceMembership.spaceId),
    );
    return store.spaces.filter(
      (space) =>
        space.orgId === orgId && activeSpaceIds.has(space.id) && spaceAllowsMatching(space),
    );
  }

  const rows = await getDb()
    .select({ space: dbSchema.spaces })
    .from(dbSchema.spaceMemberships)
    .innerJoin(dbSchema.spaces, eq(dbSchema.spaces.id, dbSchema.spaceMemberships.spaceId))
    .where(
      and(
        eq(dbSchema.spaceMemberships.orgId, orgId),
        eq(dbSchema.spaceMemberships.membershipId, membershipId),
        eq(dbSchema.spaceMemberships.accessStatus, "active"),
      ),
    );
  return rows.map((row) => spaceFromRow(row.space)).filter(spaceAllowsMatching);
}

async function recomputeMatchesForMembership(orgId: string, membershipId: string) {
  const spaces = await listMatchingSpacesForMembership(orgId, membershipId);
  const matches: MatchRecord[] = [];
  for (const space of spaces) {
    matches.push(...(await recomputeMatchesForSpace(space.id)));
  }
  return matches;
}

export async function recomputeMatchesForProfile(orgId: string, profileId: string) {
  const profile = await getProfileById(profileId);
  if (!profile) return [];
  const membership = await getMembershipById(profile.membershipId);
  if (!membership || membership.orgId !== orgId) return [];
  return recomputeMatchesForMembership(orgId, membership.id);
}

async function getSpaceMatchRecomputeInput(spaceId: string) {
  const space = await getSpaceById(spaceId);
  if (!space) return undefined;

  const [organization, records, configs, posts] = await Promise.all([
    getOrganizationById(space.orgId),
    listActiveSpaceMemberRecords(space.id),
    listMatchTypeConfigsForOrg(space.orgId),
    usesDatabase
      ? getDb()
          .select()
          .from(dbSchema.posts)
          .where(
            and(
              eq(dbSchema.posts.spaceId, space.id),
              eq(dbSchema.posts.hidden, false),
            ),
          )
          .then((rows) => rows.map(postFromRow))
      : Promise.resolve(
          getStore().posts.filter(
            (post) => post.spaceId === space.id && !post.hidden,
          ),
        ),
  ]);
  if (!organization) return undefined;

  const matchingRecords = records.flatMap<SpaceMatchingMember>((record) =>
    record.profile && record.intent
      ? [{
          membership: record.membership,
          profile: record.profile,
          spaceMembership: record.spaceMembership,
          intent: record.intent,
        }]
      : [],
  );
  return { organization, space, records: matchingRecords, configs, posts };
}

const localEmbeddingReason = "Matching used the built-in fallback method.";

async function prepareProfileEmbeddings(profiles: Profile[]) {
  const hasProvider = hasConfiguredEmbeddingProvider();
  const pending = profiles.flatMap((profile) => {
    // Reusable profile embeddings must never contain Space-private activity.
    const texts = buildMatchingEmbeddingTexts(profile, []);
    const sourceHash = createHash("sha256")
      .update(
        JSON.stringify({
          dimensions: MATCHING_EMBEDDING_DIMENSIONS,
          localModel: LOCAL_EMBEDDING_MODEL,
          providerModel: MATCHING_EMBEDDING_MODEL,
          seekingText: texts.seekingProfileText,
          offeringText: texts.offeringText,
        }),
      )
      .digest("hex");
    const hasCurrentVectors =
      profile.embeddingSourceHash === sourceHash &&
      profile.seekingEmbedding?.length === MATCHING_EMBEDDING_DIMENSIONS &&
      profile.offeringEmbedding?.length === MATCHING_EMBEDDING_DIMENSIONS;
    const canReuseLocalFallback =
      !hasProvider && profile.embeddingModel === LOCAL_EMBEDDING_MODEL;
    return hasCurrentVectors &&
      (profile.embeddingStatus === "ready" || canReuseLocalFallback)
      ? []
      : [{ profile, sourceHash, texts }];
  });
  if (!pending.length) {
    const degraded = profiles.filter(
      (profile) => profile.embeddingModel === LOCAL_EMBEDDING_MODEL,
    ).length;
    return {
      refreshed: 0,
      degraded,
      degradedReason: degraded ? localEmbeddingReason : undefined,
    };
  }

  const inputs = pending.flatMap(({ texts }) => [
    texts.seekingProfileText,
    texts.offeringText,
  ]);
  let generated: Awaited<ReturnType<typeof generateEmbeddingVectors>>;
  let providerError: string | undefined;
  try {
    generated = await generateEmbeddingVectors(inputs);
  } catch (error) {
    console.error("[wavesparks] Profile matching preparation failed", error);
    providerError = "Matching used a fallback method for this update.";
    generated = { model: LOCAL_EMBEDDING_MODEL, vectors: inputs.map(buildLocalEmbedding) };
  }
  const degradedReason =
    providerError ?? (generated.model === LOCAL_EMBEDDING_MODEL ? localEmbeddingReason : undefined);

  let offset = 0;
  for (const { profile, sourceHash, texts } of pending) {
    profile.seekingEmbeddingText = texts.seekingProfileText;
    profile.offeringEmbeddingText = texts.offeringText;
    profile.seekingEmbedding = generated.vectors[offset];
    profile.offeringEmbedding = generated.vectors[offset + 1];
    offset += 2;
    profile.embeddingModel = generated.model;
    profile.embeddingSourceHash = sourceHash;
    profile.embeddingStatus = degradedReason ? "failed" : "ready";
    profile.embeddingError = degradedReason;
    profile.embeddingUpdatedAt = new Date().toISOString();

    if (usesDatabase) {
      await getDb()
        .update(dbSchema.profiles)
        .set({
          seekingEmbeddingText: profile.seekingEmbeddingText,
          offeringEmbeddingText: profile.offeringEmbeddingText,
          seekingEmbedding: profile.seekingEmbedding,
          offeringEmbedding: profile.offeringEmbedding,
          embeddingModel: profile.embeddingModel,
          embeddingSourceHash: profile.embeddingSourceHash,
          embeddingStatus: profile.embeddingStatus,
          embeddingError: profile.embeddingError,
          embeddingUpdatedAt: new Date(profile.embeddingUpdatedAt),
        })
        .where(eq(dbSchema.profiles.id, profile.id));
    }
  }
  return {
    refreshed: pending.length,
    degraded: degradedReason ? pending.length : 0,
    degradedReason,
  };
}

async function prepareSpaceIntentEmbeddings(
  records: SpaceMatchingMember[],
  posts: Post[],
) {
  const hasProvider = hasConfiguredEmbeddingProvider();
  const postsByMembership = new Map<string, Post[]>();
  for (const post of posts) {
    const memberPosts = postsByMembership.get(post.authorMembershipId) ?? [];
    memberPosts.push(post);
    postsByMembership.set(post.authorMembershipId, memberPosts);
  }
  const candidateRecords = records.filter(
    (record) =>
      record.intent.matchingOptIn &&
      record.intent.intentComplete &&
      record.profile.onboardingComplete,
  );
  const pending = candidateRecords.flatMap((record) => {
    const texts = buildSpaceIntentEmbeddingTexts(
      record.profile,
      record.intent,
      postsByMembership.get(record.membership.id) ?? [],
    );
    const sourceHash = createHash("sha256")
      .update(
        JSON.stringify({
          dimensions: MATCHING_EMBEDDING_DIMENSIONS,
          localModel: LOCAL_EMBEDDING_MODEL,
          providerModel: MATCHING_EMBEDDING_MODEL,
          spaceId: record.intent.spaceId,
          seekingText: texts.seekingText,
          offeringText: texts.offeringText,
        }),
      )
      .digest("hex");
    const hasCurrentVectors =
      record.intent.embeddingSourceHash === sourceHash &&
      record.intent.seekingEmbedding?.length === MATCHING_EMBEDDING_DIMENSIONS &&
      record.intent.offeringEmbedding?.length === MATCHING_EMBEDDING_DIMENSIONS;
    const canReuseLocalFallback =
      !hasProvider && record.intent.embeddingModel === LOCAL_EMBEDDING_MODEL;
    return hasCurrentVectors &&
      (record.intent.embeddingStatus === "ready" || canReuseLocalFallback)
      ? []
      : [{ record, sourceHash, texts }];
  });
  if (!pending.length) {
    const degraded = candidateRecords.filter(
      (record) => record.intent.embeddingModel === LOCAL_EMBEDDING_MODEL,
    ).length;
    return {
      refreshed: 0,
      degraded,
      degradedReason: degraded ? localEmbeddingReason : undefined,
    };
  }

  const inputs = pending.flatMap(({ texts }) => [texts.seekingText, texts.offeringText]);
  let generated: Awaited<ReturnType<typeof generateEmbeddingVectors>>;
  let providerError: string | undefined;
  try {
    generated = await generateEmbeddingVectors(inputs);
  } catch (error) {
    console.error("[wavesparks] Event matching preparation failed", error);
    providerError = "Matching used a fallback method for this update.";
    generated = { model: LOCAL_EMBEDDING_MODEL, vectors: inputs.map(buildLocalEmbedding) };
  }
  const degradedReason =
    providerError ?? (generated.model === LOCAL_EMBEDDING_MODEL ? localEmbeddingReason : undefined);

  let offset = 0;
  for (const { record, sourceHash, texts } of pending) {
    const intent = record.intent;
    intent.seekingText = texts.seekingText;
    intent.offeringText = texts.offeringText;
    intent.seekingEmbedding = generated.vectors[offset];
    intent.offeringEmbedding = generated.vectors[offset + 1];
    offset += 2;
    intent.embeddingModel = generated.model;
    intent.embeddingSourceHash = sourceHash;
    intent.embeddingStatus = degradedReason ? "failed" : "ready";
    intent.embeddingError = degradedReason;
    intent.embeddingUpdatedAt = new Date().toISOString();
    intent.updatedAt = intent.embeddingUpdatedAt;

    if (usesDatabase) {
      await getDb()
        .update(dbSchema.spaceIntents)
        .set({
          seekingText: intent.seekingText,
          offeringText: intent.offeringText,
          seekingEmbedding: intent.seekingEmbedding,
          offeringEmbedding: intent.offeringEmbedding,
          embeddingModel: intent.embeddingModel,
          embeddingSourceHash: intent.embeddingSourceHash,
          embeddingStatus: intent.embeddingStatus,
          embeddingError: intent.embeddingError,
          embeddingUpdatedAt: new Date(intent.embeddingUpdatedAt),
          updatedAt: new Date(intent.updatedAt),
        })
        .where(eq(dbSchema.spaceIntents.id, intent.id));
    }
  }
  return {
    refreshed: pending.length,
    degraded: degradedReason ? pending.length : 0,
    degradedReason,
  };
}

async function beginMatchRun(orgId: string, spaceId: string) {
  const run: MatchRun = {
    id: `mrun_${nanoid(10)}`,
    orgId,
    spaceId,
    startedAt: new Date().toISOString(),
    status: "running",
    metadata: {},
  };
  if (!usesDatabase) {
    getStore().matchRuns.unshift(run);
  } else {
    await getDb().insert(dbSchema.matchRuns).values(matchRunInsert(run));
  }
  return run;
}

async function finishMatchRun(
  run: MatchRun,
  status: MatchRun["status"],
  metadata: Record<string, unknown>,
) {
  run.status = status;
  run.completedAt = new Date().toISOString();
  run.metadata = metadata;
  if (usesDatabase) {
    await getDb()
      .update(dbSchema.matchRuns)
      .set({
        status,
        completedAt: new Date(run.completedAt),
        metadataJson: metadata,
      })
      .where(eq(dbSchema.matchRuns.id, run.id));
  }
}

async function replaceMatchesForSpace(space: Space, matches: MatchRecord[]) {
  if (!usesDatabase) {
    const store = getStore();
    const priorState = new Map(
      store.matches
        .filter((match) => match.spaceId === space.id)
        .map((match) => [
          match.id,
          {
            dismissedBySource: match.dismissedBySource,
            hiddenByAdmin: match.hiddenByAdmin,
          },
        ]),
    );
    const dismissedByFeedback = new Set(
      store.matchFeedback
        .filter(
          (feedback) =>
            feedback.spaceId === space.id && feedback.value === "not_relevant",
        )
        .map((feedback) => feedback.matchId),
    );
    for (const match of matches) {
      Object.assign(match, priorState.get(match.id));
      if (dismissedByFeedback.has(match.id)) match.dismissedBySource = true;
    }
    store.matches = [
      ...store.matches.filter((match) => match.spaceId !== space.id),
      ...matches,
    ];
    return;
  }

  const [previousRows, feedbackRows] = await Promise.all([
    getDb()
      .select({
        id: dbSchema.matches.id,
        dismissedBySource: dbSchema.matches.dismissedBySource,
        hiddenByAdmin: dbSchema.matches.hiddenByAdmin,
      })
      .from(dbSchema.matches)
      .where(eq(dbSchema.matches.spaceId, space.id)),
    getDb()
      .select({ matchId: dbSchema.matchFeedback.matchId })
      .from(dbSchema.matchFeedback)
      .where(
        and(
          eq(dbSchema.matchFeedback.spaceId, space.id),
          eq(dbSchema.matchFeedback.value, "not_relevant"),
        ),
      ),
  ]);
  const priorState = new Map(previousRows.map((row) => [row.id, row]));
  const dismissedByFeedback = new Set(feedbackRows.map((row) => row.matchId));
  for (const match of matches) {
    Object.assign(match, priorState.get(match.id));
    if (dismissedByFeedback.has(match.id)) match.dismissedBySource = true;
  }

  const deleteQuery = getDb()
    .delete(dbSchema.matches)
    .where(eq(dbSchema.matches.spaceId, space.id));
  if (matches.length) {
    await getDb().batch([
      deleteQuery,
      getDb().insert(dbSchema.matches).values(matches.map(matchInsert)),
    ]);
  } else {
    await deleteQuery;
  }
}

export async function recomputeMatchesForSpace(spaceId: string) {
  const input = await getSpaceMatchRecomputeInput(spaceId);
  if (!input) return [];
  const run = await beginMatchRun(input.organization.id, input.space.id);
  try {
    if (!spaceAllowsMatching(input.space)) {
      await replaceMatchesForSpace(input.space, []);
      await finishMatchRun(run, "completed", {
        skipped: true,
        reason: input.space.matchingEnabled
          ? `Event status is ${input.space.lifecycle}.`
          : "Matching is turned off.",
        matches: 0,
      });
      return [];
    }

    const profileResult = await prepareProfileEmbeddings(
      input.records.map((record) => record.profile),
    );
    const intentResult = await prepareSpaceIntentEmbeddings(input.records, input.posts);
    const matches = recomputeMatchesForSpaceMembers(
      input.organization,
      input.space,
      input.records,
      input.configs,
      { runId: run.id },
    );
    await replaceMatchesForSpace(input.space, matches);

    const degradedReason = profileResult.degradedReason ?? intentResult.degradedReason;
    await finishMatchRun(run, "completed", {
      algorithmVersion: matches[0]?.algorithmVersion ?? "hybrid-v2",
      spaceId: input.space.id,
      activeTypes: input.configs.filter((config) => config.active).length,
      eligibleProfiles: input.records.length,
      matches: matches.length,
      profileEmbeddingsRefreshed: profileResult.refreshed,
      intentEmbeddingsRefreshed: intentResult.refreshed,
      embeddingsDegraded: profileResult.degraded + intentResult.degraded,
      ...(degradedReason ? { embeddingDegradedReason: degradedReason } : {}),
    });
    return matches;
  } catch (error) {
    console.error("[wavesparks] Match refresh failed", spaceId, error);
    await finishMatchRun(run, "failed", {
      spaceId: input.space.id,
      error: "Matches couldn’t be refreshed. Try again in a few minutes.",
    });
    throw error;
  }
}

export async function recomputeMatchesForOrg(orgId: string) {
  const spaces = (await listSpacesForOrg(orgId)).filter(spaceAllowsMatching);
  const matches: MatchRecord[] = [];
  for (const space of spaces) {
    matches.push(...(await recomputeMatchesForSpace(space.id)));
  }
  return matches;
}

export async function getAnalyticsSnapshot(orgId: string) {
  if (usesDatabase) {
    return getAnalyticsSnapshotFromDatabase(orgId);
  }

  return buildOrgAnalyticsSnapshot(await getOrgAnalyticsInput(orgId));
}

function countFromRows(rows: Array<{ count: number }>) {
  return Number(rows[0]?.count ?? 0);
}

function dateCountMap(rows: Array<{ date: string; count: number }>) {
  return new Map(rows.map((row) => [row.date, Number(row.count)]));
}

async function getAnalyticsSnapshotFromDatabase(orgId: string): Promise<OrgAnalyticsSnapshot> {
  const seriesStart = dailySeriesStartDate();
  const activeSince = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const postDay = sql<string>`to_char(${dbSchema.posts.createdAt}, 'YYYY-MM-DD')`;
  const commentDay = sql<string>`to_char(${dbSchema.comments.createdAt}, 'YYYY-MM-DD')`;
  const introCreatedDay = sql<string>`to_char(${dbSchema.introRequests.createdAt}, 'YYYY-MM-DD')`;
  const introRespondedDay = sql<string>`to_char(${dbSchema.introRequests.respondedAt}, 'YYYY-MM-DD')`;

  const [
    approvedMembers,
    completedProfiles,
    activeWeeklyPosters,
    introRequestsSent,
    introRequestsAccepted,
    cofounderMatchesAccepted,
    mentorMatchesAccepted,
    teamsFormed,
    startupsLaunched,
    postSeries,
    commentSeries,
    introSeries,
    acceptedIntroSeries,
  ] = await Promise.all([
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.memberships)
      .where(
        and(
          eq(dbSchema.memberships.orgId, orgId),
          eq(dbSchema.memberships.status, "approved"),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.profiles)
      .innerJoin(dbSchema.memberships, eq(dbSchema.memberships.id, dbSchema.profiles.membershipId))
      .where(
        and(
          eq(dbSchema.memberships.orgId, orgId),
          eq(dbSchema.profiles.onboardingComplete, true),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(distinct ${dbSchema.posts.authorMembershipId})::int` })
      .from(dbSchema.posts)
      .where(
        and(
          eq(dbSchema.posts.orgId, orgId),
          sql`${dbSchema.posts.createdAt} > ${activeSince}`,
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.introRequests)
      .where(eq(dbSchema.introRequests.orgId, orgId)),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.introRequests)
      .where(
        and(
          eq(dbSchema.introRequests.orgId, orgId),
          eq(dbSchema.introRequests.status, "accepted"),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.introRequests)
      .where(
        and(
          eq(dbSchema.introRequests.orgId, orgId),
          eq(dbSchema.introRequests.status, "accepted"),
          eq(dbSchema.introRequests.introPurpose, "co-founder conversation"),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.introRequests)
      .where(
        and(
          eq(dbSchema.introRequests.orgId, orgId),
          eq(dbSchema.introRequests.status, "accepted"),
          eq(dbSchema.introRequests.introPurpose, "mentor guidance"),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.analyticsEvents)
      .where(
        and(
          eq(dbSchema.analyticsEvents.orgId, orgId),
          eq(dbSchema.analyticsEvents.eventName, "team_formed"),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.analyticsEvents)
      .where(
        and(
          eq(dbSchema.analyticsEvents.orgId, orgId),
          eq(dbSchema.analyticsEvents.eventName, "startup_launched"),
        ),
      ),
    getDb()
      .select({ date: postDay, count: sql<number>`count(*)::int` })
      .from(dbSchema.posts)
      .where(
        and(
          eq(dbSchema.posts.orgId, orgId),
          sql`${dbSchema.posts.createdAt} >= ${seriesStart}`,
        ),
      )
      .groupBy(postDay),
    getDb()
      .select({ date: commentDay, count: sql<number>`count(*)::int` })
      .from(dbSchema.comments)
      .innerJoin(dbSchema.posts, eq(dbSchema.posts.id, dbSchema.comments.postId))
      .where(
        and(
          eq(dbSchema.posts.orgId, orgId),
          sql`${dbSchema.comments.createdAt} >= ${seriesStart}`,
        ),
      )
      .groupBy(commentDay),
    getDb()
      .select({ date: introCreatedDay, count: sql<number>`count(*)::int` })
      .from(dbSchema.introRequests)
      .where(
        and(
          eq(dbSchema.introRequests.orgId, orgId),
          sql`${dbSchema.introRequests.createdAt} >= ${seriesStart}`,
        ),
      )
      .groupBy(introCreatedDay),
    getDb()
      .select({ date: introRespondedDay, count: sql<number>`count(*)::int` })
      .from(dbSchema.introRequests)
      .where(
        and(
          eq(dbSchema.introRequests.orgId, orgId),
          eq(dbSchema.introRequests.status, "accepted"),
          sql`${dbSchema.introRequests.respondedAt} >= ${seriesStart}`,
        ),
      )
      .groupBy(introRespondedDay),
  ]);

  return {
    approvedMembers: countFromRows(approvedMembers),
    completedProfiles: countFromRows(completedProfiles),
    activeWeeklyPosters: countFromRows(activeWeeklyPosters),
    introRequestsSent: countFromRows(introRequestsSent),
    introRequestsAccepted: countFromRows(introRequestsAccepted),
    cofounderMatchesAccepted: countFromRows(cofounderMatchesAccepted),
    mentorMatchesAccepted: countFromRows(mentorMatchesAccepted),
    teamsFormed: countFromRows(teamsFormed),
    startupsLaunched: countFromRows(startupsLaunched),
    dailySeries: buildDailySeriesFromCounts({
      posts: dateCountMap(postSeries),
      comments: dateCountMap(commentSeries),
      introRequests: dateCountMap(introSeries),
      acceptedIntros: dateCountMap(acceptedIntroSeries),
    }),
  };
}

export async function getPublicOrgStats(orgId: string): Promise<PublicOrgStats> {
  if (!usesDatabase) {
    const store = getStore();
    return {
      approvedMembers: store.memberships.filter(
        (membership) => membership.orgId === orgId && membership.status === "approved",
      ).length,
      introRequestsAccepted: store.introRequests.filter(
        (request) => request.orgId === orgId && request.status === "accepted",
      ).length,
    };
  }

  const [approvedRows, acceptedIntroRows] = await Promise.all([
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.memberships)
      .where(
        and(
          eq(dbSchema.memberships.orgId, orgId),
          eq(dbSchema.memberships.status, "approved"),
        ),
      ),
    getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(dbSchema.introRequests)
      .where(
        and(
          eq(dbSchema.introRequests.orgId, orgId),
          eq(dbSchema.introRequests.status, "accepted"),
        ),
      ),
  ]);

  return {
    approvedMembers: Number(approvedRows[0]?.count ?? 0),
    introRequestsAccepted: Number(acceptedIntroRows[0]?.count ?? 0),
  };
}

export async function getAdminOverviewData(orgId: string): Promise<AdminOverviewData> {
  const [analytics, recentPosts, recentRequests] = await Promise.all([
    getAnalyticsSnapshot(orgId),
    listPostsForOrg(orgId, { limit: 4 }),
    listIntroRequestsForOrg(orgId, { limit: 4 }),
  ]);

  return {
    analytics,
    recentPosts,
    recentRequests,
  };
}

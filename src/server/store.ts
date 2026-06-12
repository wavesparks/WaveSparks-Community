import { nanoid } from "nanoid";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db/client";
import * as dbSchema from "@/db/schema";
import {
  seedAnalyticsEvents,
  seedComments,
  seedFollows,
  seedIntroRequests,
  seedMemberships,
  seedNotifications,
  seedOrganization,
  seedPosts,
  seedProfileLinks,
  seedProfiles,
  seedUsers,
} from "@/data/seed-data";
import { env, getBootstrapAdminPassword, isBootstrapAdminEmail } from "@/lib/env";
import {
  buildDailySeriesFromCounts,
  buildOrgAnalyticsSnapshot,
  dailySeriesStartDate,
} from "@/server/analytics";
import { recomputeMatchesForProfiles } from "@/server/matching";
import type {
  AnalyticsEvent,
  Comment,
  Follow,
  IntroRequest,
  IntroStatus,
  MatchRecord,
  MatchType,
  AffiliationType,
  Membership,
  MembershipRole,
  MembershipStatus,
  Notification,
  OpportunitySource,
  OrgAnalyticsSnapshot,
  Organization,
  Post,
  PostType,
  Profile,
  ProfileLink,
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

export interface StoreState {
  organizations: Organization[];
  users: User[];
  passwordCredentials: PasswordCredential[];
  memberships: Membership[];
  profiles: Profile[];
  profileLinks: ProfileLink[];
  posts: Post[];
  comments: Comment[];
  follows: Follow[];
  matches: MatchRecord[];
  introRequests: IntroRequest[];
  notifications: Notification[];
  analyticsEvents: AnalyticsEvent[];
}

export interface AdminOverviewData {
  analytics: OrgAnalyticsSnapshot;
  recentPosts: Post[];
  recentRequests: IntroRequest[];
}

export interface PublicOrgStats {
  approvedMembers: number;
  introRequestsAccepted: number;
}

export interface MembershipRecord {
  membership: Membership;
  user?: User;
  profile?: Profile;
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
  status?: IntroStatus;
  sourceType?: IntroRequest["sourceType"];
}

interface MatchProfileRecordListOptions {
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
  postIds?: string[];
}

function positiveIntegerLimit(value?: number) {
  return value && value > 0 ? Math.floor(value) : undefined;
}

declare global {
  var __wavesparksStore: StoreState | undefined;
}

const usesDatabase = Boolean(env.databaseUrl);

function initializeStore(): StoreState {
  const base: StoreState = {
    organizations: structuredClone([seedOrganization]),
    users: structuredClone(seedUsers),
    passwordCredentials: [],
    memberships: structuredClone(seedMemberships),
    profiles: structuredClone(seedProfiles),
    profileLinks: structuredClone(seedProfileLinks),
    posts: structuredClone(seedPosts),
    comments: structuredClone(seedComments),
    follows: structuredClone(seedFollows),
    matches: [],
    introRequests: structuredClone(seedIntroRequests),
    notifications: structuredClone(seedNotifications),
    analyticsEvents: structuredClone(seedAnalyticsEvents),
  };

  base.matches = recomputeMatchesForProfiles(
    seedOrganization,
    base.memberships,
    base.profiles,
  );

  return base;
}

function ensureStoreShape(store: StoreState) {
  store.follows ??= structuredClone(seedFollows);
  store.passwordCredentials ??= [];
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
  return {
    id: row.id,
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
}

function userFromRow(row: typeof dbSchema.users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    imageUrl: row.imageUrl,
    platformRole: row.platformRole,
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function membershipFromRow(row: typeof dbSchema.memberships.$inferSelect): Membership {
  return {
    id: row.id,
    orgId: row.orgId,
    userId: row.userId,
    role: row.role,
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
    embeddingText: row.embeddingText,
    profileEmbedding: row.profileEmbedding,
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
    followerMembershipId: row.followerMembershipId,
    followedMembershipId: row.followedMembershipId,
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

function matchFromRow(row: typeof dbSchema.matches.$inferSelect): MatchRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    sourceProfileId: row.sourceProfileId,
    targetProfileId: row.targetProfileId,
    matchType: row.matchType,
    score: row.score,
    scoreBreakdown: row.scoreBreakdownJson,
    explanationText: row.explanationText,
    overlapTags: row.overlapTags,
    scoreBand: row.scoreBand as MatchRecord["scoreBand"],
    surfacedAt: requiredIso(row.surfacedAt),
    dismissedBySource: row.dismissedBySource,
    hiddenByAdmin: row.hiddenByAdmin,
    createdAt: requiredIso(row.createdAt),
    updatedAt: requiredIso(row.updatedAt),
  };
}

function introRequestFromRow(row: typeof dbSchema.introRequests.$inferSelect): IntroRequest {
  return {
    id: row.id,
    orgId: row.orgId,
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
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  };
}

function membershipInsert(membership: Membership): typeof dbSchema.memberships.$inferInsert {
  return {
    ...membership,
    createdAt: new Date(membership.createdAt),
    updatedAt: new Date(membership.updatedAt),
    approvedAt: maybeDate(membership.approvedAt),
  };
}

function profileInsert(profile: Profile): typeof dbSchema.profiles.$inferInsert {
  return {
    ...profile,
    createdAt: new Date(profile.createdAt),
    updatedAt: new Date(profile.updatedAt),
    lastActiveAt: new Date(profile.lastActiveAt),
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
    sourceProfileId: match.sourceProfileId,
    targetProfileId: match.targetProfileId,
    matchType: match.matchType,
    score: match.score,
    scoreBreakdownJson: match.scoreBreakdown,
    explanationText: match.explanationText,
    overlapTags: match.overlapTags,
    scoreBand: match.scoreBand,
    surfacedAt: new Date(match.surfacedAt),
    dismissedBySource: match.dismissedBySource,
    hiddenByAdmin: match.hiddenByAdmin,
    createdAt: new Date(match.createdAt),
    updatedAt: new Date(match.updatedAt),
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
    membershipId: event.membershipId,
    eventName: event.eventName,
    payloadJson: event.payload,
    createdAt: new Date(event.createdAt),
  };
}

export async function getOrganizationBySlug(slug: string) {
  if (!usesDatabase) {
    return getStore().organizations.find((organization) => organization.slug === slug);
  }

  const [row] = await getDb()
    .select()
    .from(dbSchema.organizations)
    .where(eq(dbSchema.organizations.slug, slug))
    .limit(1);
  return row ? organizationFromRow(row) : undefined;
}

export async function getViewerRecordByEmailAndSlug(slug: string, email: string) {
  const normalizedEmail = normalizeEmailAddress(email);

  if (!usesDatabase) {
    const store = getStore();
    const org = store.organizations.find((organization) => organization.slug === slug);
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

  const [row] = await getDb()
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
    .where(eq(dbSchema.organizations.slug, slug))
    .limit(1);

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

function timingSafeHexEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
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

async function verifyPassword(password: string, credential: PasswordCredential) {
  const { passwordHash } = await hashPassword(password, credential.passwordSalt);
  return timingSafeHexEqual(credential.passwordHash, passwordHash);
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

export async function upsertSessionUser(input: { email: string; name: string; imageUrl?: string }) {
  const now = new Date().toISOString();
  const email = normalizeEmailAddress(input.email);
  const existing = await getUserByEmail(email);
  const platformRole = isBootstrapAdminEmail(email)
    ? "platform_owner"
    : existing?.platformRole ?? "standard";

  if (!usesDatabase) {
    const store = getStore();
    if (existing) {
      existing.name = input.name;
      existing.imageUrl = input.imageUrl ?? existing.imageUrl;
      existing.platformRole = platformRole;
      existing.updatedAt = now;
      return existing;
    }

    const next: User = {
      id: `usr_${nanoid(8)}`,
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
        name: input.name,
        imageUrl: input.imageUrl ?? existing.imageUrl,
        platformRole,
        updatedAt: new Date(now),
      })
      .where(eq(dbSchema.users.id, existing.id))
      .returning();
    return userFromRow(row);
  }

  const user: User = {
    id: `usr_${nanoid(8)}`,
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
  options: { existingUser?: User; existingMembership?: Membership } = {},
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
  const adminBootstrap = isBootstrapAdminEmail(user?.email) || user?.platformRole === "platform_owner";
  if (existing) {
    if (
      adminBootstrap &&
      (existing.role !== "org_admin" || existing.status !== "approved")
    ) {
      const now = new Date().toISOString();
      const promoted: Membership = {
        ...existing,
        role: "org_admin",
        status: "approved",
        approvedAt: existing.approvedAt ?? now,
        approvalNote: existing.approvalNote ?? "Approved by WAVESPARK_ADMIN_EMAILS bootstrap.",
        updatedAt: now,
      };

      if (!usesDatabase) {
        Object.assign(existing, promoted);
        return existing;
      }

      const [row] = await getDb()
        .update(dbSchema.memberships)
        .set({
          role: promoted.role,
          status: promoted.status,
          approvedAt: maybeDate(promoted.approvedAt),
          approvalNote: promoted.approvalNote,
          updatedAt: new Date(promoted.updatedAt),
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
    orgId,
    userId,
    role: adminBootstrap ? "org_admin" : "member",
    affiliationType: adminBootstrap ? "current participant" : "invited outsider",
    status: adminBootstrap ? "approved" : "pending",
    archetypes: adminBootstrap ? ["mentor"] : ["invited_outsider"],
    programName: adminBootstrap ? "Wavespark Admin" : "Guest Network",
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

export async function authorizePasswordUser(input: { email?: string; password?: string }) {
  const email = normalizeEmailAddress(input.email ?? "");
  const password = input.password ?? "";

  if (!email || !password) {
    return null;
  }

  const bootstrapPassword = getBootstrapAdminPassword();
  const usesBootstrapPassword =
    isBootstrapAdminEmail(email) &&
    Boolean(bootstrapPassword) &&
    password === bootstrapPassword;

  const credential = await getPasswordCredentialByEmail(email);
  if (credential) {
    if (!(await verifyPassword(password, credential))) {
      if (!usesBootstrapPassword) {
        return null;
      }

      const user = await upsertSessionUser({
        email,
        name: displayNameForEmail(email),
      });
      await setPasswordCredential(user.id, email, password);
      return user;
    }

    return getUserById(credential.userId);
  }

  if (!usesBootstrapPassword) {
    return null;
  }

  const user = await upsertSessionUser({
    email,
    name: displayNameForEmail(email),
  });
  await setPasswordCredential(user.id, email, password);
  return user;
}

export async function createManagedAccount(input: {
  orgId: string;
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
  approvalNote?: string;
}) {
  const email = normalizeEmailAddress(input.email);
  const name = input.name.trim() || displayNameForEmail(email);
  const password = input.password?.trim() ?? "";
  const createPasswordCredential = input.createPasswordCredential ?? true;

  if (!email.includes("@")) {
    throw new Error("A valid email is required.");
  }

  if (createPasswordCredential && password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const user = await upsertSessionUser({ email, name });
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
  const programName = input.programName ?? (role === "org_admin" ? "Wavespark Admin" : "Guest Network");
  const cohortNameOrYear = input.cohortNameOrYear ?? (role === "org_admin" ? "Core" : "Rolling");
  const managedMembership: Membership = {
    id: existing?.id ?? `mem_${nanoid(8)}`,
    orgId: input.orgId,
    userId: user.id,
    role,
    affiliationType,
    status,
    archetypes,
    programName,
    cohortNameOrYear,
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
        role: managedMembership.role,
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
        .posts.filter((post) => post.orgId === orgId)
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
    .where(eq(dbSchema.posts.orgId, orgId));
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
        .filter((post) => post.orgId === orgId)
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
    .where(eq(dbSchema.posts.orgId, orgId));
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
        .posts.filter((post) => post.orgId === orgId)
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
        eq(dbSchema.comments.status, "visible"),
        scopedPostIds ? inArray(dbSchema.comments.postId, scopedPostIds) : undefined,
      ),
    )
    .groupBy(dbSchema.comments.postId);

  return new Map(rows.map((row) => [row.postId, Number(row.count)]));
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

export async function listMatchesForProfile(profileId: string) {
  if (!usesDatabase) {
    return getStore().matches
      .filter(
        (match) =>
          match.sourceProfileId === profileId &&
          !match.hiddenByAdmin &&
          !match.dismissedBySource,
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, 12);
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.matches)
    .where(
      and(
        eq(dbSchema.matches.sourceProfileId, profileId),
        eq(dbSchema.matches.hiddenByAdmin, false),
        eq(dbSchema.matches.dismissedBySource, false),
      ),
    )
    .orderBy(desc(dbSchema.matches.score))
    .limit(12);
  return rows.map(matchFromRow);
}

export async function listMatchesForMembership(membershipId: string) {
  const profile = await getProfileByMembershipId(membershipId);
  return profile ? listMatchesForProfile(profile.id) : [];
}

export async function listMatchTargetRecordsForProfile(
  profileId: string,
  followerMembershipId: string,
  options: { limit?: number } = {},
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
        .filter((follow) => follow.followerMembershipId === followerMembershipId)
        .map((follow) => follow.followedMembershipId),
    );

    return store.matches
      .filter(
        (match) =>
          match.sourceProfileId === profileId &&
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
    .leftJoin(targetMemberships, eq(targetMemberships.id, targetProfiles.membershipId))
    .leftJoin(
      dbSchema.follows,
      and(
        eq(dbSchema.follows.followerMembershipId, followerMembershipId),
        eq(dbSchema.follows.followedMembershipId, targetMemberships.id),
      ),
    )
    .where(
      and(
        eq(dbSchema.matches.sourceProfileId, profileId),
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

export async function listVisibleMatchTargetMembershipIdsForProfile(profileId: string) {
  if (!usesDatabase) {
    const profileById = new Map(
      getStore().profiles.map((profile) => [profile.id, profile]),
    );
    return getStore().matches
      .filter(
        (match) =>
          match.sourceProfileId === profileId &&
          !match.hiddenByAdmin &&
          !match.dismissedBySource,
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, 12)
      .map((match) => profileById.get(match.targetProfileId)?.membershipId)
      .filter((membershipId): membershipId is string => Boolean(membershipId));
  }

  const rows = await getDb()
    .select({ membershipId: dbSchema.profiles.membershipId })
    .from(dbSchema.matches)
    .innerJoin(dbSchema.profiles, eq(dbSchema.profiles.id, dbSchema.matches.targetProfileId))
    .where(
      and(
        eq(dbSchema.matches.sourceProfileId, profileId),
        eq(dbSchema.matches.hiddenByAdmin, false),
        eq(dbSchema.matches.dismissedBySource, false),
      ),
    )
    .orderBy(desc(dbSchema.matches.score))
    .limit(12);
  return rows.map((row) => row.membershipId);
}

export async function listVisibleMatchTargetMembershipIdsForMembership(
  membershipId: string,
) {
  if (!usesDatabase) {
    const profile = await getProfileByMembershipId(membershipId);
    return profile ? listVisibleMatchTargetMembershipIdsForProfile(profile.id) : [];
  }

  const sourceProfiles = alias(dbSchema.profiles, "source_profiles");
  const targetProfiles = alias(dbSchema.profiles, "target_profiles");
  const rows = await getDb()
    .select({ membershipId: targetProfiles.membershipId })
    .from(dbSchema.matches)
    .innerJoin(sourceProfiles, eq(sourceProfiles.id, dbSchema.matches.sourceProfileId))
    .innerJoin(targetProfiles, eq(targetProfiles.id, dbSchema.matches.targetProfileId))
    .where(
      and(
        eq(sourceProfiles.membershipId, membershipId),
        eq(dbSchema.matches.hiddenByAdmin, false),
        eq(dbSchema.matches.dismissedBySource, false),
      ),
    )
    .orderBy(desc(dbSchema.matches.score))
    .limit(12);
  return rows.map((row) => row.membershipId);
}

export async function hasVisibleMatchForProfile(profileId: string) {
  if (!usesDatabase) {
    return getStore().matches.some(
      (match) =>
        match.sourceProfileId === profileId &&
        !match.hiddenByAdmin &&
        !match.dismissedBySource,
    );
  }

  const [row] = await getDb()
    .select({ id: dbSchema.matches.id })
    .from(dbSchema.matches)
    .where(
      and(
        eq(dbSchema.matches.sourceProfileId, profileId),
        eq(dbSchema.matches.hiddenByAdmin, false),
        eq(dbSchema.matches.dismissedBySource, false),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function hasVisibleMatchForMembership(membershipId: string) {
  const profile = await getProfileByMembershipId(membershipId);
  return profile ? hasVisibleMatchForProfile(profile.id) : false;
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

export async function listIntroRequestsForMembership(
  membershipId: string,
  options: IntroRequestListOptions = {},
) {
  const limit = positiveIntegerLimit(options.limit);

  if (!usesDatabase) {
    const requests = getStore().introRequests
      .filter(
        (request) =>
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

export async function listNotificationsForMembership(
  membershipId: string,
  options: TimeOrderedListOptions = {},
) {
  const limit = positiveIntegerLimit(options.limit);

  if (!usesDatabase) {
    const notifications = getStore().notifications
      .filter((notification) => notification.membershipId === membershipId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return limit ? notifications.slice(0, limit) : notifications;
  }

  const query = getDb()
    .select()
    .from(dbSchema.notifications)
    .where(eq(dbSchema.notifications.membershipId, membershipId))
    .orderBy(desc(dbSchema.notifications.createdAt));
  const rows = await (limit ? query.limit(limit) : query);
  return rows.map(notificationFromRow);
}

export async function hasUnreadNotificationsForMembership(membershipId: string) {
  if (!usesDatabase) {
    return getStore().notifications.some(
      (notification) => notification.membershipId === membershipId && !notification.readAt,
    );
  }

  const [row] = await getDb()
    .select({ id: dbSchema.notifications.id })
    .from(dbSchema.notifications)
    .where(
      and(
        eq(dbSchema.notifications.membershipId, membershipId),
        sql`${dbSchema.notifications.readAt} is null`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function markNotificationsReadForMembership(membershipId: string) {
  const readAt = new Date().toISOString();

  if (!usesDatabase) {
    const notifications = getStore().notifications.filter(
      (notification) => notification.membershipId === membershipId && !notification.readAt,
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
        options.status ? eq(dbSchema.introRequests.status, options.status) : undefined,
        options.sourceType ? eq(dbSchema.introRequests.sourceType, options.sourceType) : undefined,
      ),
    )
    .orderBy(desc(dbSchema.introRequests.createdAt));
  const rows = await (limit ? query.limit(limit) : query);

  return rows.map(introRequestFromRow);
}

export async function listMatchesForOrg(
  orgId: string,
  options: { limit?: number } = {},
) {
  const limit =
    options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;

  if (!usesDatabase) {
    const matches = getStore().matches
      .filter((match) => match.orgId === orgId)
      .sort((left, right) => right.score - left.score);

    return limit ? matches.slice(0, limit) : matches;
  }

  const query = getDb()
    .select()
    .from(dbSchema.matches)
    .where(eq(dbSchema.matches.orgId, orgId))
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

export async function addNotification(notification: Notification) {
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
      membershipId: input.authorMembershipId,
      eventName: "post_created",
      payload: { postId: post.id, type: post.type },
      createdAt: new Date().toISOString(),
    });
  }
  return post;
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
    await addAnalyticsEvent({
      id: `evt_${nanoid(8)}`,
      orgId: options.orgId ?? (await getPostById(input.postId))?.orgId ?? seedOrganization.id,
      membershipId: input.authorMembershipId,
      eventName: "comment_created",
      payload: { postId: input.postId },
      createdAt: new Date().toISOString(),
    });
  }
  return comment;
}

export async function upsertProfile(
  profile: Profile,
  links: ProfileLink[],
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

    store.profileLinks = store.profileLinks.filter((link) => link.profileId !== profile.id);
    store.profileLinks.unshift(...links);

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

  await db.delete(dbSchema.profileLinks).where(eq(dbSchema.profileLinks.profileId, profile.id));
  if (links.length) {
    await db.insert(dbSchema.profileLinks).values(links);
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
      membershipId: input.requesterMembershipId,
      eventName: "intro_requested",
      payload: { receiverMembershipId: input.receiverMembershipId, sourceType: input.sourceType },
      createdAt: new Date().toISOString(),
    });
  }
  return intro;
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
      membershipId: intro.receiverMembershipId,
      eventName: `intro_${status}`,
      payload: { introRequestId: intro.id },
      createdAt: now,
    });
  }
  return intro;
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
  if (!usesDatabase) {
    membership.status = status;
    membership.approvalNote = approvalNote ?? membership.approvalNote;
    membership.updatedAt = now;
    if (status === "approved") {
      membership.approvedAt = now;
    }
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
      approvedAt: status === "approved" ? new Date(now) : maybeDate(membership.approvedAt),
    })
    .where(eq(dbSchema.memberships.id, membershipId))
    .returning();
  if (!row) {
    return null;
  }

  if (shouldRecomputeMatches) {
    await recomputeMatchesForMembership(row.orgId, row.id);
  }
  return membershipFromRow(row);
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

async function recomputeMatchesForMembership(orgId: string, membershipId: string) {
  const input = await getMatchRecomputeInput(orgId);
  if (!input) {
    return [];
  }

  const profile = input.profiles.find((candidate) => candidate.membershipId === membershipId);
  return profile ? recomputeMatchesForProfileInput(orgId, profile.id, input) : [];
}

async function getMatchRecomputeInput(orgId: string) {
  const [organization, membershipRecords] = await Promise.all([
    getOrganizationById(orgId),
    listMembershipRecordsForOrg(orgId),
  ]);

  if (!organization) {
    return undefined;
  }

  return {
    organization,
    memberships: membershipRecords.map((record) => record.membership),
    profiles: membershipRecords.flatMap((record) =>
      record.profile ? [record.profile] : [],
    ),
  };
}

export async function recomputeMatchesForProfile(orgId: string, profileId: string) {
  const input = await getMatchRecomputeInput(orgId);
  if (!input) {
    return [];
  }

  return recomputeMatchesForProfileInput(orgId, profileId, input);
}

async function recomputeMatchesForProfileInput(
  orgId: string,
  profileId: string,
  input: NonNullable<Awaited<ReturnType<typeof getMatchRecomputeInput>>>,
) {
  const scopedMatches = recomputeMatchesForProfiles(
    input.organization,
    input.memberships,
    input.profiles,
    { profileIds: [profileId], limit: null },
  );

  if (!usesDatabase) {
    const store = getStore();
    store.matches = [
      ...store.matches.filter(
        (match) =>
          match.orgId !== orgId ||
          (match.sourceProfileId !== profileId && match.targetProfileId !== profileId),
      ),
      ...scopedMatches,
    ];
    return scopedMatches;
  }

  await getDb()
    .delete(dbSchema.matches)
    .where(
      and(
        eq(dbSchema.matches.orgId, orgId),
        or(
          eq(dbSchema.matches.sourceProfileId, profileId),
          eq(dbSchema.matches.targetProfileId, profileId),
        ),
      ),
    );
  if (scopedMatches.length) {
    await getDb().insert(dbSchema.matches).values(scopedMatches.map(matchInsert));
  }
  return scopedMatches;
}

export async function recomputeMatchesForOrg(orgId: string) {
  const input = await getMatchRecomputeInput(orgId);
  if (!input) {
    return [];
  }

  const matches = recomputeMatchesForProfiles(
    input.organization,
    input.memberships,
    input.profiles,
  );

  if (!usesDatabase) {
    const store = getStore();
    store.matches = [
      ...store.matches.filter((match) => match.orgId !== orgId),
      ...matches,
    ];
    return matches;
  }

  await getDb().delete(dbSchema.matches).where(eq(dbSchema.matches.orgId, orgId));
  if (matches.length) {
    await getDb().insert(dbSchema.matches).values(matches.map(matchInsert));
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

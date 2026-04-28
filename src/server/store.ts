import { nanoid } from "nanoid";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

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
import { env, isBootstrapAdminEmail } from "@/lib/env";
import { buildOrgAnalyticsSnapshot } from "@/server/analytics";
import { recomputeMatchesForProfiles } from "@/server/matching";
import type {
  AnalyticsEvent,
  Comment,
  Follow,
  IntroRequest,
  MatchRecord,
  Membership,
  MembershipStatus,
  Notification,
  Organization,
  Post,
  Profile,
  ProfileLink,
  User,
} from "@/lib/domain";

export interface StoreState {
  organizations: Organization[];
  users: User[];
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

declare global {
  var __wavesparksStore: StoreState | undefined;
}

const usesDatabase = Boolean(env.databaseUrl);

function initializeStore(): StoreState {
  const base: StoreState = {
    organizations: structuredClone([seedOrganization]),
    users: structuredClone(seedUsers),
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

function analyticsEventFromRow(row: typeof dbSchema.analyticsEvents.$inferSelect): AnalyticsEvent {
  return {
    id: row.id,
    orgId: row.orgId,
    membershipId: row.membershipId ?? undefined,
    eventName: row.eventName,
    payload: row.payloadJson,
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

export async function upsertSessionUser(input: { email: string; name: string; imageUrl?: string }) {
  const now = new Date().toISOString();
  const existing = await getUserByEmail(input.email);
  const platformRole = isBootstrapAdminEmail(input.email)
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
      email: input.email,
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
    email: input.email,
    name: input.name,
    imageUrl: input.imageUrl ?? `https://api.dicebear.com/9.x/notionists/svg?seed=${input.name}`,
    platformRole,
    createdAt: now,
    updatedAt: now,
  };
  const [row] = await db.insert(dbSchema.users).values(userInsert(user)).returning();
  return userFromRow(row);
}

export async function ensureMembership(userId: string, orgId: string) {
  const user = await getUserById(userId);
  const adminBootstrap = isBootstrapAdminEmail(user?.email) || user?.platformRole === "platform_owner";
  const existing = await getMembershipByUserAndOrg(userId, orgId);
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

export async function listProfilesForOrg(orgId: string) {
  const memberships = await listMembershipsForOrg(orgId);
  const membershipIds = memberships.map((membership) => membership.id);

  if (!usesDatabase) {
    const ids = new Set(membershipIds);
    return getStore().profiles.filter((profile) => ids.has(profile.membershipId));
  }

  if (!membershipIds.length) {
    return [];
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.profiles)
    .where(inArray(dbSchema.profiles.membershipId, membershipIds));
  return rows.map(profileFromRow);
}

export async function listPostsForOrg(orgId: string) {
  if (!usesDatabase) {
    return getStore().posts
      .filter((post) => post.orgId === orgId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.posts)
    .where(eq(dbSchema.posts.orgId, orgId))
    .orderBy(desc(dbSchema.posts.createdAt));
  return rows.map(postFromRow);
}

export async function listAllCommentsForOrg(orgId: string) {
  const posts = await listPostsForOrg(orgId);
  const postIds = posts.map((post) => post.id);

  if (!usesDatabase) {
    const ids = new Set(postIds);
    return getStore().comments.filter((comment) => ids.has(comment.postId));
  }

  if (!postIds.length) {
    return [];
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.comments)
    .where(inArray(dbSchema.comments.postId, postIds));
  return rows.map(commentFromRow);
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

export async function isFollowingMembership(
  followerMembershipId: string,
  followedMembershipId: string,
) {
  if (!usesDatabase) {
    return getStore().follows.some(
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

  const existing = (await listFollowsForMembership(followerMembershipId)).find(
    (follow) => follow.followedMembershipId === followedMembershipId,
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

export async function listMatchesForMembership(membershipId: string) {
  const profile = await getProfileByMembershipId(membershipId);
  if (!profile) {
    return [];
  }

  if (!usesDatabase) {
    return getStore().matches
      .filter(
        (match) =>
          match.sourceProfileId === profile.id &&
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
        eq(dbSchema.matches.sourceProfileId, profile.id),
        eq(dbSchema.matches.hiddenByAdmin, false),
        eq(dbSchema.matches.dismissedBySource, false),
      ),
    )
    .orderBy(desc(dbSchema.matches.score))
    .limit(12);
  return rows.map(matchFromRow);
}

export async function listIntroRequestsForMembership(membershipId: string) {
  if (!usesDatabase) {
    return getStore().introRequests
      .filter(
        (request) =>
          request.requesterMembershipId === membershipId ||
          request.receiverMembershipId === membershipId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.introRequests)
    .where(
      or(
        eq(dbSchema.introRequests.requesterMembershipId, membershipId),
        eq(dbSchema.introRequests.receiverMembershipId, membershipId),
      ),
    )
    .orderBy(desc(dbSchema.introRequests.createdAt));
  return rows.map(introRequestFromRow);
}

export async function listNotificationsForMembership(membershipId: string) {
  if (!usesDatabase) {
    return getStore().notifications
      .filter((notification) => notification.membershipId === membershipId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.notifications)
    .where(eq(dbSchema.notifications.membershipId, membershipId))
    .orderBy(desc(dbSchema.notifications.createdAt));
  return rows.map(notificationFromRow);
}

export async function listIntroRequestsForOrg(orgId: string) {
  if (!usesDatabase) {
    return getStore().introRequests
      .filter((request) => request.orgId === orgId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.introRequests)
    .where(eq(dbSchema.introRequests.orgId, orgId))
    .orderBy(desc(dbSchema.introRequests.createdAt));
  return rows.map(introRequestFromRow);
}

export async function listMatchesForOrg(orgId: string) {
  if (!usesDatabase) {
    return getStore().matches
      .filter((match) => match.orgId === orgId)
      .sort((left, right) => right.score - left.score);
  }

  const rows = await getDb()
    .select()
    .from(dbSchema.matches)
    .where(eq(dbSchema.matches.orgId, orgId))
    .orderBy(desc(dbSchema.matches.score));
  return rows.map(matchFromRow);
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

export async function createPost(input: Omit<Post, "id" | "createdAt" | "updatedAt">) {
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

  await addAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: input.orgId,
    membershipId: input.authorMembershipId,
    eventName: "post_created",
    payload: { postId: post.id, type: post.type },
    createdAt: new Date().toISOString(),
  });
  return post;
}

export async function createComment(input: Omit<Comment, "id" | "createdAt" | "updatedAt" | "status">) {
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

  const post = await getPostById(input.postId);
  await addAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: post?.orgId ?? seedOrganization.id,
    membershipId: input.authorMembershipId,
    eventName: "comment_created",
    payload: { postId: input.postId },
    createdAt: new Date().toISOString(),
  });
  return comment;
}

export async function upsertProfile(profile: Profile, links: ProfileLink[]) {
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

    const membership = await getMembershipById(profile.membershipId);
    if (membership) {
      membership.updatedAt = new Date().toISOString();
      await recomputeMatchesForOrg(membership.orgId);
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

  const membership = await getMembershipById(profile.membershipId);
  if (membership) {
    await db
      .update(dbSchema.memberships)
      .set({ updatedAt: new Date() })
      .where(eq(dbSchema.memberships.id, membership.id));
    await recomputeMatchesForOrg(membership.orgId);
  }
  return profile;
}

export async function createIntroRequest(
  input: Omit<IntroRequest, "id" | "createdAt" | "updatedAt">,
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

  await addAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: input.orgId,
    membershipId: input.requesterMembershipId,
    eventName: "intro_requested",
    payload: { receiverMembershipId: input.receiverMembershipId, sourceType: input.sourceType },
    createdAt: new Date().toISOString(),
  });
  return intro;
}

export async function respondToIntroRequest(
  introRequestId: string,
  status: "accepted" | "declined",
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

    await addAnalyticsEvent({
      id: `evt_${nanoid(8)}`,
      orgId: intro.orgId,
      membershipId: intro.receiverMembershipId,
      eventName: `intro_${status}`,
      payload: { introRequestId: intro.id },
      createdAt: now,
    });

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
  await addAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: intro.orgId,
    membershipId: intro.receiverMembershipId,
    eventName: `intro_${status}`,
    payload: { introRequestId: intro.id },
    createdAt: now,
  });
  return intro;
}

export async function updateMembershipStatus(
  membershipId: string,
  status: MembershipStatus,
  approvalNote?: string,
) {
  const membership = await getMembershipById(membershipId);
  if (!membership) {
    return null;
  }

  const now = new Date().toISOString();
  if (!usesDatabase) {
    membership.status = status;
    membership.approvalNote = approvalNote ?? membership.approvalNote;
    membership.updatedAt = now;
    if (status === "approved") {
      membership.approvedAt = now;
    }
    await recomputeMatchesForOrg(membership.orgId);
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
  await recomputeMatchesForOrg(row.orgId);
  return membershipFromRow(row);
}

export async function updatePostModeration(
  postId: string,
  input: Partial<Pick<Post, "hidden" | "featured" | "commentsLocked" | "status">>,
) {
  const post = await getPostById(postId);
  if (!post) {
    return null;
  }

  const next = { ...input, updatedAt: new Date().toISOString() };

  if (!usesDatabase) {
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
  return postFromRow(row);
}

export async function updateCommentStatus(commentId: string, status: Comment["status"]) {
  if (!usesDatabase) {
    const comment = getStore().comments.find((entry) => entry.id === commentId);
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
) {
  const profile = await getProfileById(profileId);
  if (!profile) {
    return null;
  }

  if (!usesDatabase) {
    Object.assign(profile, { ...input, updatedAt: new Date().toISOString() });
    const membership = await getMembershipById(profile.membershipId);
    if (membership) {
      await recomputeMatchesForOrg(membership.orgId);
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
  const updated = profileFromRow(row);
  const membership = await getMembershipById(updated.membershipId);
  if (membership) {
    await recomputeMatchesForOrg(membership.orgId);
  }
  return updated;
}

export async function updateOrganizationSettings(
  orgId: string,
  input: Partial<Pick<Organization, "name" | "tagline" | "description" | "inviteSettings">>,
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

export async function recomputeMatchesForOrg(orgId: string) {
  const organization = usesDatabase
    ? (await getDb()
        .select()
        .from(dbSchema.organizations)
        .where(eq(dbSchema.organizations.id, orgId))
        .limit(1)).map(organizationFromRow)[0]
    : getStore().organizations.find((candidate) => candidate.id === orgId);

  if (!organization) {
    return [];
  }

  const memberships = await listMembershipsForOrg(orgId);
  const profiles = await listProfilesForOrg(orgId);
  const matches = recomputeMatchesForProfiles(organization, memberships, profiles);

  if (!usesDatabase) {
    getStore().matches = matches;
    return matches;
  }

  await getDb().delete(dbSchema.matches).where(eq(dbSchema.matches.orgId, orgId));
  if (matches.length) {
    await getDb().insert(dbSchema.matches).values(matches.map(matchInsert));
  }
  return matches;
}

export async function getAnalyticsSnapshot(orgId: string) {
  if (!usesDatabase) {
    const store = getStore();
    const memberships = store.memberships.filter((membership) => membership.orgId === orgId);
    const membershipIds = new Set(memberships.map((membership) => membership.id));
    return buildOrgAnalyticsSnapshot({
      memberships,
      profiles: store.profiles.filter((profile) => membershipIds.has(profile.membershipId)),
      posts: store.posts.filter((post) => post.orgId === orgId),
      comments: store.comments,
      introRequests: store.introRequests.filter((event) => event.orgId === orgId),
      matches: store.matches.filter((match) => match.orgId === orgId),
      analyticsEvents: store.analyticsEvents.filter((event) => event.orgId === orgId),
    });
  }

  const memberships = await listMembershipsForOrg(orgId);
  const membershipIds = memberships.map((membership) => membership.id);
  const profiles = await listProfilesForOrg(orgId);
  const posts = await listPostsForOrg(orgId);
  const comments = await listAllCommentsForOrg(orgId);
  const introRequests = await listIntroRequestsForOrg(orgId);
  const matches = await listMatchesForOrg(orgId);
  const analyticsRows = await getDb()
    .select()
    .from(dbSchema.analyticsEvents)
    .where(eq(dbSchema.analyticsEvents.orgId, orgId));

  return buildOrgAnalyticsSnapshot({
    memberships,
    profiles: membershipIds.length ? profiles : [],
    posts,
    comments,
    introRequests,
    matches,
    analyticsEvents: analyticsRows.map(analyticsEventFromRow),
  });
}

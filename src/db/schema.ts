import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const vector = customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 24})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    return value
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .filter(Boolean)
      .map(Number);
  },
});

export const membershipRoleEnum = pgEnum("membership_role", ["org_admin", "member"]);
export const accountStatusEnum = pgEnum("account_status", [
  "invited",
  "connected",
  "suspended",
  "deprovisioned",
]);
export const membershipStatusEnum = pgEnum("membership_status", [
  "pending",
  "approved",
  "rejected",
  "suspended",
  "waitlist",
]);
export const postTypeEnum = pgEnum("post_type", [
  "general_update",
  "ask",
  "opportunity",
  "looking_for_cofounder",
  "looking_for_mentor",
  "resource",
  "announcement",
]);
export const opportunitySourceEnum = pgEnum("opportunity_source", [
  "member",
  "mentor",
  "official",
]);
export const postStatusEnum = pgEnum("post_status", ["active", "closed", "archived"]);
export const commentStatusEnum = pgEnum("comment_status", ["visible", "removed"]);
export const introStatusEnum = pgEnum("intro_status", [
  "pending",
  "accepted",
  "declined",
  "expired",
]);
export const introSourceTypeEnum = pgEnum("intro_source_type", [
  "match",
  "post",
  "profile",
  "admin_manual",
]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "membership_approved",
  "intro_requested",
  "intro_accepted",
  "intro_declined",
  "manual_intro",
  "admin_note",
]);
export const platformRoleEnum = pgEnum("platform_role", ["platform_owner", "standard"]);
export const spaceKindEnum = pgEnum("space_kind", ["main", "event"]);
export const spaceLifecycleEnum = pgEnum("space_lifecycle", [
  "draft",
  "upcoming",
  "active",
  "ended",
  "archived",
]);
export const spaceAccessStatusEnum = pgEnum("space_access_status", [
  "active",
  "waitlist",
  "rejected",
  "suspended",
  "removed",
]);
export const spaceJoinSourceEnum = pgEnum("space_join_source", [
  "invite",
  "import",
  "promotion",
  "direct",
  "migration",
]);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    clerkUserId: text("clerk_user_id"),
    email: text("email").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url").notNull(),
    platformRole: platformRoleEnum("platform_role").notNull().default("standard"),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    clerkUserIdx: uniqueIndex("users_clerk_user_id_idx").on(table.clerkUserId),
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  }),
);

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
});

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    clerkOrgId: text("clerk_org_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    logoUrl: text("logo_url").notNull(),
    themeJson: jsonb("theme_json")
      .$type<{
        accent: string;
        accentSoft: string;
        canvas: string;
        ink: string;
      }>()
      .notNull(),
    tagline: text("tagline").notNull(),
    description: text("description").notNull(),
    membershipRules: text("membership_rules").array().notNull(),
    allowedDomains: text("allowed_domains").array().notNull(),
    inviteSettings: text("invite_settings").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    clerkOrgIdx: uniqueIndex("organizations_clerk_org_id_idx").on(table.clerkOrgId),
    slugIdx: uniqueIndex("organizations_slug_idx").on(table.slug),
  }),
);

export const memberships = pgTable("memberships", {
  id: text("id").primaryKey(),
  clerkMembershipId: text("clerk_membership_id"),
  clerkRole: text("clerk_role"),
  clerkInvitationId: text("clerk_invitation_id"),
  clerkInvitationStatus: text("clerk_invitation_status"),
  clerkInvitationError: text("clerk_invitation_error"),
  clerkInvitationUpdatedAt: timestamp("clerk_invitation_updated_at", {
    withTimezone: true,
  }),
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
  role: membershipRoleEnum("role").notNull().default("member"),
  accountStatus: accountStatusEnum("account_status").notNull().default("invited"),
  affiliationType: text("affiliation_type").notNull(),
  status: membershipStatusEnum("status").notNull().default("pending"),
  archetypes: text("archetypes").array().notNull(),
  programName: text("program_name").notNull(),
  cohortNameOrYear: text("cohort_name_or_year").notNull(),
  invitedByUserId: text("invited_by_user_id"),
  approvalNote: text("approval_note"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => ({
  orgUserIdx: uniqueIndex("memberships_org_user_idx").on(
    table.orgId,
    table.userId,
  ),
  idOrgIdx: uniqueIndex("memberships_id_org_idx").on(table.id, table.orgId),
  clerkMembershipIdx: uniqueIndex("memberships_clerk_membership_id_idx").on(
    table.clerkMembershipId,
  ),
  clerkInvitationIdx: uniqueIndex("memberships_clerk_invitation_id_idx").on(
    table.clerkInvitationId,
  ),
}));

export const spaces = pgTable(
  "spaces",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    slug: text("slug").notNull(),
    kind: spaceKindEnum("kind").notNull(),
    lifecycle: spaceLifecycleEnum("lifecycle").notNull().default("draft"),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    eventLabel: text("event_label").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    matchingEnabled: boolean("matching_enabled").notNull().default(true),
    createdByMembershipId: text("created_by_membership_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgSlugIdx: uniqueIndex("spaces_org_slug_idx").on(table.orgId, table.slug),
    idOrgIdx: uniqueIndex("spaces_id_org_idx").on(table.id, table.orgId),
    oneMainPerOrgIdx: uniqueIndex("spaces_one_main_per_org_idx")
      .on(table.orgId)
      .where(sql`${table.kind} = 'main'`),
    orgLifecycleIdx: index("spaces_org_lifecycle_idx").on(table.orgId, table.lifecycle),
    orgFk: foreignKey({
      columns: [table.orgId],
      foreignColumns: [organizations.id],
      name: "spaces_org_fk",
    }).onDelete("cascade"),
    creatorFk: foreignKey({
      columns: [table.createdByMembershipId, table.orgId],
      foreignColumns: [memberships.id, memberships.orgId],
      name: "spaces_creator_fk",
    }).onDelete("restrict"),
    mainLifecycleCheck: check(
      "spaces_main_lifecycle_check",
      sql`${table.kind} <> 'main' OR ${table.lifecycle} = 'active'`,
    ),
    eventDatesCheck: check(
      "spaces_event_dates_check",
      sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} >= ${table.startsAt}`,
    ),
  }),
);

export const spaceMemberships = pgTable(
  "space_memberships",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    spaceId: text("space_id").notNull(),
    membershipId: text("membership_id").notNull(),
    accessStatus: spaceAccessStatusEnum("access_status").notNull().default("active"),
    joinedVia: spaceJoinSourceEnum("joined_via").notNull().default("direct"),
    invitedByMembershipId: text("invited_by_membership_id"),
    sourceSpaceId: text("source_space_id"),
    decisionNote: text("decision_note"),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    spaceMembershipIdx: uniqueIndex("space_memberships_space_membership_idx").on(
      table.spaceId,
      table.membershipId,
    ),
    spaceMembershipOrgIdx: uniqueIndex("space_memberships_space_membership_org_idx").on(
      table.spaceId,
      table.membershipId,
      table.orgId,
    ),
    membershipAccessIdx: index("space_memberships_membership_access_idx").on(
      table.membershipId,
      table.accessStatus,
    ),
    spaceAccessIdx: index("space_memberships_space_access_idx").on(
      table.spaceId,
      table.accessStatus,
    ),
    spaceOrgFk: foreignKey({
      columns: [table.spaceId, table.orgId],
      foreignColumns: [spaces.id, spaces.orgId],
      name: "space_memberships_space_org_fk",
    }).onDelete("cascade"),
    membershipOrgFk: foreignKey({
      columns: [table.membershipId, table.orgId],
      foreignColumns: [memberships.id, memberships.orgId],
      name: "space_memberships_membership_org_fk",
    }).onDelete("cascade"),
    inviterFk: foreignKey({
      columns: [table.invitedByMembershipId, table.orgId],
      foreignColumns: [memberships.id, memberships.orgId],
      name: "space_memberships_inviter_fk",
    }).onDelete("restrict"),
    sourceSpaceFk: foreignKey({
      columns: [table.sourceSpaceId, table.orgId],
      foreignColumns: [spaces.id, spaces.orgId],
      name: "space_memberships_source_space_fk",
    }).onDelete("restrict"),
    removedAtCheck: check(
      "space_memberships_removed_at_check",
      sql`${table.accessStatus} = 'removed' OR ${table.removedAt} IS NULL`,
    ),
  }),
);

export const spaceIntents = pgTable(
  "space_intents",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    spaceId: text("space_id").notNull(),
    membershipId: text("membership_id").notNull(),
    currentGoal: text("current_goal").notNull().default(""),
    lookingFor: text("looking_for").array().notNull().default(sql`ARRAY[]::text[]`),
    offers: text("offers").array().notNull().default(sql`ARRAY[]::text[]`),
    matchingOptIn: boolean("matching_opt_in").notNull().default(true),
    intentComplete: boolean("intent_complete").notNull().default(false),
    seekingText: text("seeking_text").notNull().default(""),
    offeringText: text("offering_text").notNull().default(""),
    seekingEmbedding: vector("seeking_embedding", { dimensions: 1024 }),
    offeringEmbedding: vector("offering_embedding", { dimensions: 1024 }),
    embeddingModel: text("embedding_model"),
    embeddingSourceHash: text("embedding_source_hash"),
    embeddingStatus: text("embedding_status").notNull().default("pending"),
    embeddingError: text("embedding_error"),
    embeddingUpdatedAt: timestamp("embedding_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    spaceMembershipIdx: uniqueIndex("space_intents_space_membership_idx").on(
      table.spaceId,
      table.membershipId,
    ),
    matchingIdx: index("space_intents_space_matching_idx").on(
      table.spaceId,
      table.matchingOptIn,
      table.intentComplete,
    ),
    membershipFk: foreignKey({
      columns: [table.spaceId, table.membershipId, table.orgId],
      foreignColumns: [
        spaceMemberships.spaceId,
        spaceMemberships.membershipId,
        spaceMemberships.orgId,
      ],
      name: "space_intents_space_membership_fk",
    }).onDelete("cascade"),
    orgFk: foreignKey({
      columns: [table.orgId],
      foreignColumns: [organizations.id],
      name: "space_intents_org_fk",
    }).onDelete("cascade"),
    embeddingStatusCheck: check(
      "space_intents_embedding_status_check",
      sql`${table.embeddingStatus} IN ('pending', 'ready', 'failed')`,
    ),
  }),
);

export const cohorts = pgTable("cohorts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  eventLabel: text("event_label").notNull(),
  status: text("status").notNull().default("active"),
  createdByMembershipId: text("created_by_membership_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const cohortMembers = pgTable(
  "cohort_members",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    cohortId: text("cohort_id").notNull(),
    membershipId: text("membership_id").notNull(),
    invitedEmail: text("invited_email").notNull(),
    invitedName: text("invited_name").notNull(),
    status: text("status").notNull().default("invited"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull(),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    cohortMembershipIdx: uniqueIndex("cohort_members_cohort_membership_idx").on(
      table.cohortId,
      table.membershipId,
    ),
  }),
);

export const clerkWebhookEvents = pgTable("clerk_webhook_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const matchTypeConfigs = pgTable(
  "match_type_configs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    direction: text("direction").notNull(),
    seekerLabel: text("seeker_label").notNull(),
    providerLabel: text("provider_label").notNull(),
    weightsJson: jsonb("weights_json")
      .$type<{
        semantic: number;
        skills: number;
        venture: number;
        availability: number;
        work_style: number;
        location: number;
      }>()
      .notNull(),
    minimumScore: integer("minimum_score").notNull().default(45),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    orgSlugIdx: uniqueIndex("match_type_configs_org_slug_idx").on(
      table.orgId,
      table.slug,
    ),
  }),
);

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  membershipId: text("membership_id").notNull(),
  fullName: text("full_name").notNull(),
  preferredName: text("preferred_name").notNull(),
  displayNamePreference: text("display_name_preference").notNull(),
  profilePhoto: text("profile_photo").notNull(),
  headline: text("headline").notNull(),
  shortBio: text("short_bio").notNull(),
  longBio: text("long_bio").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  timezone: text("timezone").notNull(),
  schoolOrCompany: text("school_or_company").notNull(),
  currentStatus: text("current_status").notNull(),
  startupName: text("startup_name").notNull(),
  startupOneLiner: text("startup_one_liner").notNull(),
  startupDescription: text("startup_description").notNull(),
  stage: text("stage").notNull(),
  industryTags: text("industry_tags").array().notNull(),
  problemSpaceTags: text("problem_space_tags").array().notNull(),
  businessModelTags: text("business_model_tags").array().notNull(),
  currentProgress: text("current_progress").notNull(),
  tractionSummary: text("traction_summary").notNull(),
  regionFocus: text("region_focus").notNull(),
  lookingForTypes: text("looking_for_types").array().notNull(),
  seekingMatchTypes: text("seeking_match_types").array().notNull(),
  offeringMatchTypes: text("offering_match_types").array().notNull(),
  desiredRoles: text("desired_roles").array().notNull(),
  helpNeededTags: text("help_needed_tags").array().notNull(),
  idealMatchDescription: text("ideal_match_description").notNull(),
  skillTags: text("skill_tags").array().notNull(),
  yearsOfExperience: integer("years_of_experience").notNull(),
  topStrengths: text("top_strengths").array().notNull(),
  canContribute: text("can_contribute").array().notNull(),
  priorProjects: text("prior_projects").notNull(),
  notableWins: text("notable_wins").notNull(),
  timeCommitment: text("time_commitment").notNull(),
  availabilityStart: text("availability_start").notNull(),
  remotePreference: text("remote_preference").notNull(),
  preferredGeographies: text("preferred_geographies").array().notNull(),
  meetingFrequencyPreference: text("meeting_frequency_preference").notNull(),
  ambitionLevel: integer("ambition_level").notNull(),
  riskTolerance: integer("risk_tolerance").notNull(),
  speedPreference: text("speed_preference").notNull(),
  decisionStyle: text("decision_style").notNull(),
  workStyle: text("work_style").notNull(),
  communicationStyle: text("communication_style").notNull(),
  conflictStyle: text("conflict_style").notNull(),
  commitmentHorizon: text("commitment_horizon").notNull(),
  missionVsMarketOrientation: text("mission_vs_market_orientation").notNull(),
  structureVsChaos: integer("structure_vs_chaos").notNull(),
  mentorExpertiseTags: text("mentor_expertise_tags").array().notNull(),
  mentorStageExperience: text("mentor_stage_experience").array().notNull(),
  mentorFunctionalStrengths: text("mentor_functional_strengths").array().notNull(),
  mentorAvailability: text("mentor_availability").notNull(),
  mentorOffers: text("mentor_offers").array().notNull(),
  maxMentees: integer("max_mentees"),
  mentorshipPreferences: text("mentorship_preferences").notNull(),
  publicContactEnabled: boolean("public_contact_enabled").notNull().default(false),
  emailForIntro: text("email_for_intro").notNull(),
  whatsappNumber: text("whatsapp_number").notNull(),
  whatsappVisibleAfterAccept: boolean("whatsapp_visible_after_accept")
    .notNull()
    .default(true),
  introOptIn: boolean("intro_opt_in").notNull().default(true),
  profileVisibleInMatching: boolean("profile_visible_in_matching")
    .notNull()
    .default(true),
  profileCompletionPercent: integer("profile_completion_percent").notNull(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull(),
  featured: boolean("featured").notNull().default(false),
  stale: boolean("stale").notNull().default(false),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  seekingEmbeddingText: text("seeking_embedding_text").notNull(),
  offeringEmbeddingText: text("offering_embedding_text").notNull(),
  seekingEmbedding: vector("seeking_embedding", { dimensions: 1024 }),
  offeringEmbedding: vector("offering_embedding", { dimensions: 1024 }),
  embeddingModel: text("embedding_model"),
  embeddingSourceHash: text("embedding_source_hash"),
  embeddingStatus: text("embedding_status").notNull().default("pending"),
  embeddingError: text("embedding_error"),
  embeddingUpdatedAt: timestamp("embedding_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const profileLinks = pgTable("profile_links", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  type: text("type").notNull(),
  url: text("url").notNull(),
});

export const posts = pgTable(
  "posts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    spaceId: text("space_id"),
    authorMembershipId: text("author_membership_id").notNull(),
    type: postTypeEnum("type").notNull(),
    opportunitySource: opportunitySourceEnum("opportunity_source"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    tags: text("tags").array().notNull(),
    relatedStartupName: text("related_startup_name"),
    relatedRolesNeeded: text("related_roles_needed").array().notNull(),
    visibility: text("visibility").notNull().default("org_only"),
    status: postStatusEnum("status").notNull().default("active"),
    featured: boolean("featured").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false),
    commentsLocked: boolean("comments_locked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    idOrgIdx: uniqueIndex("posts_id_org_idx").on(table.id, table.orgId),
    spaceCreatedIdx: index("posts_space_created_idx").on(table.spaceId, table.createdAt),
    spaceOrgFk: foreignKey({
      columns: [table.spaceId, table.orgId],
      foreignColumns: [spaces.id, spaces.orgId],
      name: "posts_space_org_fk",
    }).onDelete("restrict"),
    authorOrgFk: foreignKey({
      columns: [table.authorMembershipId, table.orgId],
      foreignColumns: [memberships.id, memberships.orgId],
      name: "posts_author_org_fk",
    }).onDelete("restrict"),
  }),
);

export const follows = pgTable(
  "follows",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    spaceId: text("space_id"),
    followerMembershipId: text("follower_membership_id").notNull(),
    followedMembershipId: text("followed_membership_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    spaceFollowerFollowedIdx: uniqueIndex("follows_space_follower_followed_idx").on(
      table.spaceId,
      table.followerMembershipId,
      table.followedMembershipId,
    ),
    spaceOrgFk: foreignKey({
      columns: [table.spaceId, table.orgId],
      foreignColumns: [spaces.id, spaces.orgId],
      name: "follows_space_org_fk",
    }).onDelete("restrict"),
    followerOrgFk: foreignKey({
      columns: [table.followerMembershipId, table.orgId],
      foreignColumns: [memberships.id, memberships.orgId],
      name: "follows_follower_org_fk",
    }).onDelete("restrict"),
    followedOrgFk: foreignKey({
      columns: [table.followedMembershipId, table.orgId],
      foreignColumns: [memberships.id, memberships.orgId],
      name: "follows_followed_org_fk",
    }).onDelete("restrict"),
  }),
);

export const postSaves = pgTable(
  "post_saves",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    membershipId: text("membership_id").notNull(),
    postId: text("post_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    membershipPostIdx: uniqueIndex("post_saves_membership_post_idx").on(
      table.membershipId,
      table.postId,
    ),
    membershipOrgFk: foreignKey({
      columns: [table.membershipId, table.orgId],
      foreignColumns: [memberships.id, memberships.orgId],
      name: "post_saves_membership_org_fk",
    }).onDelete("cascade"),
    postOrgFk: foreignKey({
      columns: [table.postId, table.orgId],
      foreignColumns: [posts.id, posts.orgId],
      name: "post_saves_post_org_fk",
    }).onDelete("cascade"),
  }),
);

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull(),
  authorMembershipId: text("author_membership_id").notNull(),
  body: text("body").notNull(),
  status: commentStatusEnum("status").notNull().default("visible"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const matchRuns = pgTable(
  "match_runs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    spaceId: text("space_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: text("status").notNull(),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull(),
  },
  (table) => ({
    spaceStartedIdx: index("match_runs_space_started_idx").on(table.spaceId, table.startedAt),
    spaceOrgFk: foreignKey({
      columns: [table.spaceId, table.orgId],
      foreignColumns: [spaces.id, spaces.orgId],
      name: "match_runs_space_org_fk",
    }).onDelete("restrict"),
  }),
);

export const matches = pgTable("matches", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  spaceId: text("space_id"),
  sourceProfileId: text("source_profile_id").notNull(),
  targetProfileId: text("target_profile_id").notNull(),
  matchType: text("match_type").notNull(),
  score: integer("score").notNull(),
  scoreBreakdownJson: jsonb("score_breakdown_json")
    .$type<Record<string, number>>()
    .notNull(),
  explanationText: text("explanation_text").notNull(),
  overlapTags: text("overlap_tags").array().notNull(),
  scoreBand: text("score_band").notNull(),
  confidence: text("confidence").notNull().default("medium"),
  algorithmVersion: text("algorithm_version").notNull().default("hybrid-v2"),
  runId: text("run_id"),
  surfacedAt: timestamp("surfaced_at", { withTimezone: true }).notNull(),
  dismissedBySource: boolean("dismissed_by_source").notNull().default(false),
  hiddenByAdmin: boolean("hidden_by_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => ({
  sourceTargetTypeIdx: uniqueIndex("matches_space_source_target_type_idx").on(
    table.spaceId,
    table.sourceProfileId,
    table.targetProfileId,
    table.matchType,
  ),
  spaceOrgFk: foreignKey({
    columns: [table.spaceId, table.orgId],
    foreignColumns: [spaces.id, spaces.orgId],
    name: "matches_space_org_fk",
  }).onDelete("restrict"),
}));

export const matchFeedback = pgTable(
  "match_feedback",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    spaceId: text("space_id"),
    matchId: text("match_id").notNull(),
    sourceProfileId: text("source_profile_id").notNull(),
    matchType: text("match_type").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    score: integer("score").notNull(),
    value: text("value").notNull(),
    reasons: text("reasons").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    matchSourceIdx: uniqueIndex("match_feedback_match_source_idx").on(
      table.matchId,
      table.sourceProfileId,
    ),
    spaceOrgFk: foreignKey({
      columns: [table.spaceId, table.orgId],
      foreignColumns: [spaces.id, spaces.orgId],
      name: "match_feedback_space_org_fk",
    }).onDelete("restrict"),
  }),
);

export const introRequests = pgTable(
  "intro_requests",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    spaceId: text("space_id"),
    requesterMembershipId: text("requester_membership_id").notNull(),
    receiverMembershipId: text("receiver_membership_id").notNull(),
    sourceType: introSourceTypeEnum("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    introPurpose: text("intro_purpose").notNull(),
    note: text("note").notNull(),
    status: introStatusEnum("status").notNull().default("pending"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    contactRevealedAt: timestamp("contact_revealed_at", { withTimezone: true }),
    suggestedFirstMessage: text("suggested_first_message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    pendingPairIdx: uniqueIndex("intro_requests_org_pending_pair_idx")
      .on(
        table.orgId,
        sql`least(${table.requesterMembershipId}, ${table.receiverMembershipId})`,
        sql`greatest(${table.requesterMembershipId}, ${table.receiverMembershipId})`,
      )
      .where(sql`${table.status} = 'pending'`),
    membershipCreatedIdx: index("intro_requests_space_created_idx").on(
      table.spaceId,
      table.createdAt,
    ),
    spaceOrgFk: foreignKey({
      columns: [table.spaceId, table.orgId],
      foreignColumns: [spaces.id, spaces.orgId],
      name: "intro_requests_space_org_fk",
    }).onDelete("restrict"),
    requesterOrgFk: foreignKey({
      columns: [table.requesterMembershipId, table.orgId],
      foreignColumns: [memberships.id, memberships.orgId],
      name: "intro_requests_requester_org_fk",
    }).onDelete("restrict"),
    receiverOrgFk: foreignKey({
      columns: [table.receiverMembershipId, table.orgId],
      foreignColumns: [memberships.id, memberships.orgId],
      name: "intro_requests_receiver_org_fk",
    }).onDelete("restrict"),
  }),
);

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    spaceId: text("space_id"),
    reporterMembershipId: text("reporter_membership_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    spaceStatusIdx: index("reports_space_status_idx").on(table.spaceId, table.status),
    spaceOrgFk: foreignKey({
      columns: [table.spaceId, table.orgId],
      foreignColumns: [spaces.id, spaces.orgId],
      name: "reports_space_org_fk",
    }).onDelete("restrict"),
    reporterOrgFk: foreignKey({
      columns: [table.reporterMembershipId, table.orgId],
      foreignColumns: [memberships.id, memberships.orgId],
      name: "reports_reporter_org_fk",
    }).onDelete("restrict"),
  }),
);

export const adminActions = pgTable(
  "admin_actions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    spaceId: text("space_id"),
    adminMembershipId: text("admin_membership_id").notNull(),
    actionType: text("action_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    spaceCreatedIdx: index("admin_actions_space_created_idx").on(table.spaceId, table.createdAt),
    spaceOrgFk: foreignKey({
      columns: [table.spaceId, table.orgId],
      foreignColumns: [spaces.id, spaces.orgId],
      name: "admin_actions_space_org_fk",
    }).onDelete("restrict"),
    adminOrgFk: foreignKey({
      columns: [table.adminMembershipId, table.orgId],
      foreignColumns: [memberships.id, memberships.orgId],
      name: "admin_actions_admin_org_fk",
    }).onDelete("restrict"),
  }),
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    spaceId: text("space_id"),
    membershipId: text("membership_id"),
    eventName: text("event_name").notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    spaceEventCreatedIdx: index("analytics_events_space_event_created_idx").on(
      table.spaceId,
      table.eventName,
      table.createdAt,
    ),
    spaceOrgFk: foreignKey({
      columns: [table.spaceId, table.orgId],
      foreignColumns: [spaces.id, spaces.orgId],
      name: "analytics_events_space_org_fk",
    }).onDelete("restrict"),
    membershipOrgFk: foreignKey({
      columns: [table.membershipId, table.orgId],
      foreignColumns: [memberships.id, memberships.orgId],
      name: "analytics_events_membership_org_fk",
    }).onDelete("restrict"),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    spaceId: text("space_id"),
    membershipId: text("membership_id").notNull(),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    membershipSpaceCreatedIdx: index("notifications_membership_space_created_idx").on(
      table.membershipId,
      table.spaceId,
      table.createdAt,
    ),
    spaceOrgFk: foreignKey({
      columns: [table.spaceId, table.orgId],
      foreignColumns: [spaces.id, spaces.orgId],
      name: "notifications_space_org_fk",
    }).onDelete("restrict"),
    membershipOrgFk: foreignKey({
      columns: [table.membershipId, table.orgId],
      foreignColumns: [memberships.id, memberships.orgId],
      name: "notifications_membership_org_fk",
    }).onDelete("cascade"),
  }),
);

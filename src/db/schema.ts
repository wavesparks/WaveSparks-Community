import {
  boolean,
  customType,
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
export const matchTypeEnum = pgEnum("match_type", ["cofounder_match", "mentor_match"]);
export const introStatusEnum = pgEnum("intro_status", [
  "pending",
  "accepted",
  "declined",
  "expired",
]);
export const introSourceTypeEnum = pgEnum("intro_source_type", [
  "match",
  "post",
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

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url").notNull(),
    platformRole: platformRoleEnum("platform_role").notNull().default("standard"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
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
    slugIdx: uniqueIndex("organizations_slug_idx").on(table.slug),
  }),
);

export const memberships = pgTable("memberships", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
  role: membershipRoleEnum("role").notNull().default("member"),
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
});

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
  embeddingText: text("embedding_text").notNull(),
  profileEmbedding: vector("profile_embedding", { dimensions: 24 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const profileLinks = pgTable("profile_links", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  type: text("type").notNull(),
  url: text("url").notNull(),
});

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
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
});

export const follows = pgTable(
  "follows",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    followerMembershipId: text("follower_membership_id").notNull(),
    followedMembershipId: text("followed_membership_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    followerFollowedIdx: uniqueIndex("follows_follower_followed_idx").on(
      table.followerMembershipId,
      table.followedMembershipId,
    ),
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

export const matchRuns = pgTable("match_runs", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status").notNull(),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().notNull(),
});

export const matches = pgTable("matches", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  sourceProfileId: text("source_profile_id").notNull(),
  targetProfileId: text("target_profile_id").notNull(),
  matchType: matchTypeEnum("match_type").notNull(),
  score: integer("score").notNull(),
  scoreBreakdownJson: jsonb("score_breakdown_json")
    .$type<Record<string, number>>()
    .notNull(),
  explanationText: text("explanation_text").notNull(),
  overlapTags: text("overlap_tags").array().notNull(),
  scoreBand: text("score_band").notNull(),
  surfacedAt: timestamp("surfaced_at", { withTimezone: true }).notNull(),
  dismissedBySource: boolean("dismissed_by_source").notNull().default(false),
  hiddenByAdmin: boolean("hidden_by_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const introRequests = pgTable("intro_requests", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
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
});

export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  reporterMembershipId: text("reporter_membership_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminActions = pgTable("admin_actions", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  adminMembershipId: text("admin_membership_id").notNull(),
  actionType: text("action_type").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const analyticsEvents = pgTable("analytics_events", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  membershipId: text("membership_id"),
  eventName: text("event_name").notNull(),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  membershipId: text("membership_id").notNull(),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  link: text("link").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

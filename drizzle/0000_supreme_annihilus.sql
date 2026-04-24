CREATE TYPE "public"."comment_status" AS ENUM('visible', 'removed');--> statement-breakpoint
CREATE TYPE "public"."intro_source_type" AS ENUM('match', 'post', 'admin_manual');--> statement-breakpoint
CREATE TYPE "public"."intro_status" AS ENUM('pending', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."match_type" AS ENUM('cofounder_match', 'mentor_match');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('org_admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('pending', 'approved', 'rejected', 'suspended', 'waitlist');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('membership_approved', 'intro_requested', 'intro_accepted', 'intro_declined', 'manual_intro', 'admin_note');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('platform_owner', 'standard');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('active', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."post_type" AS ENUM('general_update', 'ask', 'opportunity', 'looking_for_cofounder', 'looking_for_mentor', 'resource', 'announcement');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"admin_membership_id" text NOT NULL,
	"action_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"membership_id" text,
	"event_name" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"author_membership_id" text NOT NULL,
	"body" text NOT NULL,
	"status" "comment_status" DEFAULT 'visible' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intro_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"requester_membership_id" text NOT NULL,
	"receiver_membership_id" text NOT NULL,
	"source_type" "intro_source_type" NOT NULL,
	"source_id" text NOT NULL,
	"intro_purpose" text NOT NULL,
	"note" text NOT NULL,
	"status" "intro_status" DEFAULT 'pending' NOT NULL,
	"responded_at" timestamp with time zone,
	"contact_revealed_at" timestamp with time zone,
	"suggested_first_message" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text NOT NULL,
	"metadata_json" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"source_profile_id" text NOT NULL,
	"target_profile_id" text NOT NULL,
	"match_type" "match_type" NOT NULL,
	"score" integer NOT NULL,
	"score_breakdown_json" jsonb NOT NULL,
	"explanation_text" text NOT NULL,
	"overlap_tags" text[] NOT NULL,
	"score_band" text NOT NULL,
	"surfaced_at" timestamp with time zone NOT NULL,
	"dismissed_by_source" boolean DEFAULT false NOT NULL,
	"hidden_by_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "membership_role" DEFAULT 'member' NOT NULL,
	"affiliation_type" text NOT NULL,
	"status" "membership_status" DEFAULT 'pending' NOT NULL,
	"archetypes" text[] NOT NULL,
	"program_name" text NOT NULL,
	"cohort_name_or_year" text NOT NULL,
	"invited_by_user_id" text,
	"approval_note" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text NOT NULL,
	"theme_json" jsonb NOT NULL,
	"tagline" text NOT NULL,
	"description" text NOT NULL,
	"membership_rules" text[] NOT NULL,
	"allowed_domains" text[] NOT NULL,
	"invite_settings" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"author_membership_id" text NOT NULL,
	"type" "post_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"tags" text[] NOT NULL,
	"related_startup_name" text,
	"related_roles_needed" text[] NOT NULL,
	"visibility" text DEFAULT 'org_only' NOT NULL,
	"status" "post_status" DEFAULT 'active' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"comments_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_links" (
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"membership_id" text NOT NULL,
	"full_name" text NOT NULL,
	"preferred_name" text NOT NULL,
	"display_name_preference" text NOT NULL,
	"profile_photo" text NOT NULL,
	"headline" text NOT NULL,
	"short_bio" text NOT NULL,
	"long_bio" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"timezone" text NOT NULL,
	"school_or_company" text NOT NULL,
	"current_status" text NOT NULL,
	"startup_name" text NOT NULL,
	"startup_one_liner" text NOT NULL,
	"startup_description" text NOT NULL,
	"stage" text NOT NULL,
	"industry_tags" text[] NOT NULL,
	"problem_space_tags" text[] NOT NULL,
	"business_model_tags" text[] NOT NULL,
	"current_progress" text NOT NULL,
	"traction_summary" text NOT NULL,
	"region_focus" text NOT NULL,
	"looking_for_types" text[] NOT NULL,
	"desired_roles" text[] NOT NULL,
	"help_needed_tags" text[] NOT NULL,
	"ideal_match_description" text NOT NULL,
	"skill_tags" text[] NOT NULL,
	"years_of_experience" integer NOT NULL,
	"top_strengths" text[] NOT NULL,
	"can_contribute" text[] NOT NULL,
	"prior_projects" text NOT NULL,
	"notable_wins" text NOT NULL,
	"time_commitment" text NOT NULL,
	"availability_start" text NOT NULL,
	"remote_preference" text NOT NULL,
	"preferred_geographies" text[] NOT NULL,
	"meeting_frequency_preference" text NOT NULL,
	"ambition_level" integer NOT NULL,
	"risk_tolerance" integer NOT NULL,
	"speed_preference" text NOT NULL,
	"decision_style" text NOT NULL,
	"work_style" text NOT NULL,
	"communication_style" text NOT NULL,
	"conflict_style" text NOT NULL,
	"commitment_horizon" text NOT NULL,
	"mission_vs_market_orientation" text NOT NULL,
	"structure_vs_chaos" integer NOT NULL,
	"mentor_expertise_tags" text[] NOT NULL,
	"mentor_stage_experience" text[] NOT NULL,
	"mentor_functional_strengths" text[] NOT NULL,
	"mentor_availability" text NOT NULL,
	"mentor_offers" text[] NOT NULL,
	"max_mentees" integer,
	"mentorship_preferences" text NOT NULL,
	"public_contact_enabled" boolean DEFAULT false NOT NULL,
	"email_for_intro" text NOT NULL,
	"whatsapp_number" text NOT NULL,
	"whatsapp_visible_after_accept" boolean DEFAULT true NOT NULL,
	"intro_opt_in" boolean DEFAULT true NOT NULL,
	"profile_visible_in_matching" boolean DEFAULT true NOT NULL,
	"profile_completion_percent" integer NOT NULL,
	"last_active_at" timestamp with time zone NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"embedding_text" text NOT NULL,
	"profile_embedding" vector(24) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"reporter_membership_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text NOT NULL,
	"platform_role" "platform_role" DEFAULT 'standard' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
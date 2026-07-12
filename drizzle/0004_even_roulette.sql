CREATE TABLE "cohort_members" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"cohort_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"invited_email" text NOT NULL,
	"invited_name" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp with time zone NOT NULL,
	"promoted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"event_label" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_membership_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cohort_members_cohort_membership_idx" ON "cohort_members" USING btree ("cohort_id","membership_id");
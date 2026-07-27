CREATE TYPE "public"."intro_kind" AS ENUM('general', 'mentoring');--> statement-breakpoint
CREATE TYPE "public"."mentor_status" AS ENUM('not_mentor', 'needs_review', 'approved');--> statement-breakpoint
ALTER TABLE "intro_requests" ADD COLUMN "kind" "intro_kind" DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "mentor_status" "mentor_status" DEFAULT 'not_mentor' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "mentor_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "mentor_reviewed_by_membership_id" text;--> statement-breakpoint
UPDATE "memberships"
SET "mentor_status" = 'needs_review'
WHERE "mentor_status" = 'not_mentor'
  AND (
    "affiliation_type" = 'mentor'
    OR 'mentor' = ANY("archetypes")
    OR EXISTS (
      SELECT 1
      FROM "profiles" AS "profile"
      WHERE "profile"."membership_id" = "memberships"."id"
        AND (
          lower(btrim("profile"."current_status")) = 'mentor'
          OR 'mentor_match' = ANY("profile"."offering_match_types")
          OR cardinality("profile"."mentor_expertise_tags") > 0
          OR cardinality("profile"."mentor_stage_experience") > 0
          OR cardinality("profile"."mentor_functional_strengths") > 0
          OR cardinality("profile"."mentor_offers") > 0
          OR lower(btrim("profile"."mentor_availability")) NOT IN ('', 'none')
          OR "profile"."max_mentees" IS NOT NULL
          OR btrim("profile"."mentorship_preferences") <> ''
        )
    )
  );--> statement-breakpoint
UPDATE "intro_requests" AS "intro"
SET "kind" = 'mentoring'
WHERE (
    lower(btrim("intro"."intro_purpose")) = 'mentor guidance'
    OR (
      "intro"."source_type" = 'match'
      AND EXISTS (
        SELECT 1
        FROM "matches" AS "match"
        WHERE "match"."id" = "intro"."source_id"
          AND "match"."org_id" = "intro"."org_id"
          AND "match"."match_type" = 'mentor_match'
      )
    )
  )
  AND EXISTS (
    SELECT 1
    FROM "memberships" AS "receiver"
    WHERE "receiver"."id" = "intro"."receiver_membership_id"
      AND "receiver"."org_id" = "intro"."org_id"
      AND "receiver"."mentor_status" IN ('needs_review', 'approved')
  );--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_mentor_reviewer_fk" FOREIGN KEY ("mentor_reviewed_by_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_org_mentor_status_idx" ON "memberships" USING btree ("org_id","mentor_status");

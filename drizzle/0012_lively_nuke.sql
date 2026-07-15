ALTER TABLE "profiles" ADD COLUMN "bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "problem_interest" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "current_focus" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "technical_experience_level" text DEFAULT 'not_sure' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "technical_experience" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "profiles"
SET
  "bio" = CASE
    WHEN NULLIF(BTRIM("long_bio"), '') IS NULL THEN COALESCE("short_bio", '')
    WHEN NULLIF(BTRIM("short_bio"), '') IS NULL THEN "long_bio"
    WHEN BTRIM("long_bio") = BTRIM("short_bio") THEN "long_bio"
    WHEN POSITION(LOWER(BTRIM("short_bio")) IN LOWER(BTRIM("long_bio"))) > 0 THEN "long_bio"
    WHEN POSITION(LOWER(BTRIM("long_bio")) IN LOWER(BTRIM("short_bio"))) > 0 THEN "short_bio"
    ELSE BTRIM("short_bio") || E'\n\n' || BTRIM("long_bio")
  END,
  "problem_interest" = "startup_description",
  "current_focus" = COALESCE(
    NULLIF(BTRIM("startup_one_liner"), ''),
    NULLIF(BTRIM("startup_description"), ''),
    NULLIF(BTRIM("headline"), ''),
    ''
  ),
  "technical_experience_level" = 'not_sure',
  "technical_experience" = "prior_projects";--> statement-breakpoint
UPDATE "profiles"
SET
  "profile_completion_percent" = CASE
    WHEN "onboarding_complete" THEN 100
    ELSE ROUND((
      (CASE WHEN BTRIM("preferred_name") <> '' THEN 1 ELSE 0 END) +
      (CASE WHEN BTRIM("headline") <> '' THEN 1 ELSE 0 END) +
      (CASE WHEN BTRIM("bio") <> '' THEN 1 ELSE 0 END) +
      (CASE WHEN BTRIM("current_focus") <> '' THEN 1 ELSE 0 END) +
      (CASE WHEN CARDINALITY("seeking_match_types") > 0 THEN 1 ELSE 0 END) +
      (CASE WHEN CARDINALITY("skill_tags") > 0 THEN 1 ELSE 0 END) +
      (CASE WHEN BTRIM("email_for_intro") <> '' THEN 1 ELSE 0 END)
    )::numeric / 7 * 100)::integer
  END,
  "onboarding_complete" =
    "onboarding_complete" OR (
      BTRIM("preferred_name") <> '' AND
      BTRIM("headline") <> '' AND
      BTRIM("bio") <> '' AND
      BTRIM("current_focus") <> '' AND
      CARDINALITY("seeking_match_types") > 0 AND
      CARDINALITY("skill_tags") > 0 AND
      BTRIM("email_for_intro") <> ''
    );

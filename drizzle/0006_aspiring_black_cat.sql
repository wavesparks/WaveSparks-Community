CREATE TABLE "match_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"match_id" text NOT NULL,
	"source_profile_id" text NOT NULL,
	"match_type" text NOT NULL,
	"algorithm_version" text NOT NULL,
	"score" integer NOT NULL,
	"value" text NOT NULL,
	"reasons" text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_type_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"direction" text NOT NULL,
	"seeker_label" text NOT NULL,
	"provider_label" text NOT NULL,
	"weights_json" jsonb NOT NULL,
	"minimum_score" integer DEFAULT 45 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" RENAME COLUMN "embedding_text" TO "seeking_embedding_text";--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "match_type" SET DATA TYPE text USING "match_type"::text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "confidence" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "algorithm_version" text DEFAULT 'legacy-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "seeking_match_types" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "offering_match_types" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "offering_embedding_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "seeking_embedding" vector(1024);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "offering_embedding" vector(1024);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "embedding_model" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "embedding_source_hash" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "embedding_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "embedding_error" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "embedding_updated_at" timestamp with time zone;--> statement-breakpoint
INSERT INTO "match_type_configs" (
	"id", "org_id", "slug", "name", "description", "direction", "seeker_label",
	"provider_label", "weights_json", "minimum_score", "active", "version", "created_at", "updated_at"
)
SELECT
	'mtc_' || "id" || '_cofounder_match', "id", 'cofounder_match', 'Co-founder',
	'A reciprocal founder relationship with complementary capability and commitment.', 'mutual',
	'I am looking for a co-founder', 'I am open to being a co-founder',
	'{"semantic":30,"skills":20,"venture":10,"availability":15,"work_style":15,"location":10}'::jsonb,
	45, true, 1, now(), now()
FROM "organizations"
UNION ALL
SELECT
	'mtc_' || "id" || '_mentor_match', "id", 'mentor_match', 'Mentor',
	'A founder need matched to relevant experience, guidance and availability.', 'seeker_provider',
	'I am looking for a mentor or adviser', 'I can mentor or advise',
	'{"semantic":35,"skills":20,"venture":15,"availability":10,"work_style":5,"location":15}'::jsonb,
	45, true, 1, now(), now()
FROM "organizations"
UNION ALL
SELECT
	'mtc_' || "id" || '_collaborator_match', "id", 'collaborator_match', 'Collaborator',
	'A reciprocal project or teammate relationship built around complementary contributions.', 'mutual',
	'I am looking for a collaborator or teammate', 'I am open to collaborating',
	'{"semantic":35,"skills":25,"venture":15,"availability":15,"work_style":5,"location":5}'::jsonb,
	45, true, 1, now(), now()
FROM "organizations";--> statement-breakpoint
UPDATE "profiles" AS p
SET "seeking_match_types" = array_remove(ARRAY[
	CASE WHEN EXISTS (
		SELECT 1 FROM unnest(p."looking_for_types") AS value
		WHERE lower(trim(value)) IN ('cofounder', 'co-founder')
	) THEN 'cofounder_match' END,
	CASE WHEN EXISTS (
		SELECT 1 FROM unnest(p."looking_for_types") AS value
		WHERE lower(trim(value)) IN ('mentor', 'advice', 'advisor', 'adviser')
	) THEN 'mentor_match' END,
	CASE WHEN EXISTS (
		SELECT 1 FROM unnest(p."looking_for_types") AS value
		WHERE lower(trim(value)) IN ('collaborator', 'collaborators', 'teammate', 'team mate')
	) THEN 'collaborator_match' END
], NULL)::text[];--> statement-breakpoint
UPDATE "profiles" AS p
SET "offering_match_types" = array_remove(ARRAY[
	CASE WHEN 'cofounder_match' = ANY(p."seeking_match_types") THEN 'cofounder_match' END,
	CASE WHEN
		p."current_status" = 'mentor' OR cardinality(p."mentor_offers") > 0 OR EXISTS (
			SELECT 1 FROM "memberships" AS m
			WHERE m."id" = p."membership_id" AND 'mentor' = ANY(m."archetypes")
		)
	THEN 'mentor_match' END,
	CASE WHEN
		'collaborator_match' = ANY(p."seeking_match_types") OR cardinality(p."can_contribute") > 0
	THEN 'collaborator_match' END
], NULL)::text[];--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "algorithm_version" SET DEFAULT 'hybrid-v2';--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "seeking_match_types" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "offering_match_types" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "offering_embedding_text" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "match_feedback_match_source_idx" ON "match_feedback" USING btree ("match_id","source_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_type_configs_org_slug_idx" ON "match_type_configs" USING btree ("org_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_source_target_type_idx" ON "matches" USING btree ("org_id","source_profile_id","target_profile_id","match_type");--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "profile_embedding";--> statement-breakpoint
DROP TYPE "public"."match_type";

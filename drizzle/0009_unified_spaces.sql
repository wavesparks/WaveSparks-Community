-- The legacy tables intentionally remain in place during the expand phase. Abort before
-- changing the schema when data cannot be mapped to exactly one organization/space.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "memberships" m
		LEFT JOIN "organizations" o ON o."id" = m."org_id"
		LEFT JOIN "users" u ON u."id" = m."user_id"
		WHERE o."id" IS NULL OR u."id" IS NULL
	) THEN
		RAISE EXCEPTION '0009 preflight: orphan membership organization/user';
	END IF;

	IF EXISTS (
		SELECT 1 FROM "memberships"
		GROUP BY "org_id", "user_id"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION '0009 preflight: duplicate organization membership';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM (
			SELECT "org_id" FROM "posts"
			UNION ALL SELECT "org_id" FROM "post_saves"
			UNION ALL SELECT "org_id" FROM "follows"
			UNION ALL SELECT "org_id" FROM "match_runs"
			UNION ALL SELECT "org_id" FROM "matches"
			UNION ALL SELECT "org_id" FROM "match_feedback"
			UNION ALL SELECT "org_id" FROM "intro_requests"
			UNION ALL SELECT "org_id" FROM "reports"
			UNION ALL SELECT "org_id" FROM "admin_actions"
			UNION ALL SELECT "org_id" FROM "analytics_events"
			UNION ALL SELECT "org_id" FROM "notifications"
		) scoped
		LEFT JOIN "organizations" o ON o."id" = scoped."org_id"
		WHERE o."id" IS NULL
	) THEN
		RAISE EXCEPTION '0009 preflight: orphan organization-scoped resource';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "cohorts" c
		LEFT JOIN "organizations" o ON o."id" = c."org_id"
		LEFT JOIN "memberships" creator ON creator."id" = c."created_by_membership_id"
		WHERE o."id" IS NULL
			OR (c."created_by_membership_id" IS NOT NULL AND (creator."id" IS NULL OR creator."org_id" <> c."org_id"))
	) THEN
		RAISE EXCEPTION '0009 preflight: orphan or cross-organization cohort creator';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "cohort_members" cm
		LEFT JOIN "cohorts" c ON c."id" = cm."cohort_id"
		LEFT JOIN "memberships" m ON m."id" = cm."membership_id"
		WHERE c."id" IS NULL OR m."id" IS NULL
			OR cm."org_id" <> c."org_id"
			OR cm."org_id" <> m."org_id"
	) THEN
		RAISE EXCEPTION '0009 preflight: orphan or cross-organization cohort membership';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "cohort_members"
		GROUP BY "cohort_id", "membership_id"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION '0009 preflight: duplicate cohort membership';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "cohort_members" cm
		JOIN "memberships" m ON m."id" = cm."membership_id"
		WHERE m."status" IN ('rejected', 'suspended')
	) THEN
		RAISE EXCEPTION '0009 preflight: rejected/suspended membership still belongs to a cohort; resolve explicitly';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "profiles" p
		LEFT JOIN "memberships" m ON m."id" = p."membership_id"
		WHERE m."id" IS NULL
	) OR EXISTS (
		SELECT 1 FROM "profiles"
		GROUP BY "membership_id"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION '0009 preflight: orphan or duplicate membership profile';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "posts" p
		LEFT JOIN "memberships" m ON m."id" = p."author_membership_id"
		WHERE m."id" IS NULL OR m."org_id" <> p."org_id"
	) OR EXISTS (
		SELECT 1
		FROM "comments" c
		LEFT JOIN "posts" p ON p."id" = c."post_id"
		LEFT JOIN "memberships" m ON m."id" = c."author_membership_id"
		WHERE p."id" IS NULL OR m."id" IS NULL OR m."org_id" <> p."org_id"
	) OR EXISTS (
		SELECT 1
		FROM "post_saves" ps
		LEFT JOIN "posts" p ON p."id" = ps."post_id"
		LEFT JOIN "memberships" m ON m."id" = ps."membership_id"
		WHERE p."id" IS NULL OR m."id" IS NULL
			OR ps."org_id" <> p."org_id" OR ps."org_id" <> m."org_id"
	) THEN
		RAISE EXCEPTION '0009 preflight: orphan or cross-organization content relationship';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "follows" f
		LEFT JOIN "memberships" follower ON follower."id" = f."follower_membership_id"
		LEFT JOIN "memberships" followed ON followed."id" = f."followed_membership_id"
		WHERE follower."id" IS NULL OR followed."id" IS NULL
			OR follower."org_id" <> f."org_id" OR followed."org_id" <> f."org_id"
	) THEN
		RAISE EXCEPTION '0009 preflight: orphan or cross-organization follow';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "matches" ma
		LEFT JOIN "profiles" source_profile ON source_profile."id" = ma."source_profile_id"
		LEFT JOIN "profiles" target_profile ON target_profile."id" = ma."target_profile_id"
		LEFT JOIN "memberships" source_member ON source_member."id" = source_profile."membership_id"
		LEFT JOIN "memberships" target_member ON target_member."id" = target_profile."membership_id"
		WHERE source_member."id" IS NULL OR target_member."id" IS NULL
			OR source_member."org_id" <> ma."org_id" OR target_member."org_id" <> ma."org_id"
	) OR EXISTS (
		SELECT 1
		FROM "match_feedback" mf
		LEFT JOIN "matches" ma ON ma."id" = mf."match_id"
		LEFT JOIN "profiles" p ON p."id" = mf."source_profile_id"
		LEFT JOIN "memberships" m ON m."id" = p."membership_id"
		WHERE ma."id" IS NULL OR m."id" IS NULL
			OR ma."org_id" <> mf."org_id" OR m."org_id" <> mf."org_id"
	) THEN
		RAISE EXCEPTION '0009 preflight: orphan or cross-organization match data';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "intro_requests" ir
		LEFT JOIN "memberships" requester ON requester."id" = ir."requester_membership_id"
		LEFT JOIN "memberships" receiver ON receiver."id" = ir."receiver_membership_id"
		WHERE requester."id" IS NULL OR receiver."id" IS NULL
			OR requester."org_id" <> ir."org_id" OR receiver."org_id" <> ir."org_id"
	) THEN
		RAISE EXCEPTION '0009 preflight: orphan or cross-organization intro request';
	END IF;

	IF EXISTS (
		SELECT 1 FROM "intro_requests"
		WHERE "status" = 'pending'
		GROUP BY
			"org_id",
			LEAST("requester_membership_id", "receiver_membership_id"),
			GREATEST("requester_membership_id", "receiver_membership_id")
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION '0009 preflight: duplicate undirected pending intro pair';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "notifications" n
		LEFT JOIN "memberships" m ON m."id" = n."membership_id"
		WHERE m."id" IS NULL OR m."org_id" <> n."org_id"
	) OR EXISTS (
		SELECT 1
		FROM "reports" r
		LEFT JOIN "memberships" m ON m."id" = r."reporter_membership_id"
		WHERE m."id" IS NULL OR m."org_id" <> r."org_id"
	) OR EXISTS (
		SELECT 1
		FROM "admin_actions" aa
		LEFT JOIN "memberships" m ON m."id" = aa."admin_membership_id"
		WHERE m."id" IS NULL OR m."org_id" <> aa."org_id"
	) OR EXISTS (
		SELECT 1
		FROM "analytics_events" ae
		LEFT JOIN "memberships" m ON m."id" = ae."membership_id"
		WHERE ae."membership_id" IS NOT NULL AND (m."id" IS NULL OR m."org_id" <> ae."org_id")
	) THEN
		RAISE EXCEPTION '0009 preflight: orphan or cross-organization operational data';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "cohorts" c
		JOIN "organizations" o ON c."id" = 'spc_main_' || md5(o."id")
	) THEN
		RAISE EXCEPTION '0009 preflight: deterministic Main space id collides with a cohort id';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM (
			SELECT c."org_id",
				COALESCE(NULLIF(trim(BOTH '-' FROM regexp_replace(lower(c."name"), '[^a-z0-9]+', '-', 'g')), ''), 'event')
					|| '-' || substr(md5(c."id"), 1, 12) AS event_slug
			FROM "cohorts" c
		) slugs
		GROUP BY "org_id", event_slug
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION '0009 preflight: deterministic Event space slug collision';
	END IF;
END $$;
--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('invited', 'connected', 'suspended', 'deprovisioned');
--> statement-breakpoint
CREATE TYPE "public"."space_access_status" AS ENUM('active', 'waitlist', 'rejected', 'suspended', 'removed');
--> statement-breakpoint
CREATE TYPE "public"."space_join_source" AS ENUM('invite', 'import', 'promotion', 'direct', 'migration');
--> statement-breakpoint
CREATE TYPE "public"."space_kind" AS ENUM('main', 'event');
--> statement-breakpoint
CREATE TYPE "public"."space_lifecycle" AS ENUM('draft', 'upcoming', 'active', 'ended', 'archived');
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "space_kind" NOT NULL,
	"lifecycle" "space_lifecycle" DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"event_label" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"matching_enabled" boolean DEFAULT true NOT NULL,
	"created_by_membership_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spaces_main_lifecycle_check" CHECK ("spaces"."kind" <> 'main' OR "spaces"."lifecycle" = 'active'),
	CONSTRAINT "spaces_event_dates_check" CHECK ("spaces"."ends_at" IS NULL OR "spaces"."starts_at" IS NULL OR "spaces"."ends_at" >= "spaces"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "space_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"space_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"access_status" "space_access_status" DEFAULT 'active' NOT NULL,
	"joined_via" "space_join_source" DEFAULT 'direct' NOT NULL,
	"invited_by_membership_id" text,
	"source_space_id" text,
	"decision_note" text,
	"granted_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_memberships_removed_at_check" CHECK ("space_memberships"."access_status" = 'removed' OR "space_memberships"."removed_at" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "space_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"space_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"current_goal" text DEFAULT '' NOT NULL,
	"looking_for" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"offers" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"matching_opt_in" boolean DEFAULT true NOT NULL,
	"intent_complete" boolean DEFAULT false NOT NULL,
	"seeking_text" text DEFAULT '' NOT NULL,
	"offering_text" text DEFAULT '' NOT NULL,
	"seeking_embedding" vector(1024),
	"offering_embedding" vector(1024),
	"embedding_model" text,
	"embedding_source_hash" text,
	"embedding_status" text DEFAULT 'pending' NOT NULL,
	"embedding_error" text,
	"embedding_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "space_intents_embedding_status_check" CHECK ("space_intents"."embedding_status" IN ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "admin_actions" ADD COLUMN "space_id" text;
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "space_id" text;
--> statement-breakpoint
ALTER TABLE "follows" ADD COLUMN "space_id" text;
--> statement-breakpoint
ALTER TABLE "intro_requests" ADD COLUMN "space_id" text;
--> statement-breakpoint
ALTER TABLE "match_feedback" ADD COLUMN "space_id" text;
--> statement-breakpoint
ALTER TABLE "match_runs" ADD COLUMN "space_id" text;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "space_id" text;
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "account_status" "account_status" DEFAULT 'invited' NOT NULL;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "space_id" text;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "space_id" text;
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "space_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_id_org_idx" ON "memberships" USING btree ("id", "org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_org_slug_idx" ON "spaces" USING btree ("org_id", "slug");
--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_id_org_idx" ON "spaces" USING btree ("id", "org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "spaces_one_main_per_org_idx" ON "spaces" USING btree ("org_id") WHERE "spaces"."kind" = 'main';
--> statement-breakpoint
CREATE INDEX "spaces_org_lifecycle_idx" ON "spaces" USING btree ("org_id", "lifecycle");
--> statement-breakpoint
CREATE UNIQUE INDEX "space_memberships_space_membership_idx" ON "space_memberships" USING btree ("space_id", "membership_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "space_intents_space_membership_idx" ON "space_intents" USING btree ("space_id", "membership_id");
--> statement-breakpoint

-- Account connectivity is independent from access to Main/Event spaces.
UPDATE "memberships"
SET "account_status" = (
	CASE
		WHEN "status" = 'suspended' THEN 'suspended'
		WHEN "clerk_membership_id" IS NOT NULL OR "clerk_invitation_status" = 'accepted' THEN 'connected'
		ELSE 'invited'
	END
)::"account_status";
--> statement-breakpoint

-- Every organization gets exactly one deterministic Main space. Legacy cohort ids are
-- preserved as Event space ids so old URLs and audit references can be resolved.
INSERT INTO "spaces" (
	"id", "org_id", "slug", "kind", "lifecycle", "name", "description",
	"event_label", "matching_enabled", "created_at", "updated_at"
)
SELECT
	'spc_main_' || md5(o."id"), o."id", 'main', 'main', 'active',
	'Main Community', o."description", '', true, o."created_at", o."created_at"
FROM "organizations" o;
--> statement-breakpoint
INSERT INTO "spaces" (
	"id", "org_id", "slug", "kind", "lifecycle", "name", "description",
	"event_label", "archived_at", "matching_enabled", "created_by_membership_id",
	"created_at", "updated_at"
)
SELECT
	c."id",
	c."org_id",
	COALESCE(NULLIF(trim(BOTH '-' FROM regexp_replace(lower(c."name"), '[^a-z0-9]+', '-', 'g')), ''), 'event')
		|| '-' || substr(md5(c."id"), 1, 12),
	'event',
	CASE WHEN c."status" = 'archived' THEN 'archived' ELSE 'active' END::"space_lifecycle",
	c."name",
	c."description",
	c."event_label",
	CASE WHEN c."status" = 'archived' THEN c."updated_at" ELSE NULL END,
	true,
	c."created_by_membership_id",
	c."created_at",
	c."updated_at"
FROM "cohorts" c;
--> statement-breakpoint

-- A legacy cohort membership is an Event entitlement. Legacy review status never grants
-- Main access; approved members (and legacy members with no cohort) are mapped separately.
INSERT INTO "space_memberships" (
	"id", "org_id", "space_id", "membership_id", "access_status", "joined_via",
	"invited_by_membership_id", "decision_note", "granted_at", "created_at", "updated_at"
)
SELECT
	'spm_' || md5('event:' || cm."cohort_id" || ':' || cm."membership_id"),
	cm."org_id",
	cm."cohort_id",
	cm."membership_id",
	'active',
	'migration',
	inviter."id",
	m."approval_note",
	cm."invited_at",
	cm."created_at",
	cm."updated_at"
FROM "cohort_members" cm
JOIN "memberships" m ON m."id" = cm."membership_id"
LEFT JOIN "memberships" inviter
	ON inviter."org_id" = m."org_id" AND inviter."user_id" = m."invited_by_user_id";
--> statement-breakpoint
INSERT INTO "space_memberships" (
	"id", "org_id", "space_id", "membership_id", "access_status", "joined_via",
	"invited_by_membership_id", "decision_note", "granted_at", "created_at", "updated_at"
)
SELECT
	'spm_' || md5('main:' || s."id" || ':' || m."id"),
	m."org_id",
	s."id",
	m."id",
	CASE
		WHEN m."status" = 'approved' THEN 'active'
		WHEN m."status" = 'rejected' THEN 'rejected'
		WHEN m."status" = 'suspended' THEN 'suspended'
		ELSE 'waitlist'
	END::"space_access_status",
	'migration',
	inviter."id",
	m."approval_note",
	CASE WHEN m."status" = 'approved' THEN COALESCE(m."approved_at", m."created_at") ELSE NULL END,
	m."created_at",
	m."updated_at"
FROM "memberships" m
JOIN "spaces" s ON s."org_id" = m."org_id" AND s."kind" = 'main'
LEFT JOIN "memberships" inviter
	ON inviter."org_id" = m."org_id" AND inviter."user_id" = m."invited_by_user_id"
WHERE m."status" IN ('approved', 'rejected', 'suspended')
	OR NOT EXISTS (
		SELECT 1 FROM "cohort_members" cm WHERE cm."membership_id" = m."id"
	);
--> statement-breakpoint

-- Seed a separate intent for every accessible context. Embeddings are deliberately reset:
-- existing profile vectors may include Main-only context and must be regenerated per space.
INSERT INTO "space_intents" (
	"id", "org_id", "space_id", "membership_id", "current_goal", "looking_for",
	"offers", "matching_opt_in", "intent_complete", "seeking_text", "offering_text",
	"embedding_status", "created_at", "updated_at"
)
SELECT
	'spi_' || md5(sm."space_id" || ':' || sm."membership_id"),
	sm."org_id",
	sm."space_id",
	sm."membership_id",
	COALESCE(NULLIF(p."current_progress", ''), p."ideal_match_description", ''),
	COALESCE(p."looking_for_types", ARRAY[]::text[]),
	COALESCE(p."can_contribute", ARRAY[]::text[]),
	COALESCE(p."profile_visible_in_matching", true),
	COALESCE(p."onboarding_complete", false),
	'',
	'',
	'pending',
	sm."created_at",
	sm."updated_at"
FROM "space_memberships" sm
LEFT JOIN "profiles" p ON p."membership_id" = sm."membership_id";
--> statement-breakpoint

-- Existing organization-wide resources have no reliable cohort provenance. Assigning them
-- to Main is deterministic and, critically, does not expose them to Event-only members.
UPDATE "posts" r SET "space_id" = s."id", "visibility" = 'space_only' FROM "spaces" s
WHERE s."org_id" = r."org_id" AND s."kind" = 'main';
--> statement-breakpoint
UPDATE "follows" r SET "space_id" = s."id" FROM "spaces" s
WHERE s."org_id" = r."org_id" AND s."kind" = 'main';
--> statement-breakpoint
UPDATE "match_runs" r SET "space_id" = s."id" FROM "spaces" s
WHERE s."org_id" = r."org_id" AND s."kind" = 'main';
--> statement-breakpoint
UPDATE "matches" r SET "space_id" = s."id" FROM "spaces" s
WHERE s."org_id" = r."org_id" AND s."kind" = 'main';
--> statement-breakpoint
UPDATE "match_feedback" r SET "space_id" = s."id" FROM "spaces" s
WHERE s."org_id" = r."org_id" AND s."kind" = 'main';
--> statement-breakpoint
UPDATE "intro_requests" r SET "space_id" = s."id" FROM "spaces" s
WHERE s."org_id" = r."org_id" AND s."kind" = 'main';
--> statement-breakpoint
UPDATE "notifications" r SET "space_id" = s."id" FROM "spaces" s
WHERE s."org_id" = r."org_id" AND s."kind" = 'main'
	AND r."type" NOT IN ('membership_approved', 'admin_note');
--> statement-breakpoint

-- Validate the deterministic backfill before adding constraints or switching reads. Any
-- mismatch aborts the migration; production data is never merged or repaired implicitly.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "organizations" o
		LEFT JOIN "spaces" s ON s."org_id" = o."id" AND s."kind" = 'main'
		GROUP BY o."id"
		HAVING count(s."id") <> 1
	) THEN
		RAISE EXCEPTION '0009 postflight: every organization must have exactly one Main space';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "cohorts" c
		LEFT JOIN "spaces" s
			ON s."id" = c."id" AND s."org_id" = c."org_id" AND s."kind" = 'event'
		WHERE s."id" IS NULL
	) THEN
		RAISE EXCEPTION '0009 postflight: cohort was not mapped to its deterministic Event space';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "cohort_members" cm
		LEFT JOIN "space_memberships" sm
			ON sm."space_id" = cm."cohort_id"
			AND sm."membership_id" = cm."membership_id"
			AND sm."org_id" = cm."org_id"
		WHERE sm."id" IS NULL OR sm."access_status" <> 'active'
	) THEN
		RAISE EXCEPTION '0009 postflight: cohort membership was not mapped to active Event access';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "memberships" m
		JOIN "spaces" s ON s."org_id" = m."org_id" AND s."kind" = 'main'
		LEFT JOIN "space_memberships" sm
			ON sm."space_id" = s."id" AND sm."membership_id" = m."id" AND sm."org_id" = m."org_id"
		WHERE (
			m."status" IN ('approved', 'rejected', 'suspended')
			OR NOT EXISTS (
				SELECT 1 FROM "cohort_members" cm WHERE cm."membership_id" = m."id"
			)
		) AND sm."id" IS NULL
	) THEN
		RAISE EXCEPTION '0009 postflight: membership was not mapped to its required Main access record';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "space_memberships" sm
		LEFT JOIN "space_intents" si
			ON si."space_id" = sm."space_id"
			AND si."membership_id" = sm."membership_id"
			AND si."org_id" = sm."org_id"
		WHERE si."id" IS NULL
	) THEN
		RAISE EXCEPTION '0009 postflight: Space membership is missing its isolated intent';
	END IF;

	IF EXISTS (SELECT 1 FROM "posts" WHERE "space_id" IS NULL)
		OR EXISTS (SELECT 1 FROM "follows" WHERE "space_id" IS NULL)
		OR EXISTS (SELECT 1 FROM "match_runs" WHERE "space_id" IS NULL)
		OR EXISTS (SELECT 1 FROM "matches" WHERE "space_id" IS NULL)
		OR EXISTS (SELECT 1 FROM "match_feedback" WHERE "space_id" IS NULL)
		OR EXISTS (SELECT 1 FROM "intro_requests" WHERE "space_id" IS NULL)
		OR EXISTS (
			SELECT 1 FROM "notifications"
			WHERE "space_id" IS NULL AND "type" NOT IN ('membership_approved', 'admin_note')
		)
	THEN
		RAISE EXCEPTION '0009 postflight: Space-scoped resource has null space_id';
	END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_org_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_creator_fk" FOREIGN KEY ("created_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "space_memberships" ADD CONSTRAINT "space_memberships_space_org_fk" FOREIGN KEY ("space_id", "org_id") REFERENCES "public"."spaces"("id", "org_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "space_memberships" ADD CONSTRAINT "space_memberships_membership_org_fk" FOREIGN KEY ("membership_id", "org_id") REFERENCES "public"."memberships"("id", "org_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "space_memberships" ADD CONSTRAINT "space_memberships_inviter_fk" FOREIGN KEY ("invited_by_membership_id") REFERENCES "public"."memberships"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "space_memberships" ADD CONSTRAINT "space_memberships_source_space_fk" FOREIGN KEY ("source_space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "space_intents" ADD CONSTRAINT "space_intents_space_membership_fk" FOREIGN KEY ("space_id", "membership_id") REFERENCES "public"."space_memberships"("space_id", "membership_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "space_intents" ADD CONSTRAINT "space_intents_org_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_space_org_fk" FOREIGN KEY ("space_id", "org_id") REFERENCES "public"."spaces"("id", "org_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_space_org_fk" FOREIGN KEY ("space_id", "org_id") REFERENCES "public"."spaces"("id", "org_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_space_org_fk" FOREIGN KEY ("space_id", "org_id") REFERENCES "public"."spaces"("id", "org_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "intro_requests" ADD CONSTRAINT "intro_requests_space_org_fk" FOREIGN KEY ("space_id", "org_id") REFERENCES "public"."spaces"("id", "org_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "match_feedback" ADD CONSTRAINT "match_feedback_space_org_fk" FOREIGN KEY ("space_id", "org_id") REFERENCES "public"."spaces"("id", "org_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "match_runs" ADD CONSTRAINT "match_runs_space_org_fk" FOREIGN KEY ("space_id", "org_id") REFERENCES "public"."spaces"("id", "org_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_space_org_fk" FOREIGN KEY ("space_id", "org_id") REFERENCES "public"."spaces"("id", "org_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_space_org_fk" FOREIGN KEY ("space_id", "org_id") REFERENCES "public"."spaces"("id", "org_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_space_org_fk" FOREIGN KEY ("space_id", "org_id") REFERENCES "public"."spaces"("id", "org_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_space_org_fk" FOREIGN KEY ("space_id", "org_id") REFERENCES "public"."spaces"("id", "org_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "space_intents_space_matching_idx" ON "space_intents" USING btree ("space_id", "matching_opt_in", "intent_complete");
--> statement-breakpoint
CREATE INDEX "space_memberships_membership_access_idx" ON "space_memberships" USING btree ("membership_id", "access_status");
--> statement-breakpoint
CREATE INDEX "space_memberships_space_access_idx" ON "space_memberships" USING btree ("space_id", "access_status");
--> statement-breakpoint
DROP INDEX "follows_follower_followed_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "follows_space_follower_followed_idx" ON "follows" USING btree ("space_id", "follower_membership_id", "followed_membership_id");
--> statement-breakpoint
DROP INDEX "matches_source_target_type_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "matches_space_source_target_type_idx" ON "matches" USING btree ("space_id", "source_profile_id", "target_profile_id", "match_type");
--> statement-breakpoint
CREATE UNIQUE INDEX "intro_requests_space_pending_pair_idx" ON "intro_requests" USING btree (
	"space_id",
	LEAST("requester_membership_id", "receiver_membership_id"),
	GREATEST("requester_membership_id", "receiver_membership_id")
) WHERE "intro_requests"."space_id" IS NOT NULL AND "intro_requests"."status" = 'pending';
--> statement-breakpoint
CREATE INDEX "admin_actions_space_created_idx" ON "admin_actions" USING btree ("space_id", "created_at");
--> statement-breakpoint
CREATE INDEX "analytics_events_space_event_created_idx" ON "analytics_events" USING btree ("space_id", "event_name", "created_at");
--> statement-breakpoint
CREATE INDEX "intro_requests_space_created_idx" ON "intro_requests" USING btree ("space_id", "created_at");
--> statement-breakpoint
CREATE INDEX "match_runs_space_started_idx" ON "match_runs" USING btree ("space_id", "started_at");
--> statement-breakpoint
CREATE INDEX "notifications_membership_space_created_idx" ON "notifications" USING btree ("membership_id", "space_id", "created_at");
--> statement-breakpoint
CREATE INDEX "posts_space_created_idx" ON "posts" USING btree ("space_id", "created_at");
--> statement-breakpoint
CREATE INDEX "reports_space_status_idx" ON "reports" USING btree ("space_id", "status");

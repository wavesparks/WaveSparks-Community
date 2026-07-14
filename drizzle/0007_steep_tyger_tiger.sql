DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "memberships"
		GROUP BY "org_id", "user_id"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot enforce memberships_org_user_idx: duplicate (org_id, user_id) memberships exist. Resolve them explicitly before rerunning this migration.';
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_idx" ON "memberships" USING btree ("org_id","user_id");

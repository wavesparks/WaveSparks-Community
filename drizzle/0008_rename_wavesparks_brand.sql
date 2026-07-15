UPDATE "organizations"
SET
	"name" = 'Wavesparks',
	"slug" = 'wavesparks',
	"allowed_domains" = ARRAY(
		SELECT DISTINCT
			CASE
				WHEN "allowed_domain" = 'wavespark.co' THEN 'wavesparks.co'
				ELSE "allowed_domain"
			END
		FROM unnest("allowed_domains") AS "domains"("allowed_domain")
	)
WHERE "id" = 'org_wavespark';
--> statement-breakpoint
UPDATE "memberships"
SET
	"program_name" = replace("program_name", 'Wavespark', 'Wavesparks'),
	"approval_note" = CASE
		WHEN "approval_note" = 'Approved by WAVESPARK_ADMIN_EMAILS bootstrap.'
			THEN 'Approved by bootstrap admin configuration.'
		ELSE "approval_note"
	END,
	"updated_at" = now()
WHERE
	"org_id" = 'org_wavespark'
	AND (
		"program_name" LIKE '%Wavespark%'
		OR "approval_note" = 'Approved by WAVESPARK_ADMIN_EMAILS bootstrap.'
	);
--> statement-breakpoint
UPDATE "notifications"
SET
	"title" = replace("title", 'Wavespark', 'Wavesparks'),
	"body" = replace("body", 'Wavespark', 'Wavesparks'),
	"link" = CASE
		WHEN "link" = '/org/wavespark' THEN '/org/wavesparks'
		WHEN "link" LIKE '/org/wavespark/%'
			THEN '/org/wavesparks' || substr("link", length('/org/wavespark') + 1)
		ELSE "link"
	END
WHERE
	"org_id" = 'org_wavespark'
	AND (
		"title" LIKE '%Wavespark%'
		OR "body" LIKE '%Wavespark%'
		OR "link" = '/org/wavespark'
		OR "link" LIKE '/org/wavespark/%'
	);

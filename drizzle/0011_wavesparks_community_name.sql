UPDATE "spaces"
SET
	"name" = 'Wavesparks Community',
	"event_label" = 'Community',
	"updated_at" = now()
WHERE
	"kind" = 'main'
	AND (
		"name" <> 'Wavesparks Community'
		OR "event_label" <> 'Community'
	);
--> statement-breakpoint
UPDATE "spaces"
SET
	"description" = 'Wavesparks members can meet, share updates, and find useful connections here.',
	"updated_at" = now()
WHERE
	"kind" = 'main'
	AND "description" = 'A semi-private community where founders, mentors, and operators get surfaced through context, not noise.';
--> statement-breakpoint
UPDATE "organizations"
SET
	"description" = 'Wavesparks members can meet, share updates, and find useful connections here.',
	"membership_rules" = ARRAY[
		'Access to Wavesparks Community and each event is managed separately.',
		'People can only see content and profiles in places they have joined.',
		'Contact details are shared only after an introduction is accepted.'
	]::text[],
	"invite_settings" = 'Only people invited by an administrator can join. Community and event access are managed separately.'
WHERE
	"description" = 'A semi-private community where founders, mentors, and operators get surfaced through context, not noise.';
--> statement-breakpoint
UPDATE "memberships"
SET
	"program_name" = CASE
		WHEN "program_name" = 'Main Community' THEN 'Wavesparks Community'
		ELSE "program_name"
	END,
	"cohort_name_or_year" = CASE
		WHEN "cohort_name_or_year" = 'Main Community' THEN 'Wavesparks Community'
		ELSE "cohort_name_or_year"
	END,
	"updated_at" = now()
WHERE
	"program_name" = 'Main Community'
	OR "cohort_name_or_year" = 'Main Community';
--> statement-breakpoint
UPDATE "notifications"
SET
	"title" = replace("title", 'Main Community', 'Wavesparks Community'),
	"body" = replace("body", 'Main Community', 'Wavesparks Community')
WHERE
	"title" LIKE '%Main Community%'
	OR "body" LIKE '%Main Community%';
--> statement-breakpoint
UPDATE "match_type_configs"
SET
	"description" = CASE "slug"
		WHEN 'cofounder_match' THEN 'Meet someone interested in building a company together.'
		WHEN 'mentor_match' THEN 'Meet someone who can offer relevant advice and experience.'
		WHEN 'collaborator_match' THEN 'Meet someone to work with on a project or idea.'
		ELSE "description"
	END,
	"updated_at" = now()
WHERE
	("slug" = 'cofounder_match' AND "description" = 'A reciprocal founder relationship with complementary capability and commitment.')
	OR ("slug" = 'mentor_match' AND "description" = 'A founder need matched to relevant experience, guidance and availability.')
	OR ("slug" = 'collaborator_match' AND "description" = 'A reciprocal project or teammate relationship built around complementary contributions.');

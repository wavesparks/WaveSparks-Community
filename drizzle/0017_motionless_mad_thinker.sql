ALTER TABLE "matches" ALTER COLUMN "algorithm_version" SET DEFAULT 'hybrid-v4';--> statement-breakpoint
UPDATE "match_type_configs"
SET
	"weights_json" = CASE "slug"
		WHEN 'cofounder_match' THEN '{"semantic":25,"skills":20,"venture":15,"availability":15,"work_style":20,"location":5}'::jsonb
		WHEN 'mentor_match' THEN '{"semantic":35,"skills":30,"venture":20,"availability":10,"work_style":5,"location":0}'::jsonb
		WHEN 'collaborator_match' THEN '{"semantic":30,"skills":30,"venture":15,"availability":15,"work_style":5,"location":5}'::jsonb
		ELSE "weights_json"
	END,
	"version" = "version" + 1,
	"updated_at" = now()
WHERE
	("slug" = 'cofounder_match' AND "weights_json" = '{"semantic":30,"skills":20,"venture":10,"availability":15,"work_style":15,"location":10}'::jsonb)
	OR ("slug" = 'mentor_match' AND "weights_json" = '{"semantic":35,"skills":20,"venture":15,"availability":10,"work_style":5,"location":15}'::jsonb)
	OR ("slug" = 'collaborator_match' AND "weights_json" = '{"semantic":35,"skills":25,"venture":15,"availability":15,"work_style":5,"location":5}'::jsonb);--> statement-breakpoint
DELETE FROM "matches"
WHERE "score" NOT BETWEEN 1 AND 100;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_score_range_check" CHECK ("matches"."score" BETWEEN 1 AND 100);

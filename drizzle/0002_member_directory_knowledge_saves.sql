ALTER TYPE "public"."intro_source_type" ADD VALUE 'profile' BEFORE 'admin_manual';--> statement-breakpoint
CREATE TABLE "post_saves" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"post_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "post_saves_membership_post_idx" ON "post_saves" USING btree ("membership_id","post_id");
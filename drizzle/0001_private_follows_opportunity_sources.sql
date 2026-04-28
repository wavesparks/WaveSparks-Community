CREATE TYPE "public"."opportunity_source" AS ENUM('member', 'mentor', 'official');--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "opportunity_source" "opportunity_source";--> statement-breakpoint
CREATE TABLE "follows" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"follower_membership_id" text NOT NULL,
	"followed_membership_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "follows_follower_followed_idx" ON "follows" USING btree ("follower_membership_id","followed_membership_id");

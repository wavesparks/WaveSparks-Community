CREATE TABLE "clerk_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "clerk_membership_id" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "clerk_role" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "clerk_org_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "clerk_user_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_clerk_membership_id_idx" ON "memberships" USING btree ("clerk_membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_clerk_org_id_idx" ON "organizations" USING btree ("clerk_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_user_id_idx" ON "users" USING btree ("clerk_user_id");
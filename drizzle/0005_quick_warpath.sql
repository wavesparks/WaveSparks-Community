ALTER TABLE "memberships" ADD COLUMN "clerk_invitation_id" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "clerk_invitation_status" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "clerk_invitation_error" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "clerk_invitation_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_clerk_invitation_id_idx" ON "memberships" USING btree ("clerk_invitation_id");
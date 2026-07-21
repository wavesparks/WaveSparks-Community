CREATE TYPE "public"."membership_invitation_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');--> statement-breakpoint
CREATE TABLE "membership_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"membership_id" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "membership_invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_membership_id" text NOT NULL,
	"accepted_by_clerk_user_id" text,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"delivery_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_invitations_normalized_email_check" CHECK ("membership_invitations"."email" = lower(btrim("membership_invitations"."email"))),
	CONSTRAINT "membership_invitations_lifecycle_check" CHECK (("membership_invitations"."status" <> 'accepted' OR ("membership_invitations"."accepted_at" IS NOT NULL AND "membership_invitations"."accepted_by_clerk_user_id" IS NOT NULL)) AND ("membership_invitations"."status" <> 'revoked' OR "membership_invitations"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_membership_org_fk" FOREIGN KEY ("membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_creator_org_fk" FOREIGN KEY ("created_by_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_invitations_token_hash_idx" ON "membership_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_invitations_pending_membership_idx" ON "membership_invitations" USING btree ("membership_id") WHERE "membership_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "membership_invitations_org_status_idx" ON "membership_invitations" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "membership_invitations_membership_created_idx" ON "membership_invitations" USING btree ("membership_id","created_at");

ALTER TABLE "space_intents" DROP CONSTRAINT "space_intents_space_membership_fk";
--> statement-breakpoint
ALTER TABLE "space_memberships" DROP CONSTRAINT "space_memberships_inviter_fk";
--> statement-breakpoint
ALTER TABLE "space_memberships" DROP CONSTRAINT "space_memberships_source_space_fk";
--> statement-breakpoint
ALTER TABLE "spaces" DROP CONSTRAINT "spaces_creator_fk";
--> statement-breakpoint
DROP INDEX "intro_requests_space_pending_pair_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "posts_id_org_idx" ON "posts" USING btree ("id","org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "space_memberships_space_membership_org_idx" ON "space_memberships" USING btree ("space_id","membership_id","org_id");
--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_org_fk" FOREIGN KEY ("admin_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_membership_org_fk" FOREIGN KEY ("membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_org_fk" FOREIGN KEY ("follower_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followed_org_fk" FOREIGN KEY ("followed_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intro_requests" ADD CONSTRAINT "intro_requests_requester_org_fk" FOREIGN KEY ("requester_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intro_requests" ADD CONSTRAINT "intro_requests_receiver_org_fk" FOREIGN KEY ("receiver_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_membership_org_fk" FOREIGN KEY ("membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_membership_org_fk" FOREIGN KEY ("membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_post_org_fk" FOREIGN KEY ("post_id","org_id") REFERENCES "public"."posts"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_org_fk" FOREIGN KEY ("author_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_org_fk" FOREIGN KEY ("reporter_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_intents" ADD CONSTRAINT "space_intents_space_membership_fk" FOREIGN KEY ("space_id","membership_id","org_id") REFERENCES "public"."space_memberships"("space_id","membership_id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_memberships" ADD CONSTRAINT "space_memberships_inviter_fk" FOREIGN KEY ("invited_by_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_memberships" ADD CONSTRAINT "space_memberships_source_space_fk" FOREIGN KEY ("source_space_id","org_id") REFERENCES "public"."spaces"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_creator_fk" FOREIGN KEY ("created_by_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "intro_requests_org_pending_pair_idx" ON "intro_requests" USING btree ("org_id",least("requester_membership_id", "receiver_membership_id"),greatest("requester_membership_id", "receiver_membership_id")) WHERE "intro_requests"."status" = 'pending';

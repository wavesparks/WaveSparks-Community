CREATE TYPE "public"."post_attachment_moderation_status" AS ENUM('visible', 'removed');--> statement-breakpoint
CREATE TYPE "public"."post_image_upload_status" AS ENUM('staged', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."post_link_preview_fetch_status" AS ENUM('staged', 'fetching', 'ready', 'failed');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'post_mentioned';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'comment_mentioned';--> statement-breakpoint
CREATE TABLE "comment_mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"space_id" text NOT NULL,
	"post_id" text NOT NULL,
	"comment_id" text NOT NULL,
	"mentioned_membership_id" text NOT NULL,
	"label" text NOT NULL,
	"start" integer NOT NULL,
	"end" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_mentions_range_check" CHECK ("comment_mentions"."start" >= 0 AND "comment_mentions"."end" > "comment_mentions"."start"),
	CONSTRAINT "comment_mentions_label_check" CHECK (char_length("comment_mentions"."label") BETWEEN 1 AND 300)
);
--> statement-breakpoint
CREATE TABLE "post_images" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"space_id" text NOT NULL,
	"uploader_membership_id" text NOT NULL,
	"post_id" text,
	"blob_pathname" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"alt" text,
	"position" integer DEFAULT 0 NOT NULL,
	"upload_status" "post_image_upload_status" DEFAULT 'staged' NOT NULL,
	"upload_error" text,
	"moderation_status" "post_attachment_moderation_status" DEFAULT 'visible' NOT NULL,
	"moderated_by_membership_id" text,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_images_size_check" CHECK ("post_images"."size_bytes" > 0 AND "post_images"."size_bytes" <= 5242880),
	CONSTRAINT "post_images_dimensions_check" CHECK (("post_images"."width" IS NULL AND "post_images"."height" IS NULL) OR ("post_images"."width" > 0 AND "post_images"."height" > 0 AND ("post_images"."width")::bigint * ("post_images"."height")::bigint <= 40000000)),
	CONSTRAINT "post_images_ready_dimensions_check" CHECK ("post_images"."upload_status" <> 'ready' OR ("post_images"."width" IS NOT NULL AND "post_images"."height" IS NOT NULL)),
	CONSTRAINT "post_images_claimed_ready_check" CHECK ("post_images"."post_id" IS NULL OR "post_images"."upload_status" = 'ready'),
	CONSTRAINT "post_images_position_check" CHECK ("post_images"."position" BETWEEN 0 AND 3),
	CONSTRAINT "post_images_alt_length_check" CHECK ("post_images"."alt" IS NULL OR char_length("post_images"."alt") <= 300)
);
--> statement-breakpoint
CREATE TABLE "post_link_previews" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"space_id" text NOT NULL,
	"uploader_membership_id" text NOT NULL,
	"post_id" text,
	"original_url" text NOT NULL,
	"title" text,
	"description" text,
	"site_name" text,
	"thumbnail_blob_pathname" text,
	"thumbnail_content_type" text,
	"thumbnail_size_bytes" integer,
	"thumbnail_width" integer,
	"thumbnail_height" integer,
	"fetch_status" "post_link_preview_fetch_status" DEFAULT 'staged' NOT NULL,
	"fetch_error" text,
	"moderation_status" "post_attachment_moderation_status" DEFAULT 'visible' NOT NULL,
	"moderated_by_membership_id" text,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_link_previews_original_url_check" CHECK ("post_link_previews"."original_url" ~* '^https?://' AND char_length("post_link_previews"."original_url") <= 2048),
	CONSTRAINT "post_link_previews_text_length_check" CHECK (("post_link_previews"."title" IS NULL OR char_length("post_link_previews"."title") <= 300) AND ("post_link_previews"."description" IS NULL OR char_length("post_link_previews"."description") <= 1000) AND ("post_link_previews"."site_name" IS NULL OR char_length("post_link_previews"."site_name") <= 200)),
	CONSTRAINT "post_link_previews_thumbnail_metadata_check" CHECK (("post_link_previews"."thumbnail_blob_pathname" IS NULL AND "post_link_previews"."thumbnail_content_type" IS NULL AND "post_link_previews"."thumbnail_size_bytes" IS NULL AND "post_link_previews"."thumbnail_width" IS NULL AND "post_link_previews"."thumbnail_height" IS NULL) OR ("post_link_previews"."thumbnail_blob_pathname" IS NOT NULL AND "post_link_previews"."thumbnail_content_type" IS NOT NULL AND "post_link_previews"."thumbnail_size_bytes" > 0 AND "post_link_previews"."thumbnail_size_bytes" <= 2097152 AND "post_link_previews"."thumbnail_width" > 0 AND "post_link_previews"."thumbnail_height" > 0))
);
--> statement-breakpoint
CREATE TABLE "post_mentions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"space_id" text NOT NULL,
	"post_id" text NOT NULL,
	"mentioned_membership_id" text NOT NULL,
	"label" text NOT NULL,
	"start" integer NOT NULL,
	"end" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_mentions_range_check" CHECK ("post_mentions"."start" >= 0 AND "post_mentions"."end" > "post_mentions"."start"),
	CONSTRAINT "post_mentions_label_check" CHECK (char_length("post_mentions"."label") BETWEEN 1 AND 300)
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "source_post_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "source_comment_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "comments_id_post_idx" ON "comments" USING btree ("id","post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_id_org_space_idx" ON "posts" USING btree ("id","org_id","space_id");--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_comment_post_fk" FOREIGN KEY ("comment_id","post_id") REFERENCES "public"."comments"("id","post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_post_org_space_fk" FOREIGN KEY ("post_id","org_id","space_id") REFERENCES "public"."posts"("id","org_id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_mentions" ADD CONSTRAINT "comment_mentions_mentioned_space_membership_fk" FOREIGN KEY ("space_id","mentioned_membership_id","org_id") REFERENCES "public"."space_memberships"("space_id","membership_id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_space_org_fk" FOREIGN KEY ("space_id","org_id") REFERENCES "public"."spaces"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_post_org_space_fk" FOREIGN KEY ("post_id","org_id","space_id") REFERENCES "public"."posts"("id","org_id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_uploader_space_membership_fk" FOREIGN KEY ("space_id","uploader_membership_id","org_id") REFERENCES "public"."space_memberships"("space_id","membership_id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_moderator_org_fk" FOREIGN KEY ("moderated_by_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_link_previews" ADD CONSTRAINT "post_link_previews_space_org_fk" FOREIGN KEY ("space_id","org_id") REFERENCES "public"."spaces"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_link_previews" ADD CONSTRAINT "post_link_previews_post_org_space_fk" FOREIGN KEY ("post_id","org_id","space_id") REFERENCES "public"."posts"("id","org_id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_link_previews" ADD CONSTRAINT "post_link_previews_uploader_space_membership_fk" FOREIGN KEY ("space_id","uploader_membership_id","org_id") REFERENCES "public"."space_memberships"("space_id","membership_id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_link_previews" ADD CONSTRAINT "post_link_previews_moderator_org_fk" FOREIGN KEY ("moderated_by_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_post_org_space_fk" FOREIGN KEY ("post_id","org_id","space_id") REFERENCES "public"."posts"("id","org_id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_mentioned_space_membership_fk" FOREIGN KEY ("space_id","mentioned_membership_id","org_id") REFERENCES "public"."space_memberships"("space_id","membership_id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comment_mentions_comment_start_end_idx" ON "comment_mentions" USING btree ("comment_id","start","end");--> statement-breakpoint
CREATE INDEX "comment_mentions_mentioned_membership_idx" ON "comment_mentions" USING btree ("mentioned_membership_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "post_images_blob_pathname_idx" ON "post_images" USING btree ("blob_pathname");--> statement-breakpoint
CREATE INDEX "post_images_post_position_idx" ON "post_images" USING btree ("post_id","position");--> statement-breakpoint
CREATE INDEX "post_images_staged_cleanup_idx" ON "post_images" USING btree ("post_id","upload_status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "post_link_previews_post_idx" ON "post_link_previews" USING btree ("post_id") WHERE "post_link_previews"."post_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "post_link_previews_staged_cleanup_idx" ON "post_link_previews" USING btree ("post_id","fetch_status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "post_link_previews_thumbnail_blob_pathname_idx" ON "post_link_previews" USING btree ("thumbnail_blob_pathname") WHERE "post_link_previews"."thumbnail_blob_pathname" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "post_mentions_post_start_end_idx" ON "post_mentions" USING btree ("post_id","start","end");--> statement-breakpoint
CREATE INDEX "post_mentions_mentioned_membership_idx" ON "post_mentions" USING btree ("mentioned_membership_id","created_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_post_org_space_fk" FOREIGN KEY ("source_post_id","org_id","space_id") REFERENCES "public"."posts"("id","org_id","space_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_source_comment_post_fk" FOREIGN KEY ("source_comment_id","source_post_id") REFERENCES "public"."comments"("id","post_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_post_mention_recipient_idx" ON "notifications" USING btree ("membership_id","type","source_post_id") WHERE "notifications"."source_post_id" IS NOT NULL AND "notifications"."source_comment_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_comment_mention_recipient_idx" ON "notifications" USING btree ("membership_id","type","source_comment_id") WHERE "notifications"."source_comment_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_mention_source_check" CHECK (("notifications"."type"::text = 'post_mentioned' AND "notifications"."space_id" IS NOT NULL AND "notifications"."source_post_id" IS NOT NULL AND "notifications"."source_comment_id" IS NULL) OR ("notifications"."type"::text = 'comment_mentioned' AND "notifications"."space_id" IS NOT NULL AND "notifications"."source_post_id" IS NOT NULL AND "notifications"."source_comment_id" IS NOT NULL) OR ("notifications"."type"::text NOT IN ('post_mentioned', 'comment_mentioned') AND "notifications"."source_post_id" IS NULL AND "notifications"."source_comment_id" IS NULL));

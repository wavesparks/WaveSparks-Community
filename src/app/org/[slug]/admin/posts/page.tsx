import Image from "next/image";

import {
  moderateCommentAction,
  moderatePostImageAction,
  moderatePostLinkPreviewAction,
  updatePostModerationAction,
} from "@/actions/admin";
import { adminSpaceName } from "@/components/admin/admin-community-copy";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import { postTypeLabel } from "@/lib/post-copy";
import { getAdminPostModerationDashboard } from "@/server/view-models";
import { listSpacesForOrg } from "@/server/store";

export default async function AdminPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireConnected: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const [dashboard, spaces] = await Promise.all([
    getAdminPostModerationDashboard(viewer.org.id),
    listSpacesForOrg(viewer.org.id),
  ]);
  const spaceNameById = new Map(spaces.map((space) => [space.id, adminSpaceName(space)]));
  const spaceLabel = (spaceId?: string) =>
    (spaceId && spaceNameById.get(spaceId)) || "Wavesparks Community";

  return (
    <AppShell currentPath={`/org/${slug}/admin/posts`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin · Posts"
          level={1}
          title="Posts and comments"
          description="Review recent conversations from Wavesparks Community and every Event."
        />
        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="space-y-6">
          <SectionHeading eyebrow="Community activity" title="Posts to review" />
          {dashboard.posts.map((post) => {
            return (
              <Card className="space-y-4" key={post.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-[var(--ink)]">
                      {post.title || "Untitled general update"}
                    </h3>
                    <p className="text-sm text-[var(--ink-soft)]">
                      {post.authorName} · {postTypeLabel(post.type)}
                    </p>
                    <Badge className="mt-2" variant={post.spaceId ? "muted" : "default"}>
                      {spaceLabel(post.spaceId)}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    {post.featured ? <Badge variant="accent">Featured</Badge> : null}
                    {post.hidden ? <Badge>Hidden</Badge> : null}
                  </div>
                </div>
                <p className="text-sm text-[var(--ink-soft)]">{post.body}</p>
                {post.images.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {post.images.map((image) => (
                      <div
                        className="space-y-2 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-2"
                        key={image.id}
                      >
                        <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-[var(--accent-soft)]">
                          <Image
                            alt={image.alt}
                            className="absolute inset-0 size-full object-cover"
                            height={image.height}
                            sizes="220px"
                            src={image.url}
                            unoptimized
                            width={image.width}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant={image.moderationStatus === "removed" ? "default" : "muted"}>
                            {image.moderationStatus}
                          </Badge>
                          <form
                            action={moderatePostImageAction.bind(
                              null,
                              slug,
                              image.id,
                              image.moderationStatus === "removed" ? "visible" : "removed",
                            )}
                          >
                            <SubmitButton pendingLabel="Updating" size="sm" variant="secondary">
                              {image.moderationStatus === "removed" ? "Restore" : "Remove"}
                            </SubmitButton>
                          </form>
                        </div>
                        {image.alt ? (
                          <p className="line-clamp-2 text-xs text-[var(--ink-soft)]">{image.alt}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {post.linkPreview ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">
                        Link preview · {post.linkPreview.domain}
                      </p>
                      <a
                        className="mt-1 block truncate text-sm font-semibold text-[var(--accent)] hover:underline"
                        href={post.linkPreview.url}
                        rel="noopener noreferrer nofollow ugc"
                        target="_blank"
                      >
                        {post.linkPreview.title || post.linkPreview.url}
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge>{post.linkPreview.moderationStatus}</Badge>
                      <form
                        action={moderatePostLinkPreviewAction.bind(
                          null,
                          slug,
                          post.linkPreview.id,
                          post.linkPreview.moderationStatus === "removed"
                            ? "visible"
                            : "removed",
                        )}
                      >
                        <SubmitButton pendingLabel="Updating" size="sm" variant="secondary">
                          {post.linkPreview.moderationStatus === "removed" ? "Restore" : "Remove"}
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                ) : null}
                {post.mentions.length ? (
                  <div className="flex flex-wrap gap-2">
                    {post.mentions.map((mention) => (
                      <Badge key={mention.id} variant="muted">
                        {mention.label} · {mention.memberName}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <form action={updatePostModerationAction.bind(null, slug, post.id)}>
                    <input name="hidden" type="hidden" value={String(!post.hidden)} />
                    <SubmitButton pendingLabel="Updating" variant="secondary">
                      {post.hidden ? "Unhide" : "Hide"}
                    </SubmitButton>
                  </form>
                  <form action={updatePostModerationAction.bind(null, slug, post.id)}>
                    <input name="featured" type="hidden" value={String(!post.featured)} />
                    <SubmitButton pendingLabel="Updating" variant="secondary">
                      {post.featured ? "Unfeature" : "Feature"}
                    </SubmitButton>
                  </form>
                  <form action={updatePostModerationAction.bind(null, slug, post.id)}>
                    <input
                      name="comments_locked"
                      type="hidden"
                      value={String(!post.commentsLocked)}
                    />
                    <SubmitButton pendingLabel="Updating" variant="secondary">
                      {post.commentsLocked ? "Unlock comments" : "Lock comments"}
                    </SubmitButton>
                  </form>
                  <form action={updatePostModerationAction.bind(null, slug, post.id)}>
                    <input
                      name="status"
                      type="hidden"
                      value={post.status === "archived" ? "active" : "archived"}
                    />
                    <SubmitButton pendingLabel="Updating" variant="secondary">
                      {post.status === "archived" ? "Reopen" : "Archive"}
                    </SubmitButton>
                  </form>
                </div>
              </Card>
            );
          })}
          {!dashboard.posts.length ? (
            <Card>
              <p className="text-sm font-semibold text-[var(--ink)]">No posts to review yet</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                New posts will appear here for moderation.
              </p>
            </Card>
          ) : null}
        </div>

        <Card className="space-y-4">
          <h3 className="text-xl font-semibold text-[var(--ink)]">Recent comments</h3>
          <div className="space-y-3">
            {dashboard.comments.map((comment) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4"
                key={comment.id}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--ink)]">{comment.authorName}</p>
                    <Badge>{comment.status}</Badge>
                    <Badge variant={comment.spaceId ? "muted" : "default"}>
                      {spaceLabel(comment.spaceId)}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--ink-soft)]">On {comment.postTitle}</p>
                  <p className="text-sm text-[var(--ink-soft)]">{comment.body}</p>
                </div>
                <form
                  action={moderateCommentAction.bind(
                    null,
                    slug,
                    comment.id,
                    comment.status === "removed" ? "visible" : "removed",
                  )}
                >
                  <SubmitButton pendingLabel="Updating" variant="secondary">
                    {comment.status === "removed" ? "Restore" : "Remove"}
                  </SubmitButton>
                </form>
              </div>
            ))}
            {!dashboard.comments.length ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                <p className="text-sm text-[var(--ink-soft)]">No comments to review yet.</p>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

import { moderateCommentAction, updatePostModerationAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import { getAdminPostModerationDashboard } from "@/server/view-models";

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
    requireApproved: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const dashboard = await getAdminPostModerationDashboard(viewer.org.id);

  return (
    <AppShell currentPath={`/org/${slug}/admin/posts`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin · Posts"
          level={1}
          title="Moderate feed content and comments"
          description="Feature important posts, hide low-trust content, and lock comment threads when necessary."
        />
        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="space-y-6">
          <SectionHeading eyebrow="Latest" title="Posts to review" />
          {dashboard.posts.map((post) => {
            return (
              <Card className="space-y-4" key={post.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-[var(--ink)]">{post.title}</h3>
                    <p className="text-sm text-[var(--ink-soft)]">
                      {post.authorName} · {post.type.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {post.featured ? <Badge variant="accent">featured</Badge> : null}
                    {post.hidden ? <Badge>hidden</Badge> : null}
                  </div>
                </div>
                <p className="text-sm text-[var(--ink-soft)]">{post.body}</p>
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
                New member posts will appear here for moderation.
              </p>
            </Card>
          ) : null}
        </div>

        <Card className="space-y-4">
          <h3 className="text-xl font-semibold text-[var(--ink)]">Latest comment moderation</h3>
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

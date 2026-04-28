import { moderateCommentAction, updatePostModerationAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { getMembershipById, getProfileByMembershipId, listAllCommentsForOrg, listPostsForOrg } from "@/server/store";

export default async function AdminPostsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireCompleteProfile: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const posts = await listPostsForOrg(viewer.org.id);
  const comments = await listAllCommentsForOrg(viewer.org.id);
  const postCards = await Promise.all(
    posts.map(async (post) => {
      const authorMembership = await getMembershipById(post.authorMembershipId);
      const authorProfile = authorMembership
        ? await getProfileByMembershipId(authorMembership.id)
        : undefined;

      return { authorProfile, post };
    }),
  );

  return (
    <AppShell currentPath={`/org/${slug}/admin/posts`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin · Posts"
          title="Moderate feed content and comments"
          description="Feature important posts, hide low-trust content, and lock comment threads when necessary."
        />

        <div className="space-y-6">
          {postCards.map(({ authorProfile, post }) => {
            return (
              <Card className="space-y-4" key={post.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-semibold text-slate-950">{post.title}</h3>
                    <p className="text-sm text-slate-600">
                      {authorProfile?.preferredName ?? "Unknown"} · {post.type.replaceAll("_", " ")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {post.featured ? <Badge variant="accent">featured</Badge> : null}
                    {post.hidden ? <Badge>hidden</Badge> : null}
                  </div>
                </div>
                <p className="text-sm text-slate-700">{post.body}</p>
                <div className="flex flex-wrap gap-3">
                  <form action={updatePostModerationAction.bind(null, slug, post.id)}>
                    <input name="hidden" type="hidden" value={String(!post.hidden)} />
                    <Button type="submit" variant="secondary">
                      {post.hidden ? "Unhide" : "Hide"}
                    </Button>
                  </form>
                  <form action={updatePostModerationAction.bind(null, slug, post.id)}>
                    <input name="featured" type="hidden" value={String(!post.featured)} />
                    <Button type="submit" variant="secondary">
                      {post.featured ? "Unfeature" : "Feature"}
                    </Button>
                  </form>
                  <form action={updatePostModerationAction.bind(null, slug, post.id)}>
                    <input name="comments_locked" type="hidden" value={String(!post.commentsLocked)} />
                    <Button type="submit" variant="secondary">
                      {post.commentsLocked ? "Unlock comments" : "Lock comments"}
                    </Button>
                  </form>
                  <form action={updatePostModerationAction.bind(null, slug, post.id)}>
                    <input name="status" type="hidden" value={post.status === "archived" ? "active" : "archived"} />
                    <Button type="submit" variant="secondary">
                      {post.status === "archived" ? "Reopen" : "Archive"}
                    </Button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>

        <Card className="space-y-4">
          <h3 className="text-2xl font-semibold text-slate-950">Comment moderation</h3>
          <div className="space-y-3">
            {comments.map((comment) => (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-slate-50 p-4" key={comment.id}>
                <p className="text-sm text-slate-700">{comment.body}</p>
                <form
                  action={moderateCommentAction.bind(
                    null,
                    slug,
                    comment.id,
                    comment.status === "removed" ? "visible" : "removed",
                  )}
                >
                  <Button type="submit" variant="secondary">
                    {comment.status === "removed" ? "Restore" : "Remove"}
                  </Button>
                </form>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

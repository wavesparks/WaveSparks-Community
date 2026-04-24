import { addCommentAction, requestIntroAction } from "@/actions/member";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { Textarea } from "@/components/ui/textarea";
import { getViewerContext } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import {
  getMembershipById,
  getPostById,
  getProfileByMembershipId,
  listCommentsForPost,
} from "@/server/store";
import { toLimitedProfileCard } from "@/server/view-models";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ slug: string; postId: string }>;
}) {
  const { slug, postId } = await params;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireCompleteProfile: true,
  });

  if (!viewer) {
    return null;
  }

  const post = getPostById(postId);
  if (!post) {
    return null;
  }

  const authorMembership = getMembershipById(post.authorMembershipId);
  const authorProfile = authorMembership
    ? getProfileByMembershipId(authorMembership.id)
    : undefined;
  const comments = listCommentsForPost(post.id);

  if (!authorMembership || !authorProfile) {
    return null;
  }

  const author = toLimitedProfileCard(authorProfile, authorMembership);

  return (
    <AppShell currentPath={`/org/${slug}/feed`} viewer={viewer}>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge>{post.type.replaceAll("_", " ")}</Badge>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                {formatDate(post.createdAt)}
              </span>
            </div>
            <SectionHeading title={post.title} description={post.body} />
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="muted">
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="rounded-[24px] bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">{author.displayName}</p>
              <p className="mt-1 text-sm text-slate-600">{author.headline}</p>
            </div>
          </Card>

          <Card className="space-y-4">
            <SectionHeading title="Comments" />
            <div className="space-y-4">
              {comments.map((comment) => {
                const membership = getMembershipById(comment.authorMembershipId);
                const profile = membership ? getProfileByMembershipId(membership.id) : undefined;
                const card = membership && profile ? toLimitedProfileCard(profile, membership) : null;
                return (
                  <div className="rounded-[24px] bg-slate-50 p-4" key={comment.id}>
                    <p className="font-semibold text-slate-900">{card?.displayName}</p>
                    <p className="mt-2 text-sm text-slate-700">{comment.body}</p>
                  </div>
                );
              })}
            </div>
            <form action={addCommentAction.bind(null, slug, viewer.membership.id, post.id)} className="space-y-3">
              <Textarea name="body" placeholder="Add a useful, contextual response." required />
              <Button type="submit">Add comment</Button>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-4">
            <SectionHeading title="Request intro from this thread" />
            <form
              action={requestIntroAction.bind(null, slug, viewer.membership.id)}
              className="space-y-3"
            >
              <input name="receiver_membership_id" type="hidden" value={author.membershipId} />
              <input name="source_type" type="hidden" value="post" />
              <input name="source_id" type="hidden" value={post.id} />
              <Input name="intro_purpose" defaultValue="general connection" />
              <Textarea
                name="note"
                defaultValue={`Your post on "${post.title}" feels directly relevant to what I’m working on. I’d love to connect if you’re open to it.`}
              />
              <Textarea
                name="suggested_first_message"
                defaultValue="Thanks for the post. I’d love to compare notes and see where there might be mutual fit."
              />
              <Button className="w-full" type="submit">
                Request intro
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

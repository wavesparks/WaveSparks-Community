import Link from "next/link";

import {
  followMembershipAction,
  unfollowMembershipAction,
} from "@/actions/member";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { FeedPostView } from "@/lib/domain";
import { formatDate } from "@/lib/utils";

const opportunitySourceLabels = {
  member: "User published",
  mentor: "Mentor published",
  official: "Official",
} as const;

export function PostCard({
  post,
  slug,
  viewerMembershipId,
}: {
  post: FeedPostView;
  slug: string;
  viewerMembershipId?: string;
}) {
  const canFollow = Boolean(viewerMembershipId && viewerMembershipId !== post.author.membershipId);
  const followAction = post.isFollowingAuthor
    ? unfollowMembershipAction.bind(null, slug, viewerMembershipId ?? "", post.author.membershipId)
    : followMembershipAction.bind(null, slug, viewerMembershipId ?? "", post.author.membershipId);

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={post.featured ? "accent" : "default"}>{post.type.replaceAll("_", " ")}</Badge>
        {post.opportunitySource ? (
          <Badge variant="muted">{opportunitySourceLabels[post.opportunitySource]}</Badge>
        ) : null}
        {post.recommendationReasons.map((reason, index) => (
          <Badge key={`recommendation-${reason}-${index}`} variant="accent">
            {reason}
          </Badge>
        ))}
        <span className="text-xs uppercase tracking-[0.25em] text-slate-400">
          {formatDate(post.createdAt)}
        </span>
      </div>
      <div className="space-y-3">
        <h3 className="text-2xl font-semibold text-slate-950">{post.title}</h3>
        <p className="text-sm text-slate-600">{post.body}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {post.tags.map((tag, index) => (
          <Badge key={`tag-${tag}-${index}`} variant="muted">
            {tag}
          </Badge>
        ))}
        {post.relatedRolesNeeded.map((role, index) => (
          <Badge key={`role-${role}-${index}`} variant="default">
            {role}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-slate-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={post.author.displayName} src={post.author.photo} />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">{post.author.displayName}</p>
            <p className="text-sm text-slate-600">{post.author.headline}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{post.commentCount} comments</span>
          {canFollow ? (
            <form action={followAction}>
              <Button size="sm" type="submit" variant={post.isFollowingAuthor ? "secondary" : "primary"}>
                {post.isFollowingAuthor ? "Following" : "Follow"}
              </Button>
            </form>
          ) : null}
          <Button asChild size="sm">
            <Link href={`/org/${slug}/posts/${post.id}`}>Open thread</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

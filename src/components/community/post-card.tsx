import Link from "next/link";

import {
  followMembershipAction,
  unfollowMembershipAction,
} from "@/actions/member";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FeedPostView } from "@/lib/domain";
import { formatDate } from "@/lib/utils";

const opportunitySourceLabels = {
  member: "User published",
  mentor: "Mentor published",
  official: "Official",
} as const;

export function PostCard({
  post,
  returnPath,
  slug,
  viewerMembershipId,
}: {
  post: FeedPostView;
  returnPath?: string;
  slug: string;
  viewerMembershipId?: string;
}) {
  const canFollow = Boolean(viewerMembershipId && viewerMembershipId !== post.author.membershipId);
  const followAction = post.isFollowingAuthor
    ? unfollowMembershipAction.bind(null, slug, viewerMembershipId ?? "", post.author.membershipId)
    : followMembershipAction.bind(null, slug, viewerMembershipId ?? "", post.author.membershipId);

  return (
    <Card className="group space-y-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)]/30 hover:shadow-[0_22px_55px_rgba(1,2,10,0.10)]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={post.featured ? "accent" : "default"}>
          {post.type.replaceAll("_", " ")}
        </Badge>
        {post.opportunitySource ? (
          <Badge variant="muted">{opportunitySourceLabels[post.opportunitySource]}</Badge>
        ) : null}
        {post.recommendationReasons.map((reason, index) => (
          <Badge key={`recommendation-${reason}-${index}`} variant="accent">
            {reason}
          </Badge>
        ))}
        <span className="ml-auto text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
          {formatDate(post.createdAt)}
        </span>
      </div>
      <div className="space-y-2">
        <h3 className="text-2xl font-semibold leading-tight text-[var(--ink)]">
          {post.title}
        </h3>
        <p className="text-sm leading-6 text-[var(--ink-soft)]">{post.body}</p>
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
      <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={post.author.displayName} src={post.author.photo} />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold text-[var(--ink)]">{post.author.displayName}</p>
            <p className="line-clamp-1 text-sm text-[var(--ink-soft)]">{post.author.headline}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="text-sm font-medium text-[var(--ink-soft)]">{post.commentCount} comments</span>
          {canFollow ? (
            <form action={followAction}>
              {returnPath ? <input name="return_to" type="hidden" value={returnPath} /> : null}
              <SubmitButton
                pendingLabel={post.isFollowingAuthor ? "Unfollowing" : "Following"}
                size="sm"
                variant={post.isFollowingAuthor ? "secondary" : "primary"}
              >
                {post.isFollowingAuthor ? "Following" : "Follow"}
              </SubmitButton>
            </form>
          ) : null}
          <Button asChild size="sm" variant="secondary">
            <Link href={`/org/${slug}/posts/${post.id}`}>Open thread</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

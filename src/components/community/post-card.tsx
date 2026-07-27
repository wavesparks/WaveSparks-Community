import Link from "next/link";
import { ArrowUpRight, Bookmark, MessageCircle } from "lucide-react";

import {
  followMembershipAction,
  followMembershipInSpaceAction,
  savePostAction,
  savePostInSpaceAction,
  unsavePostAction,
  unsavePostInSpaceAction,
  unfollowMembershipAction,
  unfollowMembershipInSpaceAction,
} from "@/actions/member";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NavPendingIndicator } from "@/components/layout/nav-pending-indicator";
import { LinkPreviewCard } from "@/components/community/link-preview-card";
import { PostImageGallery } from "@/components/community/post-image-gallery";
import { RichTextBody } from "@/components/community/rich-text-body";
import { LinkButton } from "@/components/ui/link-button";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FeedPostView } from "@/lib/domain";
import { postTypeLabel } from "@/lib/post-copy";
import { formatDate } from "@/lib/utils";

export function PostCard({
  peopleLabel = "members",
  post,
  returnPath,
  slug,
  spaceId,
  spaceSlug,
  viewerMembershipId,
}: {
  peopleLabel?: "members" | "participants";
  post: FeedPostView;
  returnPath?: string;
  slug: string;
  spaceId?: string;
  spaceSlug?: string;
  viewerMembershipId?: string;
}) {
  const hasSpaceScope = Boolean(spaceId && spaceSlug);
  const canFollow = Boolean(
    viewerMembershipId && viewerMembershipId !== post.author.membershipId,
  );
  const followAction = hasSpaceScope
    ? post.isFollowingAuthor
      ? unfollowMembershipInSpaceAction.bind(
          null,
          slug,
          spaceId ?? "",
          viewerMembershipId ?? "",
          post.author.membershipId,
        )
      : followMembershipInSpaceAction.bind(
          null,
          slug,
          spaceId ?? "",
          viewerMembershipId ?? "",
          post.author.membershipId,
        )
    : post.isFollowingAuthor
      ? unfollowMembershipAction.bind(
          null,
          slug,
          viewerMembershipId ?? "",
          post.author.membershipId,
        )
      : followMembershipAction.bind(
          null,
          slug,
          viewerMembershipId ?? "",
          post.author.membershipId,
        );
  const saveAction = hasSpaceScope
    ? post.isSaved
      ? unsavePostInSpaceAction.bind(
          null,
          slug,
          spaceId ?? "",
          viewerMembershipId ?? "",
          post.id,
        )
      : savePostInSpaceAction.bind(
          null,
          slug,
          spaceId ?? "",
          viewerMembershipId ?? "",
          post.id,
        )
    : post.isSaved
      ? unsavePostAction.bind(null, slug, viewerMembershipId ?? "", post.id)
      : savePostAction.bind(null, slug, viewerMembershipId ?? "", post.id);
  const postPath = spaceSlug
    ? `/org/${slug}/s/${spaceSlug}/posts/${post.id}`
    : `/org/${slug}/posts/${post.id}`;
  const typeLabel = postTypeLabel(post.type);
  const opportunitySourceLabel = post.opportunitySource === "member"
    ? `From ${peopleLabel}`
    : post.opportunitySource === "mentor"
      ? "From mentors"
      : "From organizers";
  const authorSignals = [
    post.author.affiliationLabel,
    post.author.currentStatus,
    post.author.location,
  ].filter(Boolean);

  return (
    <Card className="group space-y-3 overflow-hidden p-4 transition before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[linear-gradient(180deg,var(--cyan),var(--accent),var(--gold))] before:opacity-60 hover:border-[var(--accent)]/30 hover:shadow-[0_16px_42px_rgba(34,27,68,0.1)]">
      <div className="flex flex-wrap items-start gap-2 pl-1">
        <Badge variant={post.featured ? "accent" : "default"}>{typeLabel}</Badge>
        {post.opportunitySource ? (
          <Badge variant="muted">{opportunitySourceLabel}</Badge>
        ) : null}
        {post.recommendationReasons.map((reason, index) => (
          <Badge key={`recommendation-${reason}-${index}`} variant="accent">
            {reason}
          </Badge>
        ))}
        <span className="ml-auto text-xs font-semibold uppercase text-[var(--ink-soft)]">
          {formatDate(post.createdAt)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0 space-y-2 pl-1">
          {post.title ? (
            <h3 className="text-lg font-semibold leading-snug text-[var(--ink)] sm:text-xl">
              <Link
                className="transition hover:text-[var(--accent)]"
                href={postPath}
              >
                {post.title}
              </Link>
            </h3>
          ) : null}
          {post.body ? (
            <RichTextBody
              body={post.body}
              className="block line-clamp-2 text-sm leading-6 text-[var(--ink-soft)]"
              memberHref={(membershipId) =>
                spaceSlug
                  ? `/org/${slug}/s/${spaceSlug}/people/${membershipId}`
                  : `/org/${slug}/people/${membershipId}`
              }
              mentions={post.mentions}
            />
          ) : null}
        </div>
        <Link
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-soft)] transition duration-150 ease-out hover:border-[var(--accent)]/40 hover:bg-[var(--surface)] hover:text-[var(--ink)] active:translate-y-px active:scale-[0.99]"
          href={postPath}
        >
          Open
          <ArrowUpRight className="size-3.5" />
          <NavPendingIndicator className="size-1.5" />
        </Link>
      </div>

      <PostImageGallery images={post.images} />
      <LinkPreviewCard compact preview={post.linkPreview} />

      <div className="flex flex-wrap gap-2 pl-1">
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

      <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-9" name={post.author.displayName} src={post.author.photo} />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold text-[var(--ink)]">{post.author.displayName}</p>
            <p className="line-clamp-1 text-xs font-medium text-[var(--ink-soft)]">
              {post.author.headline}
            </p>
            {authorSignals.length ? (
              <p className="line-clamp-1 text-xs text-[var(--ink-soft)]/80">
                {authorSignals.slice(0, 3).join(" / ")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--ink-soft)]">
            <MessageCircle className="size-4" />
            {post.commentCount}
          </span>
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
          {viewerMembershipId ? (
            <form action={saveAction}>
              {returnPath ? <input name="return_to" type="hidden" value={returnPath} /> : null}
              <SubmitButton
                pendingLabel={post.isSaved ? "Removing" : "Saving"}
                size="sm"
                variant={post.isSaved ? "primary" : "secondary"}
              >
                <Bookmark className="size-4" />
                {post.isSaved ? "Saved" : "Save"}
              </SubmitButton>
            </form>
          ) : null}
          <LinkButton href={postPath} size="sm" variant="secondary">
            Open thread
          </LinkButton>
        </div>
      </div>
    </Card>
  );
}

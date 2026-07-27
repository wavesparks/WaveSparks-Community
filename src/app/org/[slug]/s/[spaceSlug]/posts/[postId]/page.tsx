import { notFound } from "next/navigation";
import { ArrowLeft, Bookmark, LockKeyhole, MessageCircle, UserPlus } from "lucide-react";

import {
  addCommentInSpaceAction,
  requestIntroInSpaceAction,
  savePostInSpaceAction,
  unsavePostInSpaceAction,
} from "@/actions/member";
import { CommentComposer } from "@/components/community/comment-composer";
import { LinkPreviewCard } from "@/components/community/link-preview-card";
import { PostImageGallery } from "@/components/community/post-image-gallery";
import { RichTextBody } from "@/components/community/rich-text-body";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  getCommunityDisplayName,
  getCommunityPeopleLabels,
} from "@/lib/community-copy";
import { singleQueryValue } from "@/lib/feed-filters";
import { getActiveIntroStatusCopy } from "@/lib/intro-status";
import type {
  PostImageView,
  PostLinkPreviewView,
  RichTextMention,
} from "@/lib/domain";
import { postStatusLabel, postTypeLabel } from "@/lib/post-copy";
import { getSpaceViewerContext } from "@/lib/space-auth";
import { formatDate } from "@/lib/utils";
import {
  getPostThreadIntroContextForSpace,
  toLimitedProfileCard,
} from "@/server/view-models";

function InteractionGate({
  action,
  slug,
  spaceSlug,
}: {
  action: "reply" | "request an introduction";
  slug: string;
  spaceSlug: string;
}) {
  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-[var(--ink)]">
        Complete your profile to continue
      </p>
      <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
        Complete your profile before you can {action}.
      </p>
      <LinkButton
        className="mt-3"
        href={`/org/${slug}/onboarding?space=${encodeURIComponent(spaceSlug)}`}
        size="sm"
        variant="secondary"
      >
        Complete profile
      </LinkButton>
    </div>
  );
}

export default async function SpacePostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; spaceSlug: string; postId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug, spaceSlug, postId }, query] = await Promise.all([params, searchParams]);

  // Direct links are re-authorized against this exact Space before the post is loaded.
  const context = await getSpaceViewerContext(slug, spaceSlug, {
    requireAccess: true,
    requireAuth: true,
  });
  const { space, viewer } = context;
  const communityName = getCommunityDisplayName(space);
  const { plural: peopleLabel, singular: personLabel } =
    getCommunityPeopleLabels(space);
  const { existingIntroStatus, isPostSaved, thread } =
    await getPostThreadIntroContextForSpace({
      postId,
      orgId: viewer.org.id,
      spaceId: space.id,
      viewerMembershipId: viewer.membership.id,
    });
  if (!thread || thread.post.hidden) notFound();

  const { post } = thread;
  const richThread = thread as typeof thread & {
    images?: PostImageView[];
    linkPreview?: PostLinkPreviewView;
    mentions?: RichTextMention[];
  };
  const authorRecord = thread.author;
  const authorMembership = authorRecord?.membership;
  const authorProfile = authorRecord?.profile;
  if (!authorMembership || !authorProfile) notFound();

  const author = toLimitedProfileCard(authorProfile, authorMembership);
  const commentCards = thread.comments.map((record) => ({
    card:
      record.membership && record.profile
        ? toLimitedProfileCard(record.profile, record.membership)
        : null,
    comment: record.comment,
  }));
  const introCopy = getActiveIntroStatusCopy(existingIntroStatus);
  const postPath = `/org/${slug}/s/${space.slug}/posts/${post.id}`;
  const requestsPath = `/org/${slug}/s/${space.slug}/requests`;
  const commentUnavailableReason = post.commentsLocked
    ? "Comments are closed on this post."
    : post.status !== "active"
      ? "This post is no longer open for comments."
      : null;

  return (
    <div className="space-y-4">
      <LinkButton
        className="w-fit"
        href={`/org/${slug}/s/${space.slug}/feed`}
        size="sm"
        variant="ghost"
      >
        <ArrowLeft className="size-4" />
        Back to {communityName}
      </LinkButton>
      <StatusBanner spaceName={communityName} status={singleQueryValue(query.status)} />

      <Card className="flex items-start gap-3 border-[var(--accent)]/20 bg-[var(--accent-soft)] p-4">
        <LockKeyhole className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
        <p className="text-sm leading-6 text-[var(--ink-soft)]">
          Only {peopleLabel} in <strong className="text-[var(--ink)]">{communityName}</strong>{" "}
          can open this post.
        </p>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="space-y-5 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{postTypeLabel(post.type)}</Badge>
              {post.status !== "active" ? (
                <Badge variant="muted">{postStatusLabel(post.status)}</Badge>
              ) : null}
              {post.commentsLocked ? <Badge variant="muted">Comments closed</Badge> : null}
              <span className="ml-auto text-xs font-semibold uppercase text-[var(--ink-soft)]">
                {formatDate(post.createdAt)}
              </span>
            </div>
            <SectionHeading level={1} title={post.title || postTypeLabel(post.type)} />
            {post.body ? (
              <RichTextBody
                body={post.body}
                className="block text-sm leading-7 text-[var(--ink-soft)] sm:text-base"
                memberHref={(membershipId) =>
                  `/org/${slug}/s/${space.slug}/people/${membershipId}`
                }
                mentions={richThread.mentions ?? []}
              />
            ) : null}
            <PostImageGallery images={richThread.images ?? []} />
            <LinkPreviewCard preview={richThread.linkPreview} />
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag, index) => (
                <Badge key={`space-post-tag-${tag}-${index}`} variant="muted">
                  {tag}
                </Badge>
              ))}
              {post.relatedRolesNeeded.map((role, index) => (
                <Badge key={`space-post-role-${role}-${index}`} variant="accent">
                  {role}
                </Badge>
              ))}
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-10" name={author.displayName} src={author.photo} />
                <div className="min-w-0">
                  <LinkButton
                    className="h-auto justify-start p-0"
                    href={`/org/${slug}/s/${space.slug}/people/${author.membershipId}`}
                    variant="ghost"
                  >
                    {author.displayName}
                  </LinkButton>
                  <p className="line-clamp-1 text-sm text-[var(--ink-soft)]">
                    {author.headline}
                  </p>
                  <p className="line-clamp-1 text-xs text-[var(--ink-soft)]/80">
                    {[author.affiliationLabel, author.currentStatus, author.location]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                </div>
              </div>
              {context.canInteract ? (
                <form
                  action={
                    isPostSaved
                      ? unsavePostInSpaceAction.bind(
                          null,
                          slug,
                          space.id,
                          viewer.membership.id,
                          post.id,
                        )
                      : savePostInSpaceAction.bind(
                          null,
                          slug,
                          space.id,
                          viewer.membership.id,
                          post.id,
                        )
                  }
                >
                  <input name="return_to" type="hidden" value={postPath} />
                  <SubmitButton
                    pendingLabel={isPostSaved ? "Removing" : "Saving"}
                    size="sm"
                    variant={isPostSaved ? "primary" : "secondary"}
                  >
                    <Bookmark className="size-4" />
                    {isPostSaved ? "Saved" : "Save"}
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <SectionHeading title="Comments" />
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-soft)]">
                <MessageCircle className="size-4" />
                {commentCards.length}
              </span>
            </div>
            <div className="space-y-3">
              {commentCards.length ? (
                commentCards.map(({ card, comment }) => (
                  <div
                    className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3"
                    id={`comment-${comment.id}`}
                    key={comment.id}
                  >
                    <div className="flex items-start gap-3">
                      {card ? (
                        <Avatar className="size-8" name={card.displayName} src={card.photo} />
                      ) : null}
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--ink)]">
                          {card?.displayName || `Former ${personLabel}`}
                        </p>
                        <RichTextBody
                          body={comment.body}
                          className="mt-1 block text-sm leading-6 text-[var(--ink-soft)]"
                          memberHref={(membershipId) =>
                            `/org/${slug}/s/${space.slug}/people/${membershipId}`
                          }
                          mentions={comment.mentions ?? []}
                        />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                  <p className="text-sm font-semibold text-[var(--ink)]">No comments yet</p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    Be the first {personLabel} in {communityName} to share a thought.
                  </p>
                </div>
              )}
            </div>

            {commentUnavailableReason ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                <p className="text-sm font-semibold text-[var(--ink)]">Commenting unavailable</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  {commentUnavailableReason}
                </p>
              </div>
            ) : context.canInteract ? (
              <CommentComposer
                action={addCommentInSpaceAction.bind(
                  null,
                  slug,
                  space.id,
                  viewer.membership.id,
                  post.id,
                )}
                candidateEndpoint={`/api/org/${encodeURIComponent(slug)}/spaces/${encodeURIComponent(space.id)}/mention-candidates`}
              />
            ) : (
              <InteractionGate action="reply" slug={slug} spaceSlug={space.slug} />
            )}
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-64 xl:self-start">
          <Card className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <UserPlus className="size-4" />
              </div>
              <SectionHeading title="Request an introduction" />
            </div>
            {!context.canInteract ? (
              <InteractionGate
                action="request an introduction"
                slug={slug}
                spaceSlug={space.slug}
              />
            ) : author.membershipId === viewer.membership.id ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                <p className="text-sm font-semibold text-[var(--ink)]">You wrote this post</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Other {peopleLabel} in {communityName} can request an introduction from this
                  post.
                </p>
              </div>
            ) : introCopy ? (
              <div className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">{introCopy.title}</p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">{introCopy.body}</p>
                </div>
                <LinkButton className="w-full" href={requestsPath} variant="secondary">
                  View introduction
                </LinkButton>
              </div>
            ) : (
              <form
                action={requestIntroInSpaceAction.bind(
                  null,
                  slug,
                  space.id,
                  viewer.membership.id,
                )}
                className="space-y-3"
              >
                <input
                  name="receiver_membership_id"
                  type="hidden"
                  value={author.membershipId}
                />
                <input name="source_type" type="hidden" value="post" />
                <input name="source_id" type="hidden" value={post.id} />
                <div>
                  <Label htmlFor="post-intro-purpose">What would you like to discuss?</Label>
                  <Input
                    id="post-intro-purpose"
                    name="intro_purpose"
                    placeholder="For example, a question about this post"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="post-intro-note">Why would you like to meet?</Label>
                  <Textarea
                    id="post-intro-note"
                    name="note"
                    placeholder="Share what caught your attention and why a conversation could be helpful."
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="post-intro-message">Your opening message</Label>
                  <Textarea
                    id="post-intro-message"
                    name="suggested_first_message"
                    placeholder="Write the message you would like to send if they accept."
                    required
                  />
                </div>
                <SubmitButton className="w-full" pendingLabel="Sending request">
                  Request introduction
                </SubmitButton>
              </form>
            )}
          </Card>

          <Card className="space-y-3 p-5">
            <p className="text-xs font-semibold uppercase text-[var(--accent)]">
              Post details
            </p>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--ink-soft)]">Shared in</span>
                <span className="truncate font-semibold text-[var(--ink)]">
                  {communityName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--ink-soft)]">Comments</span>
                <span className="font-semibold text-[var(--ink)]">{commentCards.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--ink-soft)]">Status</span>
                <span className="font-semibold text-[var(--ink)]">
                  {postStatusLabel(post.status)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--ink-soft)]">Author</span>
                <span className="truncate font-semibold text-[var(--ink)]">
                  {author.displayName}
                </span>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

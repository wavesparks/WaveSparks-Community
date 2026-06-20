import {
  addCommentAction,
  requestIntroAction,
  savePostAction,
  unsavePostAction,
} from "@/actions/member";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bookmark, MessageCircle, UserPlus } from "lucide-react";
import { ForumShell } from "@/components/layout/forum-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { getOrganizationViewerContext } from "@/lib/auth";
import type { ViewerContext } from "@/lib/domain";
import { singleQueryValue } from "@/lib/feed-filters";
import { getActiveIntroStatusCopy } from "@/lib/intro-status";
import { formatDate } from "@/lib/utils";
import { canAccessFeed } from "@/server/permissions";
import {
  getPostThreadIntroContext,
  toLimitedProfileCard,
} from "@/server/view-models";

function interactionHref(slug: string, viewer?: ViewerContext | null) {
  if (!viewer) {
    return `/org/${slug}/signin`;
  }

  return viewer.membership.status === "approved"
    ? `/org/${slug}/onboarding`
    : `/org/${slug}/pending`;
}

function InteractionGate({
  action,
  slug,
  viewer,
}: {
  action: "reply" | "request intro";
  slug: string;
  viewer?: ViewerContext | null;
}) {
  const signedIn = Boolean(viewer);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
      <p className="text-sm font-semibold text-[var(--ink)]">
        {signedIn ? "Member setup required" : "Sign in required"}
      </p>
      <p className="mt-1 text-sm text-[var(--ink-soft)]">
        {signedIn
          ? `Finish member setup to ${action}.`
          : `Sign in to ${action}.`}
      </p>
      <Button asChild className="mt-3" size="sm">
        <Link href={interactionHref(slug, viewer)}>
          {signedIn ? "Continue" : "Sign in"}
        </Link>
      </Button>
    </div>
  );
}

export default async function PostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; postId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, postId } = await params;
  const query = await searchParams;
  const { org, viewer } = await getOrganizationViewerContext(slug);
  const viewerCanInteract = viewer ? canAccessFeed(viewer.membership, viewer.profile) : false;

  const { existingIntroStatus, isPostSaved, thread } = await getPostThreadIntroContext({
    postId,
    orgId: org.id,
    viewerMembershipId: viewerCanInteract ? viewer?.membership.id : undefined,
  });
  if (!thread) {
    notFound();
  }

  const { post } = thread;
  if (post.hidden) {
    notFound();
  }

  const authorRecord = thread.author;
  const authorMembership = authorRecord?.membership;
  const authorProfile = authorRecord?.profile;
  const commentCards = thread.comments.map((record) => {
    const card =
      record?.membership && record.profile
        ? toLimitedProfileCard(record.profile, record.membership)
        : null;
    return { card, comment: record.comment };
  });

  if (!authorMembership || !authorProfile) {
    notFound();
  }

  const author = toLimitedProfileCard(authorProfile, authorMembership);
  const introCopy = getActiveIntroStatusCopy(existingIntroStatus);
  const commentUnavailableReason = post.commentsLocked
    ? "Comments are locked for this thread."
    : post.status !== "active"
      ? "This thread is no longer active."
      : null;

  return (
    <ForumShell currentPath={`/org/${slug}/feed`} org={org} viewer={viewer}>
      <div className="space-y-4">
        <Button asChild className="w-fit" size="sm" variant="ghost">
          <Link href={`/org/${slug}/feed`}>
            <ArrowLeft className="size-4" />
            Back to forum
          </Link>
        </Button>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <StatusBanner status={singleQueryValue(query.status)} />
          <Card className="space-y-5 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{post.type.replaceAll("_", " ")}</Badge>
              {post.status !== "active" ? <Badge variant="muted">{post.status}</Badge> : null}
              {post.commentsLocked ? <Badge variant="muted">comments locked</Badge> : null}
              <span className="ml-auto text-xs font-semibold uppercase text-[var(--ink-soft)]">
                {formatDate(post.createdAt)}
              </span>
            </div>
            <SectionHeading level={1} title={post.title} description={post.body} />
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag, index) => (
                <Badge key={`post-tag-${tag}-${index}`} variant="muted">
                  {tag}
                </Badge>
              ))}
              {post.relatedRolesNeeded.map((role, index) => (
                <Badge key={`post-role-${role}-${index}`} variant="accent">
                  {role}
                </Badge>
              ))}
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-10" name={author.displayName} src={author.photo} />
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--ink)]">{author.displayName}</p>
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
              {viewerCanInteract && viewer ? (
                <form
                  action={
                    isPostSaved
                      ? unsavePostAction.bind(null, slug, viewer.membership.id, post.id)
                      : savePostAction.bind(null, slug, viewer.membership.id, post.id)
                  }
                >
                  <input name="return_to" type="hidden" value={`/org/${slug}/posts/${post.id}`} />
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
              {commentCards.length ? commentCards.map(({ card, comment }) => {
                return (
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3" key={comment.id}>
                    <div className="flex items-start gap-3">
                      {card ? (
                        <Avatar className="size-8" name={card.displayName} src={card.photo} />
                      ) : null}
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--ink)]">{card?.displayName}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                          {comment.body}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                  <p className="text-sm font-semibold text-[var(--ink)]">No comments yet</p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    Be the first member to add context.
                  </p>
                </div>
              )}
            </div>
            {commentUnavailableReason ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                <p className="text-sm font-semibold text-[var(--ink)]">Commenting unavailable</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">{commentUnavailableReason}</p>
              </div>
            ) : viewerCanInteract && viewer ? (
              <form action={addCommentAction.bind(null, slug, viewer.membership.id, post.id)} className="space-y-3">
                <Textarea name="body" placeholder="Add a useful, contextual response." required />
                <SubmitButton pendingLabel="Adding comment">Add comment</SubmitButton>
              </form>
            ) : (
              <InteractionGate action="reply" slug={slug} viewer={viewer} />
            )}
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <UserPlus className="size-4" />
              </div>
              <SectionHeading title="Request intro" />
            </div>
            {!viewerCanInteract || !viewer ? (
              <InteractionGate action="request intro" slug={slug} viewer={viewer} />
            ) : author.membershipId === viewer.membership.id ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                <p className="text-sm font-semibold text-[var(--ink)]">This is your thread</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Members can request intros from your post when it feels relevant.
                </p>
              </div>
            ) : introCopy ? (
              <div className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">{introCopy.title}</p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">{introCopy.body}</p>
                </div>
                <Button asChild className="w-full" variant="secondary">
                  <Link href={`/org/${slug}/requests`}>Open requests</Link>
                </Button>
              </div>
            ) : (
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
                <SubmitButton className="w-full" pendingLabel="Sending request">
                  Request intro
                </SubmitButton>
              </form>
            )}
          </Card>
          <Card className="space-y-3 p-5">
            <p className="text-xs font-semibold uppercase text-[var(--accent)]">Thread context</p>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--ink-soft)]">Comments</span>
                <span className="font-semibold text-[var(--ink)]">{commentCards.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--ink-soft)]">Status</span>
                <span className="font-semibold capitalize text-[var(--ink)]">{post.status}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--ink-soft)]">Author</span>
                <span className="truncate font-semibold text-[var(--ink)]">{author.displayName}</span>
              </div>
            </div>
          </Card>
        </div>
        </div>
      </div>
    </ForumShell>
  );
}

import {
  addCommentAction,
  requestIntroAction,
  savePostAction,
  unsavePostAction,
} from "@/actions/member";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bookmark } from "lucide-react";
import { ForumShell } from "@/components/layout/forum-shell";
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
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-950">
        {signedIn ? "Member setup required" : "Sign in required"}
      </p>
      <p className="mt-1 text-sm text-slate-600">
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
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <StatusBanner status={singleQueryValue(query.status)} />
          <Card className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <Badge>{post.type.replaceAll("_", " ")}</Badge>
              {post.status !== "active" ? <Badge variant="muted">{post.status}</Badge> : null}
              {post.commentsLocked ? <Badge variant="muted">comments locked</Badge> : null}
              <span className="text-xs font-medium text-slate-500">
                {formatDate(post.createdAt)}
              </span>
            </div>
            <SectionHeading level={1} title={post.title} description={post.body} />
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
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag, index) => (
                <Badge key={`post-tag-${tag}-${index}`} variant="muted">
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">{author.displayName}</p>
              <p className="mt-1 text-sm text-slate-600">{author.headline}</p>
            </div>
          </Card>

          <Card className="space-y-4">
            <SectionHeading title="Comments" />
            <div className="space-y-4">
              {commentCards.length ? commentCards.map(({ card, comment }) => {
                return (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" key={comment.id}>
                    <p className="font-semibold text-slate-900">{card?.displayName}</p>
                    <p className="mt-2 text-sm text-slate-700">{comment.body}</p>
                  </div>
                );
              }) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-950">No comments yet</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Be the first member to add context.
                  </p>
                </div>
              )}
            </div>
            {commentUnavailableReason ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-950">Commenting unavailable</p>
                <p className="mt-1 text-sm text-slate-600">{commentUnavailableReason}</p>
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

        <div className="space-y-6">
          <Card className="space-y-4">
            <SectionHeading title="Request intro from this thread" />
            {!viewerCanInteract || !viewer ? (
              <InteractionGate action="request intro" slug={slug} viewer={viewer} />
            ) : author.membershipId === viewer.membership.id ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-950">This is your thread</p>
                <p className="mt-1 text-sm text-slate-600">
                  Members can request intros from your post when it feels relevant.
                </p>
              </div>
            ) : introCopy ? (
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{introCopy.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{introCopy.body}</p>
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
        </div>
      </div>
    </ForumShell>
  );
}

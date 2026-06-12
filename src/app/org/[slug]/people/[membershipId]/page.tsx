import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, UserPlus } from "lucide-react";

import {
  followMembershipAction,
  requestIntroAction,
  unfollowMembershipAction,
} from "@/actions/member";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { AppShell } from "@/components/layout/app-shell";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import { getActiveIntroStatusCopy } from "@/lib/intro-status";
import { getMemberDirectoryProfileView } from "@/server/view-models";

export default async function PersonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; membershipId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, membershipId } = await params;
  const query = await searchParams;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireCompleteProfile: true,
  });

  if (!viewer) {
    return null;
  }

  const profile = await getMemberDirectoryProfileView({
    orgId: viewer.org.id,
    membershipId,
    viewerMembershipId: viewer.membership.id,
  });
  if (!profile) {
    notFound();
  }

  const isSelf = viewer.membership.id === profile.membershipId;
  const introCopy = getActiveIntroStatusCopy(profile.introStatus);
  const followAction = profile.isFollowing
    ? unfollowMembershipAction.bind(null, slug, viewer.membership.id, profile.membershipId)
    : followMembershipAction.bind(null, slug, viewer.membership.id, profile.membershipId);

  return (
    <AppShell currentPath={`/org/${slug}/people`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/org/${slug}/people`}>
              <ArrowLeft className="size-4" />
              People
            </Link>
          </Button>
          {!isSelf ? (
            <form action={followAction}>
              <input
                name="return_to"
                type="hidden"
                value={`/org/${slug}/people/${profile.membershipId}`}
              />
              <SubmitButton
                pendingLabel={profile.isFollowing ? "Unfollowing" : "Following"}
                size="sm"
                variant={profile.isFollowing ? "secondary" : "primary"}
              >
                {profile.isFollowing ? "Following" : "Follow"}
              </SubmitButton>
            </form>
          ) : null}
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <Card className="space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <Avatar className="size-20" name={profile.displayName} src={profile.photo} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <Badge>{profile.stage}</Badge>
                    <Badge variant="muted">{profile.affiliationLabel}</Badge>
                  </div>
                  <SectionHeading
                    level={1}
                    title={profile.displayName}
                    description={profile.headline}
                  />
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                    {profile.location || "Remote / flexible"}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                  <p className="text-sm font-semibold text-[var(--ink)]">Building</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                    {profile.whatTheyAreBuilding || profile.startupDescription}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                  <p className="text-sm font-semibold text-[var(--ink)]">Looking for</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                    {[...profile.whatTheyNeed, ...profile.desiredRoles].join(", ") ||
                      "Useful founder conversations"}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-[var(--ink)]">Startup context</p>
                <p className="text-sm leading-6 text-[var(--ink-soft)]">
                  {profile.startupDescription}
                </p>
                <p className="text-sm leading-6 text-[var(--ink-soft)]">
                  {profile.currentProgress}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  ...profile.industryTags,
                  ...profile.problemSpaceTags,
                  ...profile.skillTags,
                ].map((tag, index) => (
                  <Badge key={`${profile.profileId}-detail-tag-${tag}-${index}`} variant="muted">
                    {tag}
                  </Badge>
                ))}
              </div>

              {profile.profileLinks.length ? (
                <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
                  {profile.profileLinks.map((link) => (
                    <Button asChild key={link.id} size="sm" variant="secondary">
                      <a href={link.url} rel="noreferrer" target="_blank">
                        <ExternalLink className="size-4" />
                        {link.type}
                      </a>
                    </Button>
                  ))}
                </div>
              ) : null}
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="space-y-4">
              <SectionHeading title="Request a profile intro" />
              {isSelf ? (
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                  <p className="text-sm font-semibold text-[var(--ink)]">This is your profile</p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    Other approved members can request intros from this page.
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
                  <input
                    name="receiver_membership_id"
                    type="hidden"
                    value={profile.membershipId}
                  />
                  <input name="source_type" type="hidden" value="profile" />
                  <input name="source_id" type="hidden" value={profile.profileId} />
                  <Input name="intro_purpose" defaultValue="profile discovery" />
                  <Textarea
                    name="note"
                    defaultValue={`Your work on ${profile.startupName || profile.whatTheyAreBuilding} feels relevant to what I’m exploring. I’d love to compare notes if you’re open to it.`}
                  />
                  <Textarea
                    name="suggested_first_message"
                    defaultValue="Thanks for being open to connect. I found your profile through the member directory and would love to compare notes."
                  />
                  <SubmitButton className="w-full" pendingLabel="Sending request">
                    <UserPlus className="size-4" />
                    Request intro
                  </SubmitButton>
                </form>
              )}
            </Card>

            <Card className="space-y-3">
              <SectionHeading title="Contact privacy" />
              <p className="text-sm leading-6 text-[var(--ink-soft)]">
                Email and WhatsApp stay hidden until an intro is accepted by both sides.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

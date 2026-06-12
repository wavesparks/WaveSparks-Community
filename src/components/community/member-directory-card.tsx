import Link from "next/link";
import { ExternalLink, UserPlus } from "lucide-react";

import {
  followMembershipAction,
  requestIntroAction,
  unfollowMembershipAction,
} from "@/actions/member";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { getActiveIntroStatusCopy } from "@/lib/intro-status";
import type { MemberDirectoryProfileView } from "@/lib/domain";

export function MemberDirectoryCard({
  profile,
  returnPath,
  slug,
  viewerMembershipId,
}: {
  profile: MemberDirectoryProfileView;
  returnPath: string;
  slug: string;
  viewerMembershipId: string;
}) {
  const isSelf = viewerMembershipId === profile.membershipId;
  const followAction = profile.isFollowing
    ? unfollowMembershipAction.bind(null, slug, viewerMembershipId, profile.membershipId)
    : followMembershipAction.bind(null, slug, viewerMembershipId, profile.membershipId);
  const introCopy = getActiveIntroStatusCopy(profile.introStatus);

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-4">
        <Avatar className="size-14" name={profile.displayName} src={profile.photo} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-[var(--ink)]">
              {profile.displayName}
            </h3>
            <Badge variant="muted">{profile.affiliationLabel}</Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--ink-soft)]">
            {profile.headline}
          </p>
          <p className="mt-2 text-sm font-medium text-[var(--ink)]">
            {profile.whatTheyAreBuilding || profile.startupName}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge>{profile.stage}</Badge>
        {profile.keyTags.map((tag, index) => (
          <Badge key={`${profile.profileId}-tag-${tag}-${index}`} variant="muted">
            {tag}
          </Badge>
        ))}
      </div>

      <div className="grid gap-3 text-sm text-[var(--ink-soft)] sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
          <p className="font-semibold text-[var(--ink)]">Needs</p>
          <p className="mt-1">
            {[...profile.whatTheyNeed, ...profile.desiredRoles].slice(0, 4).join(", ") ||
              "Open to useful conversations"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
          <p className="font-semibold text-[var(--ink)]">Location</p>
          <p className="mt-1">{profile.location || "Remote / flexible"}</p>
        </div>
      </div>

      {profile.profileLinks.length ? (
        <div className="flex flex-wrap gap-2">
          {profile.profileLinks.slice(0, 3).map((link) => (
            <Button asChild key={link.id} size="sm" variant="ghost">
              <a href={link.url} rel="noreferrer" target="_blank">
                <ExternalLink className="size-4" />
                {link.type}
              </a>
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-4 sm:flex-row sm:items-center sm:justify-end">
        <Button asChild size="sm" variant="secondary">
          <Link href={`/org/${slug}/people/${profile.membershipId}`}>View profile</Link>
        </Button>
        {!isSelf ? (
          <form action={followAction}>
            <input name="return_to" type="hidden" value={returnPath} />
            <SubmitButton
              pendingLabel={profile.isFollowing ? "Unfollowing" : "Following"}
              size="sm"
              variant={profile.isFollowing ? "secondary" : "primary"}
            >
              {profile.isFollowing ? "Following" : "Follow"}
            </SubmitButton>
          </form>
        ) : null}
        {!isSelf && introCopy ? (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/org/${slug}/requests`}>{introCopy.title}</Link>
          </Button>
        ) : null}
        {!isSelf && !introCopy ? (
          <form action={requestIntroAction.bind(null, slug, viewerMembershipId)}>
            <input name="receiver_membership_id" type="hidden" value={profile.membershipId} />
            <input name="source_type" type="hidden" value="profile" />
            <input name="source_id" type="hidden" value={profile.profileId} />
            <input name="intro_purpose" type="hidden" value="profile discovery" />
            <input
              name="note"
              type="hidden"
              value={`Your profile stood out because of ${profile.keyTags.slice(0, 3).join(", ") || "your founder context"}. I’d love to compare notes if you’re open to it.`}
            />
            <input
              name="suggested_first_message"
              type="hidden"
              value="Thanks for being open to connect. I found your profile through the member directory and would love to compare notes."
            />
            <SubmitButton pendingLabel="Requesting" size="sm">
              <UserPlus className="size-4" />
              Request intro
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </Card>
  );
}

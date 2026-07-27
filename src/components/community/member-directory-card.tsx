import {
  BriefcaseBusiness,
  ExternalLink,
  GraduationCap,
  Handshake,
  MapPin,
  UserPlus,
} from "lucide-react";

import {
  followMembershipAction,
  followMembershipInSpaceAction,
  unfollowMembershipAction,
  unfollowMembershipInSpaceAction,
} from "@/actions/member";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SubmitButton } from "@/components/ui/submit-button";
import { getActiveIntroStatusCopy } from "@/lib/intro-status";
import type { MemberDirectoryProfileView } from "@/lib/domain";

export function MemberDirectoryCard({
  profile,
  returnPath,
  slug,
  spaceId,
  spaceSlug,
  viewerMembershipId,
}: {
  profile: MemberDirectoryProfileView;
  returnPath: string;
  slug: string;
  spaceId?: string;
  spaceSlug?: string;
  viewerMembershipId?: string;
}) {
  const isSelf = Boolean(viewerMembershipId === profile.membershipId);
  const followAction = spaceId
    ? profile.isFollowing
      ? unfollowMembershipInSpaceAction.bind(
          null,
          slug,
          spaceId,
          viewerMembershipId ?? "",
          profile.membershipId,
        )
      : followMembershipInSpaceAction.bind(
          null,
          slug,
          spaceId,
          viewerMembershipId ?? "",
          profile.membershipId,
        )
    : profile.isFollowing
      ? unfollowMembershipAction.bind(
          null,
          slug,
          viewerMembershipId ?? "",
          profile.membershipId,
        )
      : followMembershipAction.bind(
          null,
          slug,
          viewerMembershipId ?? "",
          profile.membershipId,
        );
  const profilePath = spaceSlug
    ? `/org/${slug}/s/${spaceSlug}/people/${profile.membershipId}`
    : `/org/${slug}/people/${profile.membershipId}`;
  const requestsPath = spaceSlug
    ? `/org/${slug}/s/${spaceSlug}/requests`
    : `/org/${slug}/requests`;
  const introCopy = getActiveIntroStatusCopy(profile.introStatus);
  const needs = [...profile.whatTheyNeed, ...profile.desiredRoles].slice(0, 4);
  const expertise = [
    ...profile.skillTags,
    ...profile.mentorExpertiseTags,
    ...profile.mentorFunctionalStrengths,
    ...profile.mentorOffers,
  ].slice(0, 5);

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-12" name={profile.displayName} src={profile.photo} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-[var(--ink)]">{profile.displayName}</h3>
            <Badge variant="muted">{profile.affiliationLabel}</Badge>
            {profile.isApprovedMentor ? (
              <Badge className="gap-1" variant="accent">
                <GraduationCap className="size-3.5" aria-hidden />
                Approved mentor
              </Badge>
            ) : null}
            <Badge variant="accent">{profile.stage}</Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--ink-soft)]">
            {profile.headline}
          </p>
          <p className="mt-2 line-clamp-2 text-sm font-medium leading-5 text-[var(--ink)]">
            {profile.whatTheyAreBuilding || profile.startupName}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {profile.keyTags.map((tag, index) => (
          <Badge key={`${profile.profileId}-tag-${tag}-${index}`} variant="muted">
            {tag}
          </Badge>
        ))}
      </div>

      <div className="grid gap-2 text-sm text-[var(--ink-soft)] sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
          <p className="flex items-center gap-2 font-semibold text-[var(--ink)]">
            <Handshake className="size-4 text-[var(--accent)]" />
            Needs
          </p>
          <p className="mt-1 line-clamp-2">
            {needs.join(", ") || "Open to connecting"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
          <p className="flex items-center gap-2 font-semibold text-[var(--ink)]">
            <BriefcaseBusiness className="size-4 text-[var(--accent)]" />
            Expertise
          </p>
          <p className="mt-1 line-clamp-2">
            {expertise.join(", ") || "Not added yet"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
          <p className="flex items-center gap-2 font-semibold text-[var(--ink)]">
            <MapPin className="size-4 text-[var(--accent)]" />
            Location
          </p>
          <p className="mt-1 line-clamp-2">{profile.location || "Remote / flexible"}</p>
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
        <LinkButton
          href={profilePath}
          size="sm"
          variant="secondary"
        >
          View profile
        </LinkButton>
        {!isSelf && viewerMembershipId ? (
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
        {!isSelf && viewerMembershipId && introCopy ? (
          <LinkButton href={requestsPath} size="sm" variant="secondary">
            View introduction
          </LinkButton>
        ) : null}
        {!isSelf && viewerMembershipId && !introCopy && profile.openToIntroductions ? (
          <LinkButton
            href={`${profilePath}${profile.acceptingMentoringRequests ? "?connection=mentoring" : ""}#request-introduction`}
            size="sm"
          >
            <UserPlus className="size-4" />
            {profile.acceptingMentoringRequests
              ? "Request mentoring"
              : "Request introduction"}
          </LinkButton>
        ) : null}
        {!isSelf && viewerMembershipId && !introCopy && !profile.openToIntroductions ? (
          <span className="px-2 py-1 text-sm text-[var(--ink-soft)]">
            Not accepting introductions
          </span>
        ) : null}
      </div>
    </Card>
  );
}

import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, GraduationCap, UserPlus } from "lucide-react";

import {
  followMembershipInSpaceAction,
  requestIntroInSpaceAction,
  unfollowMembershipInSpaceAction,
} from "@/actions/member";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { Select } from "@/components/ui/select";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  getCommunityDisplayName,
  getCommunityPeopleLabels,
} from "@/lib/community-copy";
import { singleQueryValue } from "@/lib/feed-filters";
import { distinctLegacyProfileText } from "@/lib/profile-bio";
import { technicalExperienceLabel } from "@/lib/profile-experience";
import { getActiveIntroStatusCopy } from "@/lib/intro-status";
import { getSpaceViewerContext } from "@/lib/space-auth";
import { getMemberDirectoryProfileViewForSpace } from "@/server/view-models";

export default async function SpacePersonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; spaceSlug: string; membershipId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug, spaceSlug, membershipId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const context = await getSpaceViewerContext(slug, spaceSlug, {
    requireAccess: true,
    requireAuth: true,
    requireProfile: true,
  });
  const { space, viewer } = context;
  const communityName = getCommunityDisplayName(space);
  const { plural: peopleLabel } = getCommunityPeopleLabels(space);
  const profile = await getMemberDirectoryProfileViewForSpace({
    orgId: viewer.org.id,
    spaceId: space.id,
    membershipId,
    viewerMembershipId: viewer.membership.id,
  });
  if (!profile) notFound();
  const projectContext = [
    distinctLegacyProfileText(profile.problemInterest, profile.startupDescription),
    profile.currentProgress,
  ]
    .filter(Boolean)
    .join(" ");

  const isSelf = viewer.membership.id === profile.membershipId;
  const introCopy = getActiveIntroStatusCopy(profile.introStatus);
  const requestedConnection = singleQueryValue(query.connection);
  const defaultIntroKind =
    profile.acceptingMentoringRequests && requestedConnection === "mentoring"
      ? "mentoring"
      : "general";
  const mentorRequestStatus = !profile.openToIntroductions
    ? "Not currently accepting introductions."
    : profile.acceptingMentoringRequests
      ? "Currently accepting mentoring requests."
      : "Not currently accepting mentoring requests. You can still request a general introduction.";
  const profilePath = `/org/${slug}/s/${space.slug}/people/${profile.membershipId}`;
  const followAction = profile.isFollowing
    ? unfollowMembershipInSpaceAction.bind(
        null,
        slug,
        space.id,
        viewer.membership.id,
        profile.membershipId,
      )
    : followMembershipInSpaceAction.bind(
        null,
        slug,
        space.id,
        viewer.membership.id,
        profile.membershipId,
      );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <LinkButton
          href={`/org/${slug}/s/${space.slug}/people`}
          size="sm"
          variant="secondary"
        >
          <ArrowLeft className="size-4" />
          People in {communityName}
        </LinkButton>
        {!isSelf && context.canInteract ? (
          <form action={followAction}>
            <input name="return_to" type="hidden" value={profilePath} />
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
      <StatusBanner spaceName={communityName} status={singleQueryValue(query.status)} />

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <Avatar className="size-20" name={profile.displayName} src={profile.photo} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-2">
                <Badge>{profile.stage}</Badge>
                <Badge variant="muted">{profile.affiliationLabel}</Badge>
                {profile.isApprovedMentor ? (
                  <Badge className="gap-1" variant="accent">
                    <GraduationCap className="size-3.5" aria-hidden />
                    Approved mentor
                  </Badge>
                ) : null}
                <Badge variant="accent">
                  {space.kind === "main" ? "Member of" : "Participant in"}{" "}
                  {communityName}
                </Badge>
              </div>
              <SectionHeading
                description={profile.headline}
                level={1}
                title={profile.displayName}
              />
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                {profile.location || "Remote / flexible"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
              <p className="text-sm font-semibold text-[var(--ink)]">Exploring now</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                {profile.currentFocus || profile.whatTheyAreBuilding || "Still exploring"}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
              <p className="text-sm font-semibold text-[var(--ink)]">Interested in</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                {profile.problemInterest ||
                  [...profile.whatTheyNeed, ...profile.desiredRoles].join(", ") ||
                  "Meeting people with shared interests"}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-[var(--ink)]">About</p>
            <p className="text-sm leading-6 text-[var(--ink-soft)]">{profile.bio}</p>
            {profile.technicalExperience ? (
              <div className="rounded-lg border border-[var(--line)] p-4">
                <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">
                  Technical & product experience ·{" "}
                  {technicalExperienceLabel(profile.technicalExperienceLevel)}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                  {profile.technicalExperience}
                </p>
              </div>
            ) : null}
            {projectContext ? (
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">What they’re working on</p>
                <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                  {projectContext}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {[...profile.industryTags, ...profile.problemSpaceTags, ...profile.skillTags].map(
              (tag, index) => (
                <Badge
                  key={`${profile.profileId}-space-detail-tag-${tag}-${index}`}
                  variant="muted"
                >
                  {tag}
                </Badge>
              ),
            )}
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

        <div className="space-y-6">
          {profile.isApprovedMentor ? (
            <Card className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <GraduationCap className="size-5 text-[var(--accent)]" aria-hidden />
                <SectionHeading eyebrow="Approved mentor" title="Mentoring" />
              </div>
              <p className="text-sm leading-6 text-[var(--ink-soft)]">
                {mentorRequestStatus}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">Expertise</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      ...profile.mentorExpertiseTags,
                      ...profile.mentorFunctionalStrengths,
                    ].map((tag, index) => (
                      <Badge key={`mentor-expertise-${tag}-${index}`} variant="muted">
                        {tag}
                      </Badge>
                    ))}
                    {!profile.mentorExpertiseTags.length &&
                    !profile.mentorFunctionalStrengths.length ? (
                      <p className="text-sm text-[var(--ink-soft)]">Not added yet.</p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">Experience by stage</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profile.mentorStageExperience.map((stage, index) => (
                      <Badge key={`mentor-stage-${stage}-${index}`} variant="muted">
                        {stage}
                      </Badge>
                    ))}
                    {!profile.mentorStageExperience.length ? (
                      <p className="text-sm text-[var(--ink-soft)]">Not added yet.</p>
                    ) : null}
                  </div>
                </div>
              </div>
              {profile.mentorOffers.length ? (
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">Mentoring offered</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profile.mentorOffers.map((offer, index) => (
                      <Badge key={`mentor-offer-${offer}-${index}`} variant="accent">
                        {offer}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--ink-soft)]">
                <p>
                  <span className="font-semibold text-[var(--ink)]">Availability:</span>{" "}
                  {profile.mentorAvailability
                    ? profile.mentorAvailability.replaceAll("_", " ")
                    : "Not added yet"}
                </p>
                <p>
                  <span className="font-semibold text-[var(--ink)]">Preferred capacity:</span>{" "}
                  {profile.maxMentees === null
                    ? "Not added yet"
                    : `${profile.maxMentees} mentee${profile.maxMentees === 1 ? "" : "s"}`}
                </p>
                {profile.mentorshipPreferences ? (
                  <p className="mt-2">{profile.mentorshipPreferences}</p>
                ) : null}
              </div>
            </Card>
          ) : null}

          <Card className="scroll-mt-64 space-y-4" id="request-introduction">
            <SectionHeading title={`Introductions in ${communityName}`} />
            {!context.canInteract ? (
              <div className="rounded-lg border border-amber-500/25 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  Complete your profile first
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                  To request an introduction, complete your profile first.
                </p>
                <LinkButton
                  className="mt-3"
                  href={`/org/${slug}/onboarding?space=${encodeURIComponent(space.slug)}`}
                  size="sm"
                  variant="secondary"
                >
                  Complete profile
                </LinkButton>
              </div>
            ) : isSelf ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                <p className="text-sm font-semibold text-[var(--ink)]">This is your profile</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  {profile.openToIntroductions
                    ? `Other ${peopleLabel} in ${communityName} can request an introduction here.`
                    : "You are not currently accepting new introduction requests."}
                </p>
                {!profile.openToIntroductions ? (
                  <LinkButton
                    className="mt-3"
                    href={`/org/${slug}/onboarding?space=${encodeURIComponent(space.slug)}&return_to=${encodeURIComponent(`/org/${slug}/s/${space.slug}/people/${profile.membershipId}#request-introduction`)}`}
                    size="sm"
                    variant="secondary"
                  >
                    Update introduction settings
                  </LinkButton>
                ) : null}
              </div>
            ) : introCopy ? (
              <div className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">{introCopy.title}</p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">{introCopy.body}</p>
                </div>
                <LinkButton
                  className="w-full"
                  href={`/org/${slug}/s/${space.slug}/requests`}
                  variant="secondary"
                >
                  View introduction
                </LinkButton>
              </div>
            ) : !profile.openToIntroductions ? (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  Not accepting introductions
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                  This person is not currently open to new introduction requests.
                </p>
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
                  value={profile.membershipId}
                />
                <input name="source_type" type="hidden" value="profile" />
                <input name="source_id" type="hidden" value={profile.profileId} />
                {profile.acceptingMentoringRequests ? (
                  <div>
                    <Label htmlFor="profile-intro-kind">Connection type</Label>
                    <Select
                      defaultValue={defaultIntroKind}
                      id="profile-intro-kind"
                      name="intro_kind"
                    >
                      <option value="general">General introduction</option>
                      <option value="mentoring">Mentoring request</option>
                    </Select>
                  </div>
                ) : (
                  <input name="intro_kind" type="hidden" value="general" />
                )}
                <div>
                  <Label htmlFor="profile-intro-purpose">What would you like to discuss?</Label>
                  <Input
                    id="profile-intro-purpose"
                    name="intro_purpose"
                    placeholder="For example, advice on entering a new market"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="profile-intro-note">Why would you like to meet?</Label>
                  <Textarea
                    id="profile-intro-note"
                    name="note"
                    placeholder="Share what caught your attention and why a conversation could be helpful."
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="profile-intro-message">Your opening message</Label>
                  <Textarea
                    id="profile-intro-message"
                    name="suggested_first_message"
                    placeholder="Write the message you would like to send if they accept."
                    required
                  />
                </div>
                <SubmitButton className="w-full" pendingLabel="Sending request">
                  <UserPlus className="size-4" />
                  {profile.acceptingMentoringRequests
                    ? "Send request"
                    : "Request introduction"}
                </SubmitButton>
              </form>
            )}
          </Card>

          <Card className="space-y-3">
            <SectionHeading title="Contact privacy" />
            <p className="text-sm leading-6 text-[var(--ink-soft)]">
              Email and WhatsApp stay private until both of you agree to the
              introduction.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

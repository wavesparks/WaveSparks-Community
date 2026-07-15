import {
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import {
  followMembershipInSpaceAction,
  requestIntroInSpaceAction,
  saveMatchFeedbackInSpaceAction,
  unfollowMembershipInSpaceAction,
} from "@/actions/member";
import { MatchCard } from "@/components/community/match-card";
import { SpaceIntentForm } from "@/components/community/space-intent-form";
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
import { getActiveIntroStatusCopy } from "@/lib/intro-status";
import { matchFeedbackReasonLabels } from "@/lib/match-feedback";
import { getSpaceViewerContext } from "@/lib/space-auth";
import { listMatchTypeConfigsForOrg } from "@/server/store";
import { getMatchCardViewsForProfileInSpace } from "@/server/view-models";

function IntentStatus({ status }: { status?: string }) {
  if (status !== "space_intent_saved" && status !== "space_intent_incomplete") {
    return null;
  }
  const complete = status === "space_intent_saved";
  const StatusIcon = complete ? CheckCircle2 : AlertTriangle;
  return (
    <div
      className={`flex gap-3 rounded-lg border p-4 text-sm ${
        complete
          ? "border-emerald-600/25 bg-emerald-50"
          : "border-amber-600/30 bg-amber-50"
      }`}
      role="status"
    >
      <StatusIcon
        aria-hidden
        className={`mt-0.5 size-5 shrink-0 ${
          complete ? "text-emerald-700" : "text-amber-700"
        }`}
      />
      <div>
        <p className="font-semibold text-[var(--ink)]">
          {complete ? "Preferences saved" : "Tell us a little more"}
        </p>
        <p className="mt-1 leading-6 text-[var(--ink-soft)]">
          {complete
            ? "Your matches will reflect what you are looking for and can offer here."
            : "Add a goal and at least one thing you are looking for or can offer."}
        </p>
      </div>
    </div>
  );
}

export default async function SpaceMatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; spaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug, spaceSlug }, query] = await Promise.all([params, searchParams]);
  const context = await getSpaceViewerContext(slug, spaceSlug, {
    requireAccess: true,
    requireAuth: true,
    requireProfile: true,
  });
  const { intent, space, viewer } = context;
  const communityName = getCommunityDisplayName(space);
  const { plural: peopleLabel } = getCommunityPeopleLabels(space);
  const configs = await listMatchTypeConfigsForOrg(viewer.org.id);
  const requestedMatchType = singleQueryValue(query.match_type);
  const selectedMatchType = configs.some((config) => config.slug === requestedMatchType)
    ? requestedMatchType
    : undefined;
  const matchCards = context.canMatch && viewer.profile
    ? await getMatchCardViewsForProfileInSpace(
        space.id,
        viewer.profile.id,
        viewer.membership.id,
        { matchType: selectedMatchType },
      )
    : [];
  const basePath = `/org/${slug}/s/${space.slug}/matches`;
  const status = singleQueryValue(query.status);

  let unavailableTitle = "Tell us who you would like to meet";
  let unavailableBody = `Share what you are working on and how others can help in ${communityName}.`;
  if (!context.canInteract) {
    unavailableTitle = "Complete your profile to see matches";
    unavailableBody = `Complete your profile before we introduce you to other ${peopleLabel}.`;
  } else if (!space.matchingEnabled) {
    unavailableTitle = "New matches are paused";
    unavailableBody =
      "The organizer has paused new matches. Your preferences will stay saved.";
  } else if (intent?.intentComplete && !intent.matchingOptIn) {
    unavailableTitle = "Matches are turned off";
    unavailableBody = `Turn them on below whenever you want to meet people in ${communityName}.`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeading
          description={`Meet ${peopleLabel} in ${communityName} who share your interests or may be able to help.`}
          eyebrow="Matches"
          level={1}
          title={`People to meet in ${communityName}`}
        />
        <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--ink-soft)]">
          <ShieldCheck className="size-4 text-[var(--accent)]" />
          Only {peopleLabel} in {communityName}
        </div>
      </div>

      <IntentStatus status={status} />
      {status !== "space_intent_saved" && status !== "space_intent_incomplete" ? (
        <StatusBanner spaceName={communityName} status={status} />
      ) : null}

      {!context.canInteract ? (
        <Card className="flex flex-col gap-3 border-amber-500/25 bg-amber-50 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-[var(--ink)]">{unavailableTitle}</p>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{unavailableBody}</p>
          </div>
          <LinkButton
            href={`/org/${slug}/onboarding?space=${encodeURIComponent(space.slug)}`}
            variant="secondary"
          >
            Complete profile
          </LinkButton>
        </Card>
      ) : null}

      <SpaceIntentForm
        intent={intent}
        membershipId={viewer.membership.id}
        slug={slug}
        spaceId={space.id}
        spaceName={communityName}
      />

      {context.canMatch ? (
        <>
          <div className="flex flex-wrap gap-2" aria-label="Match type filters">
            <LinkButton
              href={basePath}
              size="sm"
              variant={!selectedMatchType ? "primary" : "secondary"}
            >
              All
            </LinkButton>
            {configs.map((config) => (
              <LinkButton
                href={`${basePath}?match_type=${encodeURIComponent(config.slug)}`}
                key={config.slug}
                size="sm"
                variant={selectedMatchType === config.slug ? "primary" : "secondary"}
              >
                {config.name}
              </LinkButton>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            {matchCards.map(({ following, introStatus, match }) => {
              const introCopy = getActiveIntroStatusCopy(introStatus);
              const introFieldPrefix = `match-${match.id}-intro`;
              return (
                <MatchCard key={match.id} match={match}>
                  <div className="space-y-4 border-t border-[var(--line)] pt-4">
                    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-4">
                      <div>
                        <p className="text-sm font-semibold text-[var(--ink)]">
                          Was this match helpful?
                        </p>
                        <p className="mt-1 text-xs text-[var(--ink-soft)]">
                          Your answer helps improve future matches.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <form
                          action={saveMatchFeedbackInSpaceAction.bind(
                            null,
                            slug,
                            space.id,
                            viewer.membership.id,
                            match.id,
                          )}
                        >
                          <input name="value" type="hidden" value="helpful" />
                          <SubmitButton
                            aria-label="Mark match helpful"
                            pendingLabel="Saving"
                            size="sm"
                            variant="secondary"
                          >
                            <ThumbsUp className="size-4" />
                            Helpful
                          </SubmitButton>
                        </form>
                        <form
                          action={saveMatchFeedbackInSpaceAction.bind(
                            null,
                            slug,
                            space.id,
                            viewer.membership.id,
                            match.id,
                          )}
                          className="flex items-end gap-2"
                        >
                          <input name="value" type="hidden" value="not_relevant" />
                          <Select aria-label="Why this match is not relevant" name="reason" required>
                            <option value="">Reason</option>
                            {Object.entries(matchFeedbackReasonLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </Select>
                          <SubmitButton pendingLabel="Saving" size="sm" variant="ghost">
                            <ThumbsDown className="size-4" />
                            Not relevant
                          </SubmitButton>
                        </form>
                      </div>
                    </div>

                    <form
                      action={
                        following
                          ? unfollowMembershipInSpaceAction.bind(
                              null,
                              slug,
                              space.id,
                              viewer.membership.id,
                              match.target.membershipId,
                            )
                          : followMembershipInSpaceAction.bind(
                              null,
                              slug,
                              space.id,
                              viewer.membership.id,
                              match.target.membershipId,
                            )
                      }
                    >
                      <input name="return_to" type="hidden" value={basePath} />
                      <SubmitButton
                        className="w-full"
                        pendingLabel={following ? "Unfollowing" : "Following"}
                        variant={following ? "secondary" : "primary"}
                      >
                        {following ? "Following" : "Follow"}
                      </SubmitButton>
                    </form>

                    {introCopy ? (
                      <div className="space-y-3 border-t border-[var(--line)] pt-4">
                        <div>
                          <p className="text-sm font-semibold text-[var(--ink)]">
                            {introCopy.title}
                          </p>
                          <p className="mt-1 text-sm text-[var(--ink-soft)]">
                            {introCopy.body}
                          </p>
                        </div>
                        <LinkButton
                          className="w-full"
                          href={`/org/${slug}/s/${space.slug}/requests`}
                          variant="secondary"
                        >
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
                          value={match.target.membershipId}
                        />
                        <input name="source_type" type="hidden" value="match" />
                        <input name="source_id" type="hidden" value={match.id} />
                        <div>
                          <Label htmlFor={`${introFieldPrefix}-purpose`}>
                            What would you like to discuss?
                          </Label>
                          <Input
                            id={`${introFieldPrefix}-purpose`}
                            name="intro_purpose"
                            placeholder="For example, finding a co-founder"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor={`${introFieldPrefix}-note`}>
                            Why would you like to meet?
                          </Label>
                          <Textarea
                            id={`${introFieldPrefix}-note`}
                            name="note"
                            placeholder="Share what caught your attention and why a conversation could be helpful."
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor={`${introFieldPrefix}-message`}>
                            Your opening message
                          </Label>
                          <Textarea
                            id={`${introFieldPrefix}-message`}
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
                  </div>
                </MatchCard>
              );
            })}
          </div>

          {!matchCards.length ? (
            <Card>
              <p className="font-semibold text-[var(--ink)]">
                No matches to show yet
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                Check back after more {peopleLabel} have shared what they are looking for.
              </p>
            </Card>
          ) : null}
        </>
      ) : context.canInteract ? (
        <Card className="flex gap-3 bg-[var(--surface-muted)]">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
          <div>
            <p className="font-semibold text-[var(--ink)]">{unavailableTitle}</p>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{unavailableBody}</p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

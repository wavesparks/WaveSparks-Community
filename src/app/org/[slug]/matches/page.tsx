import {
  followMembershipAction,
  requestIntroAction,
  saveMatchFeedbackAction,
  unfollowMembershipAction,
} from "@/actions/member";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { MatchCard } from "@/components/community/match-card";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { Select } from "@/components/ui/select";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import { getActiveIntroStatusCopy } from "@/lib/intro-status";
import { matchFeedbackReasonLabels } from "@/lib/match-feedback";
import { getMatchCardViewsForProfile } from "@/server/view-models";
import { listMatchTypeConfigsForOrg } from "@/server/store";

export default async function MatchesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireCompleteProfile: true,
  });

  if (!viewer) {
    return null;
  }

  const configs = await listMatchTypeConfigsForOrg(viewer.org.id);
  const requestedMatchType = singleQueryValue(query.match_type);
  const selectedMatchType = configs.some((config) => config.slug === requestedMatchType)
    ? requestedMatchType
    : undefined;
  const matchCards = viewer.profile
    ? await getMatchCardViewsForProfile(viewer.profile.id, viewer.membership.id, {
        matchType: selectedMatchType,
      })
    : [];

  return (
    <AppShell currentPath={`/org/${slug}/matches`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Matches"
          level={1}
          title="AI-suggested people worth meeting"
          description="These suggestions blend explicit intent, structured fit, and semantic similarity. Use People when you want broader limited-profile search."
        />
        <StatusBanner status={singleQueryValue(query.status)} />
        <div className="flex flex-wrap gap-2">
          <LinkButton
            href={`/org/${slug}/matches`}
            size="sm"
            variant={!selectedMatchType ? "primary" : "secondary"}
          >
            All
          </LinkButton>
          {configs.map((config) => (
            <LinkButton
              href={`/org/${slug}/matches?match_type=${encodeURIComponent(config.slug)}`}
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
            return (
              <MatchCard key={match.id} match={match}>
                <div className="space-y-4 border-t border-[var(--line)] pt-4">
                  <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">Private match feedback</p>
                      <p className="mt-1 text-xs text-[var(--ink-soft)]">Visible only in aggregate to admins.</p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <form
                        action={saveMatchFeedbackAction.bind(
                          null,
                          slug,
                          viewer.membership.id,
                          match.id,
                        )}
                      >
                        <input name="value" type="hidden" value="helpful" />
                        <SubmitButton
                          aria-label="Mark match helpful"
                          pendingLabel="Saving"
                          size="sm"
                          title="Helpful"
                          variant="secondary"
                        >
                          <ThumbsUp className="size-4" />
                          Helpful
                        </SubmitButton>
                      </form>
                      <form
                        action={saveMatchFeedbackAction.bind(
                          null,
                          slug,
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
                        <SubmitButton
                          aria-label="Mark match not relevant"
                          pendingLabel="Saving"
                          size="sm"
                          title="Not relevant"
                          variant="ghost"
                        >
                          <ThumbsDown className="size-4" />
                          Not relevant
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                  <form
                    action={
                      following
                        ? unfollowMembershipAction.bind(
                            null,
                            slug,
                            viewer.membership.id,
                            match.target.membershipId,
                          )
                        : followMembershipAction.bind(
                            null,
                            slug,
                            viewer.membership.id,
                            match.target.membershipId,
                      )
                    }
                  >
                    <input name="return_to" type="hidden" value={`/org/${slug}/matches`} />
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
                        <p className="mt-1 text-sm text-[var(--ink-soft)]">{introCopy.body}</p>
                      </div>
                      <LinkButton
                        className="w-full"
                        href={`/org/${slug}/requests`}
                        variant="secondary"
                      >
                        Open requests
                      </LinkButton>
                    </div>
                  ) : (
                    <form
                      action={requestIntroAction.bind(null, slug, viewer.membership.id)}
                      className="space-y-3"
                    >
                      <input
                        name="receiver_membership_id"
                        type="hidden"
                        value={match.target.membershipId}
                      />
                      <input name="source_type" type="hidden" value="match" />
                      <input name="source_id" type="hidden" value={match.id} />
                      <Input
                        name="intro_purpose"
                        placeholder="Purpose: co-founder conversation / mentor guidance"
                        defaultValue={`${match.matchTypeLabel.toLowerCase()} conversation`}
                      />
                      <Textarea
                        name="note"
                        placeholder="Why does this feel like a strong fit?"
                        defaultValue={`Your profile feels aligned on ${match.overlapTags.join(
                          ", ",
                        )}. I'd love to learn more about what you're building and see if a conversation makes sense.`}
                      />
                      <Textarea
                        name="suggested_first_message"
                        placeholder="Suggested first message"
                        defaultValue="Thanks for being open to the intro. I'd love to compare notes and see where there might be fit."
                      />
                      <SubmitButton className="w-full" pendingLabel="Sending request">
                        Request intro
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </MatchCard>
            );
          })}
          {!matchCards.length ? (
            <Card>
              <p className="text-sm font-semibold text-[var(--ink)]">No matches surfaced yet</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Complete more profile context or ask an admin to recompute matches.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

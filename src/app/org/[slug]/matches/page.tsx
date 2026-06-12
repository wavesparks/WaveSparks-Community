import {
  followMembershipAction,
  requestIntroAction,
  unfollowMembershipAction,
} from "@/actions/member";
import Link from "next/link";
import { MatchCard } from "@/components/community/match-card";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import { getActiveIntroStatusCopy } from "@/lib/intro-status";
import { getMatchCardViewsForProfile } from "@/server/view-models";

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

  const matchCards = viewer.profile
    ? await getMatchCardViewsForProfile(viewer.profile.id, viewer.membership.id)
    : [];

  return (
    <AppShell currentPath={`/org/${slug}/matches`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Matches"
          level={1}
          title="AI-suggested people worth meeting"
          description="These suggestions blend structured fit, semantic similarity, and trust signals. Use People when you want broader limited-profile search."
        />
        <StatusBanner status={singleQueryValue(query.status)} />
        <div className="grid gap-6 xl:grid-cols-2">
          {matchCards.map(({ following, introStatus, match }) => {
            const introCopy = getActiveIntroStatusCopy(introStatus);
            return (
              <MatchCard key={match.id} match={match}>
                <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
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
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          {introCopy.title}
                        </p>
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
                        defaultValue={
                          match.matchType === "mentor_match"
                            ? "mentor guidance"
                            : "co-founder conversation"
                        }
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
              <p className="text-sm font-semibold text-slate-950">No matches surfaced yet</p>
              <p className="mt-1 text-sm text-slate-600">
                Complete more profile context or ask an admin to recompute matches.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

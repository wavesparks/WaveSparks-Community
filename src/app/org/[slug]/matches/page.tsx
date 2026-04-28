import {
  followMembershipAction,
  requestIntroAction,
  unfollowMembershipAction,
} from "@/actions/member";
import { MatchCard } from "@/components/community/match-card";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { Textarea } from "@/components/ui/textarea";
import { getViewerContext } from "@/lib/auth";
import { isFollowingMembership, listMatchesForMembership } from "@/server/store";
import { getMatchViews } from "@/server/view-models";

export default async function MatchesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireCompleteProfile: true,
  });

  if (!viewer) {
    return null;
  }

  const matches = await getMatchViews(
    viewer.membership.id,
    await listMatchesForMembership(viewer.membership.id),
  );
  const matchCards = await Promise.all(
    matches.map(async (match) => ({
      match,
      following: await isFollowingMembership(
        viewer.membership.id,
        match.target.membershipId,
      ),
    })),
  );

  return (
    <AppShell currentPath={`/org/${slug}/matches`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Matches"
          title="AI-suggested people worth meeting"
          description="These suggestions blend structured fit, semantic similarity, and trust signals. Members only see surfaced match cards, not an org directory."
        />
        <div className="grid gap-6 xl:grid-cols-2">
          {matchCards.map(({ following, match }) => {
            return (
              <MatchCard key={match.id} match={match}>
                <div className="space-y-4 rounded-[24px] bg-slate-50 p-4">
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
                    <Button
                      className="w-full"
                      type="submit"
                      variant={following ? "secondary" : "primary"}
                    >
                      {following ? "Following" : "Follow"}
                    </Button>
                  </form>
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
                    <Button className="w-full" type="submit">
                      Request intro
                    </Button>
                  </form>
                </div>
              </MatchCard>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

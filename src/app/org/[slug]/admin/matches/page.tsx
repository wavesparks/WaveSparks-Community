import { recomputeMatchesAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import type { MatchRecord, MatchType } from "@/lib/domain";
import { listMatchProfileRecordsForOrg } from "@/server/store";
import Link from "next/link";

const matchQueues = [
  { label: "All", matchType: undefined, scoreBand: undefined },
  { label: "High score", matchType: undefined, scoreBand: "high" },
  { label: "Good score", matchType: undefined, scoreBand: "good" },
  { label: "Co-founder", matchType: "cofounder_match", scoreBand: undefined },
  { label: "Mentor", matchType: "mentor_match", scoreBand: undefined },
] satisfies Array<{
  label: string;
  matchType?: MatchType;
  scoreBand?: MatchRecord["scoreBand"];
}>;

function matchTypeFromQuery(value?: string) {
  return value === "cofounder_match" || value === "mentor_match" ? value : undefined;
}

function scoreBandFromQuery(value?: string) {
  return value === "high" || value === "good" || value === "emerging" ? value : undefined;
}

function matchQueueHref(slug: string, queue: (typeof matchQueues)[number]) {
  const params = new URLSearchParams();
  if (queue.matchType) {
    params.set("match_type", queue.matchType);
  }
  if (queue.scoreBand) {
    params.set("score_band", queue.scoreBand);
  }

  const query = params.toString();
  return `/org/${slug}/admin/matches${query ? `?${query}` : ""}`;
}

export default async function AdminMatchesPage({
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
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const selectedMatchType = matchTypeFromQuery(singleQueryValue(query.match_type));
  const selectedScoreBand = scoreBandFromQuery(singleQueryValue(query.score_band));
  const matchCards = await listMatchProfileRecordsForOrg(viewer.org.id, {
    limit: 20,
    matchType: selectedMatchType,
    scoreBand: selectedScoreBand,
  });

  return (
    <AppShell currentPath={`/org/${slug}/admin/matches`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionHeading
            eyebrow="Admin · Matches"
            level={1}
            title="Review generated matches and recompute"
            description="The ranking stays deterministic and explainable. Admins can trigger a full refresh when profiles change."
          />
          <form action={recomputeMatchesAction.bind(null, slug)}>
            <SubmitButton pendingLabel="Recomputing">Recompute matches</SubmitButton>
          </form>
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {matchQueues.map((queue) => {
              const active =
                queue.matchType === selectedMatchType &&
                queue.scoreBand === selectedScoreBand;

              return (
                <Button
                  asChild
                  key={queue.label}
                  size="sm"
                  variant={active ? "primary" : "secondary"}
                >
                  <Link href={matchQueueHref(slug, queue)}>{queue.label}</Link>
                </Button>
              );
            })}
          </div>
          {matchCards.map(({ match, sourceProfile, targetProfile }) => {
            return (
              <Card className="space-y-4" key={match.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {match.matchType.replaceAll("_", " ")}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-950">
                      {sourceProfile?.preferredName ?? "Source"} → {targetProfile?.preferredName ?? "Target"}
                    </h3>
                  </div>
                  <Badge variant={match.scoreBand === "high" ? "accent" : "default"}>
                    {match.score}
                  </Badge>
                </div>
                <p className="text-sm text-slate-700">{match.explanationText}</p>
              </Card>
            );
          })}
          {!matchCards.length ? (
            <Card>
              <p className="text-sm font-semibold text-slate-950">No matches in this queue</p>
              <p className="mt-1 text-sm text-slate-600">
                Try another score band or recompute matches after member profiles change.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

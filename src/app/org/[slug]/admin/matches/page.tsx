import { recomputeMatchesAction } from "@/actions/admin";
import { adminSpaceName } from "@/components/admin/admin-community-copy";
import { MatchTypeConfigForm } from "@/components/admin/match-type-config-form";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import { matchFeedbackReasonLabels } from "@/lib/match-feedback";
import type { MatchRecord, MatchType } from "@/lib/domain";
import {
  listMatchProfileRecordsForOrg,
  getMatchFeedbackSummaryForOrg,
  listMatchRunsForOrg,
  listMatchTypeConfigsForOrg,
  listSpacesForOrg,
} from "@/server/store";

function scoreBandFromQuery(value?: string) {
  return value === "high" || value === "good" || value === "emerging" ? value : undefined;
}

function scoreBandLabel(scoreBand: MatchRecord["scoreBand"]) {
  if (scoreBand === "high") return "Strong match";
  if (scoreBand === "good") return "Good match";
  return "Worth exploring";
}

function matchRunStatusLabel(status: "running" | "completed" | "failed") {
  if (status === "running") return "Updating";
  if (status === "completed") return "Updated";
  return "Needs attention";
}

interface MatchQueue {
  label: string;
  matchType?: MatchType;
  scoreBand?: MatchRecord["scoreBand"];
}

function matchQueueHref(slug: string, queue: MatchQueue) {
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
    requireConnected: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const configs = await listMatchTypeConfigsForOrg(viewer.org.id, { includeInactive: true });
  const requestedMatchType = singleQueryValue(query.match_type);
  const selectedMatchType = configs.some((config) => config.slug === requestedMatchType)
    ? requestedMatchType
    : undefined;
  const selectedScoreBand = scoreBandFromQuery(singleQueryValue(query.score_band));
  const [matchCards, runs, feedbackSummary, spaces] = await Promise.all([
    listMatchProfileRecordsForOrg(viewer.org.id, {
      limit: 20,
      matchType: selectedMatchType,
      scoreBand: selectedScoreBand,
    }),
    listMatchRunsForOrg(viewer.org.id, 5),
    getMatchFeedbackSummaryForOrg(viewer.org.id),
    listSpacesForOrg(viewer.org.id),
  ]);
  const spaceNameById = new Map(spaces.map((space) => [space.id, adminSpaceName(space)]));
  const spaceLabel = (spaceId?: string) =>
    (spaceId && spaceNameById.get(spaceId)) || "Wavesparks Community";
  const matchQueues: MatchQueue[] = [
    { label: "All" },
    { label: "Strong matches", scoreBand: "high" },
    { label: "Good matches", scoreBand: "good" },
    ...configs.map((config) => ({ label: config.name, matchType: config.slug })),
  ];
  const configBySlug = new Map(configs.map((config) => [config.slug, config]));

  return (
    <AppShell currentPath={`/org/${slug}/admin/matches`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionHeading
            eyebrow="Admin · Matches"
            level={1}
            title="Review match suggestions"
            description="See the suggestions people receive in Wavesparks Community and each Event."
          />
          <form action={recomputeMatchesAction.bind(null, slug)}>
            <SubmitButton pendingLabel="Refreshing">Refresh matches</SubmitButton>
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
                <LinkButton
                  href={matchQueueHref(slug, queue)}
                  key={queue.label}
                  size="sm"
                  variant={active ? "primary" : "secondary"}
                >
                  {queue.label}
                </LinkButton>
              );
            })}
          </div>
          {matchCards.map(({ match, sourceProfile, targetProfile }) => {
            return (
              <Card className="space-y-4" key={match.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">
                      {configBySlug.get(match.matchType)?.name ?? match.matchType.replaceAll("_", " ")}
                    </p>
                    <Badge className="mt-2" variant={match.spaceId ? "muted" : "default"}>
                      {spaceLabel(match.spaceId)}
                    </Badge>
                    <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">
                      {sourceProfile?.preferredName ?? "Member unavailable"} and {targetProfile?.preferredName ?? "Member unavailable"}
                    </h3>
                  </div>
                  <Badge variant={match.scoreBand === "high" ? "accent" : "default"}>
                    {scoreBandLabel(match.scoreBand)}
                  </Badge>
                </div>
                <p className="text-sm text-[var(--ink-soft)]">{match.explanationText}</p>
              </Card>
            );
          })}
          {!matchCards.length ? (
            <Card>
              <p className="text-sm font-semibold text-[var(--ink)]">No matches found</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Try another filter, or refresh matches after people update their profiles.
              </p>
            </Card>
          ) : null}
        </div>

        <section className="space-y-4">
          <SectionHeading
            title="Matching categories"
            description="Choose what people can look for and offer. The importance settings for each category must add up to 100."
          />
          <div className="grid gap-5 xl:grid-cols-2">
            {configs.map((config) => (
              <MatchTypeConfigForm config={config} key={config.slug} slug={slug} />
            ))}
            <MatchTypeConfigForm slug={slug} />
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeading
            title="Member feedback"
            description="See whether suggestions are useful without revealing who left the feedback. Suggestions someone dismissed will not return after a refresh."
          />
          <div className="grid border-y border-[var(--line)] sm:grid-cols-3 sm:divide-x sm:divide-[var(--line)]">
            {[
              ["Responses", feedbackSummary.total],
              ["Helpful", feedbackSummary.helpful],
              ["Not relevant", feedbackSummary.notRelevant],
            ].map(([label, value]) => (
              <div className="px-1 py-4 sm:px-5" key={String(label)}>
                <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">
                  {label}
                </p>
                <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{value}</p>
              </div>
            ))}
          </div>
          {feedbackSummary.byMatchType.length ? (
            <div className="divide-y divide-[var(--line)] border-b border-[var(--line)]">
              {feedbackSummary.byMatchType.map((item) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  key={item.matchType}
                >
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {configBySlug.get(item.matchType)?.name ?? item.matchType.replaceAll("_", " ")}
                  </p>
                  <p className="text-sm text-[var(--ink-soft)]">
                    {item.helpful} helpful · {item.notRelevant} not relevant
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-soft)]">No feedback recorded yet.</p>
          )}
          {feedbackSummary.reasons.length ? (
            <p className="text-sm text-[var(--ink-soft)]">
              Top reasons: {feedbackSummary.reasons
                .slice(0, 4)
                .map(
                  ({ reason, count }) =>
                    `${matchFeedbackReasonLabels[reason as keyof typeof matchFeedbackReasonLabels] ?? reason} (${count})`,
                )
                .join(", ")}
            </p>
          ) : null}
        </section>

        <section className="space-y-4">
          <SectionHeading title="Recent updates" />
          <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {runs.map((run) => (
              <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={run.id}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {matchRunStatusLabel(run.status)}
                    </p>
                    <Badge variant={run.spaceId ? "muted" : "default"}>
                      {spaceLabel(run.spaceId)}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--ink-soft)]">
                    {new Date(run.startedAt).toLocaleString("en-SG")}
                  </p>
                </div>
                <p className="text-sm text-[var(--ink-soft)]">
                  {Number(run.metadata.matches ?? 0)} matches
                  {Number(run.metadata.embeddingsDegraded ?? 0) > 0
                    ? ` · Standard profile matching used for ${Number(run.metadata.embeddingsDegraded ?? 0)} profiles`
                    : ""}
                </p>
              </div>
            ))}
            {!runs.length ? (
              <p className="py-4 text-sm text-[var(--ink-soft)]">Matches have not been refreshed yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

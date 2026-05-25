import { recomputeMatchesAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { getProfileById, listMatchesForOrg } from "@/server/store";

export default async function AdminMatchesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const matches = (await listMatchesForOrg(viewer.org.id)).slice(0, 20);
  const matchCards = await Promise.all(
    matches.map(async (match) => ({
      match,
      sourceProfile: await getProfileById(match.sourceProfileId),
      targetProfile: await getProfileById(match.targetProfileId),
    })),
  );

  return (
    <AppShell currentPath={`/org/${slug}/admin/matches`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionHeading
            eyebrow="Admin · Matches"
            title="Review generated matches and recompute"
            description="The ranking stays deterministic and explainable. Admins can trigger a full refresh when profiles change."
          />
          <form action={recomputeMatchesAction.bind(null, slug)}>
            <Button type="submit">Recompute matches</Button>
          </form>
        </div>

        <div className="space-y-4">
          {matchCards.map(({ match, sourceProfile, targetProfile }) => {
            return (
              <Card className="space-y-4" key={match.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
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
        </div>
      </div>
    </AppShell>
  );
}

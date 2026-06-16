import { AppShell } from "@/components/layout/app-shell";
import { AnalyticsBars } from "@/components/community/analytics-bars";
import { MetricCard } from "@/components/community/metric-card";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { getAdminOverviewData } from "@/server/store";

export default async function AdminOverviewPage({
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

  const { analytics, recentPosts, recentRequests } = await getAdminOverviewData(viewer.org.id);

  return (
    <AppShell currentPath={`/org/${slug}/admin`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin"
          level={1}
          title="Community command center"
          description="See approvals, content health, intro flow, and activation without breaking the product’s privacy model."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Approved members" value={analytics.approvedMembers} />
          <MetricCard label="Completed profiles" value={analytics.completedProfiles} />
          <MetricCard label="Intro accepts" value={analytics.introRequestsAccepted} />
          <MetricCard label="Weekly posters" value={analytics.activeWeeklyPosters} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <AnalyticsBars
            points={analytics.dailySeries.map((entry) => ({
              date: entry.date,
              value: entry.posts + entry.comments + entry.introRequests,
            }))}
          />
          <Card className="space-y-4">
            <h3 className="text-xl font-semibold text-[var(--ink)]">Recent intro flow</h3>
            <div className="space-y-3">
              {recentRequests.map((request) => (
                <div
                  className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4"
                  key={request.id}
                >
                  <p className="font-semibold text-[var(--ink)]">{request.introPurpose}</p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">{request.status}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="space-y-4">
          <h3 className="text-xl font-semibold text-[var(--ink)]">Recent posts</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {recentPosts.map((post) => (
              <div
                className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4"
                key={post.id}
              >
                <p className="font-semibold text-[var(--ink)]">{post.title}</p>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">{post.type.replaceAll("_", " ")}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

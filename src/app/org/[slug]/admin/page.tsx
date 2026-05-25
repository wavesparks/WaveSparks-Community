import { AppShell } from "@/components/layout/app-shell";
import { AnalyticsBars } from "@/components/community/analytics-bars";
import { MetricCard } from "@/components/community/metric-card";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { getAnalyticsSnapshot, listIntroRequestsForOrg, listPostsForOrg } from "@/server/store";

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

  const analytics = await getAnalyticsSnapshot(viewer.org.id);
  const recentPosts = (await listPostsForOrg(viewer.org.id)).slice(0, 4);
  const recentRequests = (await listIntroRequestsForOrg(viewer.org.id)).slice(0, 4);

  return (
    <AppShell currentPath={`/org/${slug}/admin`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin"
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
            <h3 className="text-2xl font-semibold text-slate-950">Recent intro flow</h3>
            <div className="space-y-3">
              {recentRequests.map((request) => (
                <div className="rounded-[24px] bg-slate-50 p-4" key={request.id}>
                  <p className="font-semibold text-slate-900">{request.introPurpose}</p>
                  <p className="mt-1 text-sm text-slate-600">{request.status}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="space-y-4">
          <h3 className="text-2xl font-semibold text-slate-950">Recent posts</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {recentPosts.map((post) => (
              <div className="rounded-[24px] bg-slate-50 p-4" key={post.id}>
                <p className="font-semibold text-slate-900">{post.title}</p>
                <p className="mt-2 text-sm text-slate-600">{post.type.replaceAll("_", " ")}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

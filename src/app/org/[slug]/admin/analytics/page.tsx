import { AnalyticsBars } from "@/components/community/analytics-bars";
import { MetricCard } from "@/components/community/metric-card";
import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { getAnalyticsSnapshot, listMembershipsForOrg } from "@/server/store";

export default async function AdminAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireConnected: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const [analytics, memberships] = await Promise.all([
    getAnalyticsSnapshot(viewer.org.id),
    listMembershipsForOrg(viewer.org.id),
  ]);
  const connectedAccounts = memberships.filter(
    (membership) => membership.accountStatus === "connected",
  ).length;

  return (
    <AppShell currentPath={`/org/${slug}/admin/analytics`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin · Analytics"
          level={1}
          title="Activation, engagement, and outcomes"
          description="Organization-wide account and activity totals across all Spaces. Use a Space detail page for an isolated Event or Main Community view."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Connected accounts" value={connectedAccounts} />
          <MetricCard label="Profiles completed" value={analytics.completedProfiles} />
          <MetricCard label="Intro requests sent" value={analytics.introRequestsSent} />
          <MetricCard label="Teams formed" value={analytics.teamsFormed} />
        </div>
        <AnalyticsBars
          points={analytics.dailySeries.map((entry) => ({
            date: entry.date,
            value: entry.posts + entry.comments + entry.acceptedIntros,
          }))}
        />
      </div>
    </AppShell>
  );
}

import { AnalyticsBars } from "@/components/community/analytics-bars";
import { MetricCard } from "@/components/community/metric-card";
import { AppShell } from "@/components/layout/app-shell";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { getAnalyticsSnapshot } from "@/server/store";

export default async function AdminAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireCompleteProfile: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const analytics = getAnalyticsSnapshot(viewer.org.id);

  return (
    <AppShell currentPath={`/org/${slug}/admin/analytics`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin · Analytics"
          title="Activation, engagement, and outcomes"
          description="These are the first-class health signals for a warm founder community: onboarding completion, posting, intros, and outcomes."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Signups approved" value={analytics.approvedMembers} />
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

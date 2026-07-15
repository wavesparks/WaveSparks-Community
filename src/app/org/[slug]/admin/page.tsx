import { AppShell } from "@/components/layout/app-shell";
import { AnalyticsBars } from "@/components/community/analytics-bars";
import { MetricCard } from "@/components/community/metric-card";
import { adminSpaceName } from "@/components/admin/admin-community-copy";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { postTypeLabel } from "@/lib/post-copy";
import {
  getAdminOverviewData,
  listMembershipsForOrg,
  listSpacesForOrg,
} from "@/server/store";

function introductionStatusLabel(status: string) {
  if (status === "pending") return "Awaiting response";
  if (status === "accepted") return "Accepted";
  if (status === "declined") return "Declined";
  if (status === "expired") return "Expired";
  return status.replaceAll("_", " ");
}

export default async function AdminOverviewPage({
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

  const [{ analytics, recentPosts, recentRequests }, memberships, spaces] =
    await Promise.all([
      getAdminOverviewData(viewer.org.id),
      listMembershipsForOrg(viewer.org.id),
      listSpacesForOrg(viewer.org.id),
    ]);
  const connectedAccounts = memberships.filter(
    (membership) => membership.accountStatus === "connected",
  ).length;
  const spaceNameById = new Map(spaces.map((space) => [space.id, adminSpaceName(space)]));

  return (
    <AppShell currentPath={`/org/${slug}/admin`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin"
          level={1}
          title="Community overview"
          description="See how people are joining and taking part across Wavesparks Community and your Events."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Connected accounts" value={connectedAccounts} />
          <MetricCard label="Completed profiles" value={analytics.completedProfiles} />
          <MetricCard label="Introductions accepted" value={analytics.introRequestsAccepted} />
          <MetricCard label="People posting this week" value={analytics.activeWeeklyPosters} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <AnalyticsBars
            points={analytics.dailySeries.map((entry) => ({
              date: entry.date,
              value: entry.posts + entry.comments + entry.introRequests,
            }))}
          />
          <Card className="space-y-4">
            <h3 className="text-xl font-semibold text-[var(--ink)]">Recent introductions</h3>
            <div className="space-y-3">
              {recentRequests.map((request) => (
                <div
                  className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4"
                  key={request.id}
                >
                  <p className="font-semibold text-[var(--ink)]">{request.introPurpose}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="muted">
                      {request.spaceId
                        ? spaceNameById.get(request.spaceId) ?? "Unknown community or event"
                        : "Wavesparks Community"}
                    </Badge>
                    <Badge>{introductionStatusLabel(request.status)}</Badge>
                  </div>
                </div>
              ))}
              {!recentRequests.length ? (
                <p className="text-sm text-[var(--ink-soft)]">No recent introductions.</p>
              ) : null}
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
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="muted">
                    {post.spaceId
                      ? spaceNameById.get(post.spaceId) ?? "Unknown community or Event"
                      : "Wavesparks Community"}
                  </Badge>
                  <Badge>{postTypeLabel(post.type)}</Badge>
                </div>
              </div>
            ))}
            {!recentPosts.length ? (
              <p className="text-sm text-[var(--ink-soft)]">No recent posts.</p>
            ) : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

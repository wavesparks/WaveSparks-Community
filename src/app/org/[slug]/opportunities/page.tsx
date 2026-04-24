import { AppShell } from "@/components/layout/app-shell";
import { PostCard } from "@/components/community/post-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { getFeedViewsForOrg } from "@/server/view-models";

export default async function OpportunitiesPage({
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

  const posts = getFeedViewsForOrg(viewer.org, undefined, true);

  return (
    <AppShell currentPath={`/org/${slug}/opportunities`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Opportunities"
          title="Open asks, talent needs, and mentor requests"
          description="This view filters the feed down to the posts that most often turn into intros."
        />
        <div className="space-y-6">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} slug={slug} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

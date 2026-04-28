import Link from "next/link";
import { PlusCircle } from "lucide-react";

import { FilterBar } from "@/components/community/filter-bar";
import { AppShell } from "@/components/layout/app-shell";
import { PostCard } from "@/components/community/post-card";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { parseFeedFilters } from "@/lib/feed-filters";
import { getFeedViewsForOrg } from "@/server/view-models";

export default async function FeedPage({
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
    requireCompleteProfile: true,
  });

  if (!viewer) {
    return null;
  }

  const filters = parseFeedFilters(query);
  const allPosts = await getFeedViewsForOrg(viewer.org, {
    viewerMembershipId: viewer.membership.id,
    filters,
  });
  const recommendedPosts = filters.recommendedOnly
    ? []
    : (await getFeedViewsForOrg(viewer.org, {
        viewerMembershipId: viewer.membership.id,
        filters: { ...filters, recommendedOnly: true },
      })).slice(0, 3);
  const pinnedIds = new Set(recommendedPosts.map((post) => post.id));
  const posts = filters.recommendedOnly
    ? allPosts
    : allPosts.filter((post) => !pinnedIds.has(post.id));

  return (
    <AppShell currentPath={`/org/${slug}/feed`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            eyebrow="Feed"
            title="What the community is building right now"
            description="Posts are the visible surface area. Members discover each other through useful context, not open browsing."
          />
          <Button asChild size="sm">
            <Link href={`/org/${slug}/compose?kind=feed`} title="Create post">
              <PlusCircle className="size-4" />
              Post
            </Link>
          </Button>
        </div>

        <div className="space-y-6">
          <FilterBar clearHref={`/org/${slug}/feed`} filters={filters} />

          {recommendedPosts.length ? (
            <section className="space-y-4">
              <SectionHeading
                eyebrow="Recommended for you"
                title="New posts from followed and matched members"
              />
              <div className="space-y-4">
                {recommendedPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    slug={slug}
                    viewerMembershipId={viewer.membership.id}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              slug={slug}
              viewerMembershipId={viewer.membership.id}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

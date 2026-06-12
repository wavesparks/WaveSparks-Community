import Link from "next/link";
import { PlusCircle } from "lucide-react";

import { ActivationChecklistCard } from "@/components/community/activation-checklist-card";
import { FilterBar } from "@/components/community/filter-bar";
import { ForumShell } from "@/components/layout/forum-shell";
import { PostCard } from "@/components/community/post-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getOrganizationViewerContext } from "@/lib/auth";
import { parseFeedFilters, pathWithQuery, singleQueryValue } from "@/lib/feed-filters";
import { canAccessFeed } from "@/server/permissions";
import { getFeedViewsForOrg, getMemberActivationState } from "@/server/view-models";

export default async function FeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const { org, viewer } = await getOrganizationViewerContext(slug);
  const viewerCanInteract = viewer ? canAccessFeed(viewer.membership, viewer.profile) : false;
  const parsedFilters = parseFeedFilters(query);
  const filters = viewerCanInteract
    ? parsedFilters
    : { ...parsedFilters, recommendedOnly: false };

  const [activation, allPosts] = await Promise.all([
    viewerCanInteract && viewer?.profile
      ? getMemberActivationState(viewer.org.id, viewer.membership.id, viewer.profile, slug)
      : Promise.resolve(null),
    getFeedViewsForOrg(org, {
      viewerMembershipId: viewerCanInteract ? viewer?.membership.id : undefined,
      viewerProfileId: viewerCanInteract ? viewer?.profile?.id : undefined,
      filters,
      includeMatchedRecommendationSignals: viewerCanInteract,
      limit: 60,
    }),
  ]);
  const recommendedPosts = filters.recommendedOnly || !viewerCanInteract
    ? []
    : allPosts.filter((post) => post.isRecommended).slice(0, 3);
  const pinnedIds = new Set(recommendedPosts.map((post) => post.id));
  const posts = filters.recommendedOnly
    ? allPosts
    : allPosts.filter((post) => !pinnedIds.has(post.id));
  const returnPath = pathWithQuery(`/org/${slug}/feed`, query);

  return (
    <ForumShell currentPath={`/org/${slug}/feed`} org={org} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            eyebrow="Forum"
            level={1}
            title="Wavespark Forum"
            description="Browse the live community feed. Sign in to post, reply, follow members, or request intros."
          />
          {viewerCanInteract ? (
            <Button asChild size="sm">
              <Link href={`/org/${slug}/compose?kind=feed`} title="Create post">
                <PlusCircle className="size-4" />
                Post
              </Link>
            </Button>
          ) : null}
        </div>

        <StatusBanner status={singleQueryValue(query.status)} />
        {activation ? <ActivationChecklistCard activation={activation} /> : null}

        <div className="space-y-6">
          <FilterBar
            clearHref={`/org/${slug}/feed`}
            filters={filters}
            showRecommendedFilter={viewerCanInteract}
          />

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
                    returnPath={returnPath}
                    slug={slug}
                    viewerMembershipId={viewerCanInteract ? viewer?.membership.id : undefined}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              returnPath={returnPath}
              slug={slug}
              viewerMembershipId={viewerCanInteract ? viewer?.membership.id : undefined}
            />
          ))}
          {!recommendedPosts.length && !posts.length ? (
            <Card>
              <p className="text-sm font-semibold text-slate-950">No posts found</p>
              <p className="mt-1 text-sm text-slate-600">
                Try clearing filters or publish the first useful update for this view.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </ForumShell>
  );
}

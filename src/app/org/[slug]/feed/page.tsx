import Link from "next/link";
import { PlusCircle } from "lucide-react";
import type { CSSProperties } from "react";

import { ActivationChecklistCard } from "@/components/community/activation-checklist-card";
import { FilterBar } from "@/components/community/filter-bar";
import { ForumShell } from "@/components/layout/forum-shell";
import { PostCard } from "@/components/community/post-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getOrganizationViewerContext } from "@/lib/auth";
import { wavesparksBrand } from "@/lib/brand";
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
        <section
          className="overflow-hidden rounded-lg bg-[var(--night)] text-white shadow-[0_24px_70px_rgba(1,2,10,0.22)]"
          style={
            {
              backgroundImage: `linear-gradient(90deg, rgba(1,2,10,0.88), rgba(1,2,10,0.66), rgba(1,2,10,0.22)), url(${wavesparksBrand.heroImageUrl})`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            } as CSSProperties
          }
        >
          <div className="flex min-h-[310px] flex-col justify-end p-6 sm:p-8 lg:p-10">
            <div className="max-w-3xl space-y-5">
              <SectionHeading
                eyebrow="Asia’s launchpad · community signal"
                level={1}
                title="Wavespark Forum"
                description="Browse founder signals from the Wavesparks network. Members sign in only when they’re ready to post, reply, follow builders, or request warm intros."
                tone="inverse"
              />
              <div className="flex flex-wrap gap-3">
                {viewerCanInteract ? (
                  <Button asChild>
                    <Link href={`/org/${slug}/compose?kind=feed`} title="Create post">
                      <PlusCircle className="size-4" />
                      Post
                    </Link>
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href="#latest-posts">Read latest posts</Link>
                  </Button>
                )}
                <Button asChild variant="secondary">
                  <Link href={viewerCanInteract ? `/org/${slug}/matches` : `/org/${slug}/signin`}>
                    {viewerCanInteract ? "Open matches" : "Member access"}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <StatusBanner status={singleQueryValue(query.status)} />
        {activation ? <ActivationChecklistCard activation={activation} /> : null}

        <div className="space-y-6" id="latest-posts">
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

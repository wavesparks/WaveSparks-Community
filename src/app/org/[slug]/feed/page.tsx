import Link from "next/link";
import {
  ArrowRight,
  LockKeyhole,
  MessageSquarePlus,
  SearchX,
  Sparkles,
} from "lucide-react";

import { ActivationChecklistCard } from "@/components/community/activation-checklist-card";
import { FilterBar } from "@/components/community/filter-bar";
import { ForumShell } from "@/components/layout/forum-shell";
import { PostCard } from "@/components/community/post-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getOrganizationViewerContext } from "@/lib/auth";
import {
  hasFeedFilters,
  parseFeedFilters,
  pathWithQuery,
  singleQueryValue,
} from "@/lib/feed-filters";
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
  const activeFilterCount = hasFeedFilters(filters);
  const totalDisplayedPosts = recommendedPosts.length + posts.length;
  const memberSetupHref = viewer
    ? viewer.membership.status === "approved"
      ? `/org/${slug}/onboarding`
      : `/org/${slug}/pending`
    : `/org/${slug}/signin`;
  const primaryAction = viewerCanInteract
    ? {
        href: `/org/${slug}/compose?kind=feed`,
        label: "Create post",
        icon: MessageSquarePlus,
      }
    : viewer
      ? {
          href: memberSetupHref,
          label: viewer.membership.status === "approved" ? "Complete profile" : "View application",
          icon: ArrowRight,
        }
      : {
          href: `/org/${slug}/signin`,
          label: "Unlock interaction",
          icon: LockKeyhole,
        };
  const PrimaryActionIcon = primaryAction.icon;

  return (
    <ForumShell currentPath={`/org/${slug}/feed`} org={org} viewer={viewer}>
      <div className="space-y-5">
        <section className="border-b border-[var(--line)] pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              eyebrow="Community signal"
              level={1}
              title="Wavespark Forum"
              description="Read founder asks, updates, opportunities, and warm-intro signals directly. Sign in is only required when you post, follow, reply, or request an intro."
            />
            <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
              <Button asChild>
                <Link href={primaryAction.href}>
                  <PrimaryActionIcon className="size-4" />
                  {primaryAction.label}
                </Link>
              </Button>
              {viewerCanInteract ? (
                <Button asChild variant="secondary">
                  <Link href={`/org/${slug}/matches`}>
                    <Sparkles className="size-4" />
                    Matches
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]">
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-[var(--line)]">
              {totalDisplayedPosts || allPosts.length} visible posts
            </span>
            <span className="rounded-full bg-white px-3 py-1 ring-1 ring-[var(--line)]">
              {viewerCanInteract
                ? "Posting enabled"
                : viewer
                  ? "Profile required to interact"
                  : "Public reading enabled"}
            </span>
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
            <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <SearchX className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {activeFilterCount
                      ? "No posts match these filters"
                      : viewerCanInteract
                        ? "No posts have been published yet"
                        : viewer
                          ? "Complete your profile to unlock interaction"
                          : "The public forum is ready for posts"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                    {activeFilterCount
                      ? "Clear the filters to return to the main forum view."
                      : viewerCanInteract
                        ? "Start the first useful thread for this community."
                        : viewer
                          ? "You can browse now. Finish your profile when you want to post, follow, reply, or request intros."
                          : "You can browse without an account. Sign in when you are ready to interact."}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                {activeFilterCount ? (
                  <Button asChild variant="secondary">
                    <Link href={`/org/${slug}/feed`}>Clear filters</Link>
                  </Button>
                ) : null}
                <Button asChild>
                  <Link href={primaryAction.href}>
                    <PrimaryActionIcon className="size-4" />
                    {primaryAction.label}
                  </Link>
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </ForumShell>
  );
}

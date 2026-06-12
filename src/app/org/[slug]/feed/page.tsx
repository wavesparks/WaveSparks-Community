import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  LockKeyhole,
  MessageSquarePlus,
  SearchX,
  Sparkles,
} from "lucide-react";

import { ActivationChecklistCard } from "@/components/community/activation-checklist-card";
import { ChannelShortcutBar } from "@/components/community/channel-shortcut-bar";
import { FilterBar } from "@/components/community/filter-bar";
import { ForumShell } from "@/components/layout/forum-shell";
import { PostCard } from "@/components/community/post-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getOrganizationViewerContext } from "@/lib/auth";
import { wavesparksAssets } from "@/lib/brand";
import { getCommunityChannels } from "@/lib/channels";
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
  const channels = getCommunityChannels(slug);
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
        <section className="ws-hero-art relative overflow-hidden rounded-lg px-5 py-6 text-white shadow-[0_28px_80px_rgba(34,27,68,0.22)] sm:p-7 lg:p-8">
          <div className="absolute right-6 top-5 hidden h-20 w-20 opacity-80 sm:block sm:h-24 sm:w-24">
            <Image
              alt=""
              aria-hidden="true"
              fill
              priority
              sizes="96px"
              src={wavesparksAssets.sparkGroup}
            />
          </div>
          <div className="relative z-10 grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div className="space-y-5">
              <SectionHeading
                eyebrow="Community signal"
                level={1}
                title="Wavespark Forum"
                description="Read founder asks, updates, opportunities, and warm-intro signals directly. Sign in is only required when you post, follow, reply, or request an intro."
                tone="inverse"
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  asChild
                  className="bg-white text-[var(--night)] ring-white/20 hover:bg-[var(--cyan-soft)]"
                >
                  <Link href={primaryAction.href}>
                    <PrimaryActionIcon className="size-4" />
                    {primaryAction.label}
                  </Link>
                </Button>
                {viewerCanInteract ? (
                  <Button
                    asChild
                    className="bg-white/[0.12] text-white ring-white/20 hover:bg-white/20"
                    variant="secondary"
                  >
                    <Link href={`/org/${slug}/matches`}>
                      <Sparkles className="size-4" />
                      Matches
                    </Link>
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-white/[0.82]">
                <span className="rounded-full bg-white/[0.12] px-3 py-1 ring-1 ring-white/15">
                  {totalDisplayedPosts || allPosts.length} visible posts
                </span>
                <span className="rounded-full bg-white/[0.12] px-3 py-1 ring-1 ring-white/15">
                  {viewerCanInteract
                    ? "Posting enabled"
                    : viewer
                      ? "Profile required to interact"
                      : "Public reading enabled"}
                </span>
              </div>
            </div>

            <div className="relative min-h-[230px] overflow-hidden rounded-lg border border-white/[0.12] bg-white/[0.06] shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
              <Image
                alt=""
                aria-hidden="true"
                className="object-cover opacity-90"
                fill
                priority
                sizes="(min-width: 1024px) 470px, 100vw"
                src={wavesparksAssets.overview}
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(34,27,68,0.08),rgba(34,27,68,0.02))]" />
            </div>
          </div>
        </section>

        <StatusBanner status={singleQueryValue(query.status)} />
        {activation ? <ActivationChecklistCard activation={activation} /> : null}
        {viewerCanInteract ? <ChannelShortcutBar channels={channels} /> : null}

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

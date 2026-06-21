import Link from "next/link";
import {
  BookOpen,
  MessageSquarePlus,
  SearchX,
  Sparkles,
  UsersRound,
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
import { getCommunityChannels } from "@/lib/channels";
import {
  hasFeedFilters,
  parseFeedFilters,
  pathWithQuery,
  singleQueryValue,
} from "@/lib/feed-filters";
import { canAccessFeed } from "@/server/permissions";
import { getFeedViewsForOrg, getMemberActivationState } from "@/server/view-models";

function RailPanel({
  title,
  value,
  body,
}: {
  title: string;
  value: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <p className="text-xs font-semibold uppercase text-[var(--accent)]">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{body}</p>
    </div>
  );
}

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

  return (
    <ForumShell currentPath={`/org/${slug}/feed`} org={org} viewer={viewer}>
      <div className="space-y-5">
        <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_10px_32px_rgba(34,27,68,0.06)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeading
              eyebrow="Community signal"
              level={1}
              title="Wavespark Forum"
              description="Founder asks, updates, resources, opportunities, and warm-intro signals from the approved network."
            />
            {viewerCanInteract ? (
              <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                <Button asChild>
                  <Link href={`/org/${slug}/compose?kind=feed`}>
                    <MessageSquarePlus className="size-4" />
                    Create post
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href={`/org/${slug}/matches`}>
                    <Sparkles className="size-4" />
                    Matches
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2">
              <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Visible</p>
              <p className="font-semibold text-[var(--ink)]">
                {totalDisplayedPosts || allPosts.length} posts
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2">
              <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Access</p>
              <p className="font-semibold text-[var(--ink)]">
                {viewerCanInteract
                  ? "Posting enabled"
                  : viewer
                    ? "Profile required"
                    : "Public reading"}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2">
              <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Focus</p>
              <p className="font-semibold text-[var(--ink)]">Asks, intros, resources</p>
            </div>
          </div>
        </section>

        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]" id="latest-posts">
          <div className="space-y-5">
            {activation ? <ActivationChecklistCard activation={activation} /> : null}
            <FilterBar
              clearHref={`/org/${slug}/feed`}
              filters={filters}
              showRecommendedFilter={viewerCanInteract}
            />

            {recommendedPosts.length ? (
              <section className="space-y-3">
                <SectionHeading
                  eyebrow="Recommended"
                  title="Followed and matched member posts"
                />
                <div className="space-y-3">
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

            <div className="space-y-3">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  returnPath={returnPath}
                  slug={slug}
                  viewerMembershipId={viewerCanInteract ? viewer?.membership.id : undefined}
                />
              ))}
            </div>
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
                {activeFilterCount ? (
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <Button asChild variant="secondary">
                      <Link href={`/org/${slug}/feed`}>Clear filters</Link>
                    </Button>
                  </div>
                ) : null}
              </Card>
            ) : null}
          </div>

          <aside className="space-y-3 xl:sticky xl:top-24 xl:self-start">
            <RailPanel
              title="Directory"
              value="People"
              body="Search approved founders, mentors, operators, skills, needs, and locations."
            />
            <div className="grid gap-2">
              <Button asChild variant="secondary">
                <Link href={`/org/${slug}/people`}>
                  <UsersRound className="size-4" />
                  Founder directory
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={`/org/${slug}/knowledge`}>
                  <BookOpen className="size-4" />
                  Knowledge library
                </Link>
              </Button>
            </div>
            <RailPanel
              title="Intro layer"
              value={viewerCanInteract ? "Unlocked" : "Gated"}
              body={
                viewerCanInteract
                  ? "Follow members, save knowledge, and request warm intros from posts."
                  : "Public reading stays open while posting, following, and intros remain member-gated."
              }
            />
            {viewerCanInteract ? (
              <ChannelShortcutBar channels={channels} title="Channels" />
            ) : null}
          </aside>
        </div>
      </div>
    </ForumShell>
  );
}

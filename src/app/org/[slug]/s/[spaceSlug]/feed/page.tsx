import { MessageSquarePlus, SearchX, Sparkles, UsersRound } from "lucide-react";

import { FilterBar } from "@/components/community/filter-bar";
import { PostCard } from "@/components/community/post-card";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import {
  hasFeedFilters,
  parseFeedFilters,
  pathWithQuery,
  singleQueryValue,
} from "@/lib/feed-filters";
import {
  getCommunityDisplayName,
  getCommunityPeopleLabels,
} from "@/lib/community-copy";
import { getSpaceViewerContext } from "@/lib/space-auth";
import { getFeedViewsForSpace } from "@/server/view-models";

export default async function SpaceFeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; spaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug, spaceSlug }, query] = await Promise.all([params, searchParams]);
  const context = await getSpaceViewerContext(slug, spaceSlug, {
    requireAccess: true,
    requireAuth: true,
  });
  const { space, viewer } = context;
  const communityName = getCommunityDisplayName(space);
  const { plural: peopleLabel } = getCommunityPeopleLabels(space);
  const filters = parseFeedFilters(query);
  const basePath = `/org/${slug}/s/${space.slug}/feed`;
  const returnPath = pathWithQuery(basePath, query);
  const allPosts = await getFeedViewsForSpace(space.id, viewer.org, {
    viewerMembershipId: viewer.membership.id,
    viewerProfileId: viewer.profile?.id,
    filters,
    includeMatchedRecommendationSignals: context.canMatch,
    limit: 60,
  });
  const recommendedPosts = filters.recommendedOnly
    ? []
    : allPosts.filter((post) => post.isRecommended).slice(0, 3);
  const recommendedIds = new Set(recommendedPosts.map((post) => post.id));
  const posts = filters.recommendedOnly
    ? allPosts
    : allPosts.filter((post) => !recommendedIds.has(post.id));
  const activeFilters = hasFeedFilters(filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeading
          description={`Latest updates, questions, resources, and conversations from ${communityName}.`}
          eyebrow="Feed"
          level={1}
          title={`Updates from ${communityName}`}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          {context.canInteract ? (
            <LinkButton href={`/org/${slug}/s/${space.slug}/compose?kind=feed`}>
              <MessageSquarePlus className="size-4" />
              Create post
            </LinkButton>
          ) : null}
          <LinkButton
            href={`/org/${slug}/s/${space.slug}/matches`}
            variant="secondary"
          >
            <Sparkles className="size-4" />
            View matches
          </LinkButton>
        </div>
      </div>

      <StatusBanner spaceName={communityName} status={singleQueryValue(query.status)} />

      {!context.canInteract ? (
        <Card className="flex flex-col gap-4 border-amber-500/25 bg-amber-50 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-[var(--ink)]">
              You can browse now and join in after completing your profile
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
              Complete your profile to post, comment, follow people, save posts and
              request introductions.
            </p>
          </div>
          <LinkButton
            className="shrink-0"
            href={`/org/${slug}/onboarding?space=${encodeURIComponent(space.slug)}`}
            variant="secondary"
          >
            Complete profile
          </LinkButton>
        </Card>
      ) : null}

      <FilterBar
        clearHref={basePath}
        filters={filters}
        peopleLabel={peopleLabel}
        showRecommendedFilter={context.canMatch}
      />

      {recommendedPosts.length ? (
        <section
          aria-label={`Recommended posts for ${communityName}`}
          className="space-y-3"
        >
          <SectionHeading
            eyebrow="For you"
            title="From people you follow and your matches"
          />
          <div className="space-y-3">
            {recommendedPosts.map((post) => (
              <PostCard
                key={post.id}
                peopleLabel={peopleLabel}
                post={post}
                returnPath={returnPath}
                slug={slug}
                spaceId={space.id}
                spaceSlug={space.slug}
                viewerMembershipId={
                  context.canInteract ? viewer.membership.id : undefined
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="space-y-3">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            peopleLabel={peopleLabel}
            post={post}
            returnPath={returnPath}
            slug={slug}
            spaceId={space.id}
            spaceSlug={space.slug}
            viewerMembershipId={context.canInteract ? viewer.membership.id : undefined}
          />
        ))}
      </div>

      {!recommendedPosts.length && !posts.length ? (
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <SearchX className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
            <div>
              <p className="font-semibold text-[var(--ink)]">
                {activeFilters
                  ? "No posts match these filters"
                  : `No posts in ${communityName} yet`}
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                {activeFilters
                  ? "Clear the filters to see every post again."
                  : context.canInteract
                    ? `Start the first conversation in ${communityName}.`
                    : `New posts from ${communityName} will appear here.`}
              </p>
            </div>
          </div>
          {activeFilters ? (
            <LinkButton className="shrink-0" href={basePath} variant="secondary">
              Clear filters
            </LinkButton>
          ) : context.canInteract ? (
            <LinkButton
              className="shrink-0"
              href={`/org/${slug}/s/${space.slug}/compose`}
            >
              Create post
            </LinkButton>
          ) : null}
        </Card>
      ) : null}

      <Card className="flex flex-col gap-3 bg-[var(--surface-muted)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-[var(--ink)]">Who can see this?</p>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
            Only active {peopleLabel} in {communityName} can see these posts.
          </p>
        </div>
        <LinkButton
          className="shrink-0"
          href={`/org/${slug}/s/${space.slug}/people`}
          variant="secondary"
        >
          <UsersRound className="size-4" />
          View people
        </LinkButton>
      </Card>
    </div>
  );
}

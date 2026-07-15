import Link from "next/link";
import { PlusCircle } from "lucide-react";

import { FilterBar } from "@/components/community/filter-bar";
import { PostCard } from "@/components/community/post-card";
import { NavPendingIndicator } from "@/components/layout/nav-pending-indicator";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import {
  getCommunityDisplayName,
  getCommunityPeopleLabels,
} from "@/lib/community-copy";
import { parseFeedFilters, pathWithQuery, singleQueryValue } from "@/lib/feed-filters";
import { getSpaceViewerContext } from "@/lib/space-auth";
import { cn } from "@/lib/utils";
import type { FeedFilters } from "@/server/view-models";
import { getFeedViewsForSpace } from "@/server/view-models";

export default async function SpaceOpportunitiesPage({
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
  const layers = [
    { source: "official", label: "From organizers" },
    { source: "member", label: `From ${peopleLabel}` },
    { source: "mentor", label: "From mentors" },
  ] as const;
  const rawSource = singleQueryValue(query.source) ?? "official";
  const source: FeedFilters["opportunitySource"] =
    rawSource === "member" || rawSource === "mentor" || rawSource === "all"
      ? rawSource
      : "official";
  const filters = parseFeedFilters(query, {
    includeOpportunitySource: true,
    defaultOpportunitySource: "official",
  });
  const basePath = `/org/${slug}/s/${space.slug}/opportunities`;
  const posts = await getFeedViewsForSpace(space.id, viewer.org, {
    viewerMembershipId: viewer.membership.id,
    viewerProfileId: viewer.profile?.id,
    filters,
    includeMatchedRecommendationSignals: false,
    onlyOpportunities: true,
    limit: 60,
  });
  const visibleLayers = source !== "all"
    ? layers.filter((layer) => layer.source === source)
    : layers;
  const returnPath = pathWithQuery(basePath, query);
  const layerLinks = [...layers, { source: "all", label: "All sources" }] as const;
  const hrefForSource = (nextSource: (typeof layerLinks)[number]["source"]) => {
    const nextParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string" && value && key !== "status") nextParams.set(key, value);
    }
    if (nextSource === "official") nextParams.delete("source");
    else nextParams.set("source", nextSource);
    const suffix = nextParams.toString();
    return `${basePath}${suffix ? `?${suffix}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          description={`Opportunities and requests shared by organizers, ${peopleLabel} and mentors in ${communityName}.`}
          eyebrow="Opportunities"
          level={1}
          title={`Opportunities in ${communityName}`}
        />
        {context.canInteract ? (
          <LinkButton href={`/org/${slug}/s/${space.slug}/compose?kind=opportunity`} size="sm">
            <PlusCircle className="size-4" />
            Share opportunity
          </LinkButton>
        ) : null}
      </div>
      <StatusBanner spaceName={communityName} status={singleQueryValue(query.status)} />

      <div className="flex flex-wrap gap-2">
        {layerLinks.map((layer) => (
          <Link
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-[var(--line)] transition duration-150 ease-out active:translate-y-px active:scale-[0.99]",
              source === layer.source
                ? "bg-[var(--accent)] text-[var(--surface)] ring-transparent"
                : "bg-[var(--surface)] text-[var(--ink-soft)] hover:bg-[var(--surface-muted)]",
            )}
            href={hrefForSource(layer.source)}
            key={layer.source}
          >
            {layer.label}
            <NavPendingIndicator className="size-1.5" />
          </Link>
        ))}
      </div>

      <FilterBar
        clearHref={basePath}
        defaultOpportunitySource="official"
        filters={filters}
        opportunityMode
        peopleLabel={peopleLabel}
      />

      <div className="space-y-6">
        {visibleLayers.map((layer) => {
          const layerPosts = posts.filter((post) => post.opportunitySource === layer.source);
          return (
            <section className="space-y-4" key={layer.source}>
              <SectionHeading title={layer.label} />
              {layerPosts.length ? (
                <div className="space-y-5">
                  {layerPosts.map((post) => (
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
              ) : (
                <p className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--ink-soft)] shadow-sm">
                  No opportunities here yet.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

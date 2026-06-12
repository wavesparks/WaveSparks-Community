import Link from "next/link";
import { PlusCircle } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { FilterBar } from "@/components/community/filter-bar";
import { PostCard } from "@/components/community/post-card";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getViewerContext } from "@/lib/auth";
import { parseFeedFilters, pathWithQuery, singleQueryValue } from "@/lib/feed-filters";
import { cn } from "@/lib/utils";
import type { FeedFilters } from "@/server/view-models";
import { getFeedViewsForOrg } from "@/server/view-models";

export default async function OpportunitiesPage({
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

  const source = (singleQueryValue(query.source) ?? "official") as FeedFilters["opportunitySource"];
  const filters = parseFeedFilters(query, {
    includeOpportunitySource: true,
    defaultOpportunitySource: "official",
  });
  const allPosts = await getFeedViewsForOrg(viewer.org, {
    viewerMembershipId: viewer.membership.id,
    viewerProfileId: viewer.profile?.id,
    filters,
    includeMatchedRecommendationSignals: false,
    onlyOpportunities: true,
    limit: 60,
  });
  const posts = allPosts;
  const layers = [
    { source: "official", label: "Official admin recommended" },
    { source: "member", label: "User published" },
    { source: "mentor", label: "Mentor published" },
  ] as const;
  const layerLinks = [
    ...layers,
    { source: "all", label: "All layers" },
  ] as const;
  const visibleLayers =
    source && source !== "all"
      ? layers.filter((layer) => layer.source === source)
      : layers;
  const returnPath = pathWithQuery(`/org/${slug}/opportunities`, query);
  const hrefForSource = (nextSource: "all" | "member" | "mentor" | "official") => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string" && value) {
        params.set(key, value);
      }
    }
    if (nextSource === "official") {
      params.delete("source");
    } else if (nextSource === "all") {
      params.delete("source");
      params.set("source", "all");
    } else {
      params.set("source", nextSource);
    }
    const suffix = params.toString();
    return `/org/${slug}/opportunities${suffix ? `?${suffix}` : ""}`;
  };

  return (
    <AppShell currentPath={`/org/${slug}/opportunities`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            eyebrow="Opportunities"
            level={1}
            title="Official events, open asks, and mentor needs"
            description="Official recommendations are the default surface. Members can still switch layers or filter into specific asks."
          />
          <Button asChild size="sm">
            <Link href={`/org/${slug}/compose?kind=opportunity`} title="Post opportunity">
              <PlusCircle className="size-4" />
              Opportunity
            </Link>
          </Button>
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />
        <div className="flex flex-wrap gap-2">
          {layerLinks.map((layer) => (
            <Link
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-slate-200 transition",
                source === layer.source || (!source && layer.source === "official")
                  ? "bg-[var(--accent)] text-white ring-transparent"
                  : "bg-white text-slate-700 hover:bg-slate-50",
              )}
              href={hrefForSource(layer.source)}
              key={layer.source}
            >
              {layer.label}
            </Link>
          ))}
        </div>
        <FilterBar
          clearHref={`/org/${slug}/opportunities`}
          defaultOpportunitySource="official"
          filters={filters}
          opportunityMode
        />
        <div className="space-y-6">
          {visibleLayers.map((layer) => {
            const layerPosts = posts.filter((post) => post.opportunitySource === layer.source);

            return (
              <section className="space-y-4" key={layer.source}>
                <SectionHeading title={layer.label} />
                {layerPosts.length ? (
                  <div className="space-y-6">
                    {layerPosts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        returnPath={returnPath}
                        slug={slug}
                        viewerMembershipId={viewer.membership.id}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                    No opportunities match these filters.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

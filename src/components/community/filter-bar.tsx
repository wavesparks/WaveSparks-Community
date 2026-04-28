import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { activeFeedFilterCount, hasFeedFilters } from "@/lib/feed-filters";
import type { FeedFilters } from "@/server/view-models";

export function FilterBar({
  filters,
  clearHref,
  opportunityMode = false,
  defaultOpportunitySource = "all",
}: {
  filters: FeedFilters;
  clearHref: string;
  opportunityMode?: boolean;
  defaultOpportunitySource?: FeedFilters["opportunitySource"];
}) {
  const activeCount = activeFeedFilterCount(filters, {
    includeOpportunitySource: opportunityMode,
    defaultOpportunitySource,
  });
  const hasFilters = hasFeedFilters(filters, {
    includeOpportunitySource: opportunityMode,
    defaultOpportunitySource,
  });

  return (
    <Card className="p-3">
      <form className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-10"
              defaultValue={filters.q}
              name="q"
              placeholder={opportunityMode ? "Search opportunities" : "Search posts, tags, people"}
            />
          </label>
          <details className="group">
            <summary className="inline-flex h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-full bg-white/70 px-5 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 transition hover:bg-white">
              <SlidersHorizontal className="size-4" />
              Filters
              {activeCount ? (
                <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs text-white">
                  {activeCount}
                </span>
              ) : null}
            </summary>
            <div className="mt-3 grid gap-4 rounded-[24px] bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-3">
              {opportunityMode ? (
                <Select
                  defaultValue={filters.opportunitySource ?? defaultOpportunitySource ?? "all"}
                  name="source"
                >
                  <option value="official">Official admin recommended</option>
                  <option value="member">User published</option>
                  <option value="mentor">Mentor published</option>
                  <option value="all">All layers</option>
                </Select>
              ) : null}
              <Select defaultValue={filters.postType ?? "all"} name="type">
                <option value="all">
                  {opportunityMode ? "All opportunity types" : "All post types"}
                </option>
                {opportunityMode ? null : (
                  <>
                    <option value="general_update">General update</option>
                    <option value="ask">Ask</option>
                  </>
                )}
                <option value="opportunity">Opportunity</option>
                <option value="looking_for_cofounder">Looking for cofounder</option>
                <option value="looking_for_mentor">Looking for mentor</option>
                {opportunityMode ? null : (
                  <>
                    <option value="resource">Resource</option>
                    <option value="announcement">Announcement</option>
                  </>
                )}
              </Select>
              <Input defaultValue={filters.tag} name="tag" placeholder="Tag" />
              <Select defaultValue={filters.authorAffiliation ?? ""} name="affiliation">
                <option value="">Any affiliation</option>
                <option value="current participant">Current participant</option>
                <option value="alumni">Alumni</option>
                <option value="mentor">Mentor</option>
                <option value="invited outsider">Invited outsider</option>
              </Select>
              <Select defaultValue={filters.authorStage ?? ""} name="stage">
                <option value="">Any stage</option>
                <option value="exploring">Exploring</option>
                <option value="idea">Idea</option>
                <option value="pre-MVP">Pre-MVP</option>
                <option value="MVP">MVP</option>
                <option value="early traction">Early traction</option>
                <option value="scaling">Scaling</option>
              </Select>
              <Input defaultValue={filters.authorIndustry} name="industry" placeholder="Industry" />
              <Input defaultValue={filters.roleNeeded} name="role" placeholder="Role needed" />
              <label className="flex h-11 items-center gap-2 rounded-2xl bg-white px-4 text-sm text-slate-700 ring-1 ring-slate-200">
                <input
                  defaultChecked={filters.recommendedOnly}
                  name="recommended"
                  type="checkbox"
                  value="true"
                />
                Recommended only
              </label>
              <Button type="submit">Apply filters</Button>
            </div>
          </details>
          {hasFilters ? (
            <Button asChild type="button" variant="ghost">
              <Link href={clearHref}>
                <X className="size-4" />
                Clear
              </Link>
            </Button>
          ) : null}
          <Button type="submit">Search</Button>
        </div>
      </form>
    </Card>
  );
}

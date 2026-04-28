import type { FeedFilters } from "@/server/view-models";

export function singleQueryValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export function parseFeedFilters(
  query: Record<string, string | string[] | undefined>,
  options: { includeOpportunitySource?: boolean; defaultOpportunitySource?: FeedFilters["opportunitySource"] } = {},
): FeedFilters {
  const opportunitySource = options.includeOpportunitySource
    ? ((singleQueryValue(query.source) ?? options.defaultOpportunitySource ?? "all") as FeedFilters["opportunitySource"])
    : undefined;

  return {
    q: singleQueryValue(query.q),
    postType: singleQueryValue(query.type) as FeedFilters["postType"],
    tag: singleQueryValue(query.tag),
    authorAffiliation: singleQueryValue(query.affiliation),
    authorStage: singleQueryValue(query.stage),
    authorIndustry: singleQueryValue(query.industry),
    roleNeeded: singleQueryValue(query.role),
    opportunitySource,
    recommendedOnly: singleQueryValue(query.recommended) === "true",
  };
}

export function activeFeedFilterCount(
  filters: FeedFilters,
  options: { includeOpportunitySource?: boolean; defaultOpportunitySource?: FeedFilters["opportunitySource"] } = {},
) {
  const values = [
    filters.postType && filters.postType !== "all",
    Boolean(filters.tag),
    Boolean(filters.authorAffiliation),
    Boolean(filters.authorStage),
    Boolean(filters.authorIndustry),
    Boolean(filters.roleNeeded),
    Boolean(filters.recommendedOnly),
    options.includeOpportunitySource &&
      filters.opportunitySource &&
      filters.opportunitySource !== (options.defaultOpportunitySource ?? "all"),
  ];

  return values.filter(Boolean).length;
}

export function hasFeedFilters(
  filters: FeedFilters,
  options: { includeOpportunitySource?: boolean; defaultOpportunitySource?: FeedFilters["opportunitySource"] } = {},
) {
  return Boolean(filters.q) || activeFeedFilterCount(filters, options) > 0;
}

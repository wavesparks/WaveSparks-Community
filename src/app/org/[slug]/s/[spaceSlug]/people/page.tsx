import { Search, UsersRound } from "lucide-react";

import { MemberDirectoryCard } from "@/components/community/member-directory-card";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { Select } from "@/components/ui/select";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import type { MemberDirectoryFilters } from "@/lib/domain";
import { pathWithQuery, singleQueryValue } from "@/lib/feed-filters";
import { getSpaceViewerContext } from "@/lib/space-auth";
import { getMemberDirectoryViewsForSpace } from "@/server/view-models";

function parseDirectoryFilters(
  query: Record<string, string | string[] | undefined>,
): MemberDirectoryFilters {
  return {
    q: singleQueryValue(query.q),
    affiliation: singleQueryValue(query.affiliation),
    stage: singleQueryValue(query.stage),
    industry: singleQueryValue(query.industry),
    need: singleQueryValue(query.need),
    skill: singleQueryValue(query.skill),
  };
}

function hasDirectoryFilters(filters: MemberDirectoryFilters) {
  return Boolean(
    filters.q ||
      filters.affiliation ||
      filters.stage ||
      filters.industry ||
      filters.need ||
      filters.skill,
  );
}

export default async function SpacePeoplePage({
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
    requireProfile: true,
  });
  const { space, viewer } = context;
  const filters = parseDirectoryFilters(query);
  const basePath = `/org/${slug}/s/${space.slug}/people`;
  const profiles = await getMemberDirectoryViewsForSpace(space.id, viewer.org, {
    viewerMembershipId: viewer.membership.id,
    filters,
    limit: 80,
  });
  const returnPath = pathWithQuery(basePath, query);
  const hasFilters = hasDirectoryFilters(filters);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          description={`Browse only the people who are active in ${space.name}. Members who only share another event or Main Community stay private.`}
          eyebrow="Private Space directory"
          level={1}
          title={`People in ${space.name}`}
        />
        <LinkButton
          href={`/org/${slug}/s/${space.slug}/matches`}
          size="sm"
          variant="secondary"
        >
          <UsersRound className="size-4" />
          Space matches
        </LinkButton>
      </div>
      <StatusBanner spaceName={space.name} status={singleQueryValue(query.status)} />

      <Card className="p-3">
        <form action={basePath} className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-[220px] flex-1">
              <span className="sr-only">Search people</span>
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-soft)]" />
              <Input
                className="pl-9"
                defaultValue={filters.q}
                name="q"
                placeholder="Search participants, startups, skills"
              />
            </label>
            <Select
              aria-label="Filter people by affiliation"
              defaultValue={filters.affiliation ?? ""}
              name="affiliation"
            >
              <option value="">Any affiliation</option>
              <option value="current participant">Current participant</option>
              <option value="alumni">Alumni</option>
              <option value="mentor">Mentor</option>
              <option value="invited outsider">Invited outsider</option>
            </Select>
            <Select
              aria-label="Filter people by startup stage"
              defaultValue={filters.stage ?? ""}
              name="stage"
            >
              <option value="">Any stage</option>
              <option value="exploring">Exploring</option>
              <option value="idea">Idea</option>
              <option value="pre-MVP">Pre-MVP</option>
              <option value="MVP">MVP</option>
              <option value="early traction">Early traction</option>
              <option value="scaling">Scaling</option>
            </Select>
            <Input
              aria-label="Filter people by industry"
              defaultValue={filters.industry}
              name="industry"
              placeholder="Industry"
            />
            <Input
              aria-label="Filter people by need"
              defaultValue={filters.need}
              name="need"
              placeholder="Need"
            />
            <Input
              aria-label="Filter people by skill"
              defaultValue={filters.skill}
              name="skill"
              placeholder="Skill"
            />
            {hasFilters ? (
              <LinkButton className="w-full sm:w-auto" href={basePath} variant="ghost">
                Clear
              </LinkButton>
            ) : null}
            <SubmitButton className="w-full sm:w-auto" pendingLabel="Searching">
              Search
            </SubmitButton>
          </div>
        </form>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        {profiles.map((profile) => (
          <MemberDirectoryCard
            key={profile.membershipId}
            profile={profile}
            returnPath={returnPath}
            slug={slug}
            spaceId={space.id}
            spaceSlug={space.slug}
            viewerMembershipId={viewer.membership.id}
          />
        ))}
      </div>

      {!profiles.length ? (
        <Card>
          <p className="font-semibold text-[var(--ink)]">
            {hasFilters
              ? "No participants match this search"
              : `No participant profiles are ready in ${space.name}`}
          </p>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
            {hasFilters
              ? "Remove a filter or search with a broader skill, industry, or need."
              : "People appear after joining this Space and completing enough profile context."}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { Search, UsersRound } from "lucide-react";

import { MemberDirectoryCard } from "@/components/community/member-directory-card";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/ui/section-heading";
import { Select } from "@/components/ui/select";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewerContext } from "@/lib/auth";
import { pathWithQuery, singleQueryValue } from "@/lib/feed-filters";
import type { MemberDirectoryFilters } from "@/lib/domain";
import { getMemberDirectoryViewsForOrg } from "@/server/view-models";

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

export default async function PeoplePage({
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

  const filters = parseDirectoryFilters(query);
  const profiles = await getMemberDirectoryViewsForOrg(viewer.org, {
    viewerMembershipId: viewer.membership.id,
    filters,
    limit: 80,
  });
  const returnPath = pathWithQuery(`/org/${slug}/people`, query);
  const hasFilters = hasDirectoryFilters(filters);

  return (
    <AppShell currentPath={`/org/${slug}/people`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            eyebrow="People"
            level={1}
            title="Search the approved founder network"
            description="Browse limited member profiles, follow useful people, and request contextual intros without exposing contact details."
          />
          <Button asChild size="sm" variant="secondary">
            <Link href={`/org/${slug}/matches`}>
              <UsersRound className="size-4" />
              Matches
            </Link>
          </Button>
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />

        <Card className="p-3">
          <form action={`/org/${slug}/people`} className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  defaultValue={filters.q}
                  name="q"
                  placeholder="Search people, startups, skills"
                />
              </label>
              <Select defaultValue={filters.affiliation ?? ""} name="affiliation">
                <option value="">Any affiliation</option>
                <option value="current participant">Current participant</option>
                <option value="alumni">Alumni</option>
                <option value="mentor">Mentor</option>
                <option value="invited outsider">Invited outsider</option>
              </Select>
              <Select defaultValue={filters.stage ?? ""} name="stage">
                <option value="">Any stage</option>
                <option value="exploring">Exploring</option>
                <option value="idea">Idea</option>
                <option value="pre-MVP">Pre-MVP</option>
                <option value="MVP">MVP</option>
                <option value="early traction">Early traction</option>
                <option value="scaling">Scaling</option>
              </Select>
              <Input defaultValue={filters.industry} name="industry" placeholder="Industry" />
              <Input defaultValue={filters.need} name="need" placeholder="Need" />
              <Input defaultValue={filters.skill} name="skill" placeholder="Skill" />
              {hasFilters ? (
                <Button asChild className="w-full sm:w-auto" type="button" variant="ghost">
                  <Link href={`/org/${slug}/people`}>Clear</Link>
                </Button>
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
              viewerMembershipId={viewer.membership.id}
            />
          ))}
        </div>

        {!profiles.length ? (
          <Card>
            <p className="text-sm font-semibold text-[var(--ink)]">No members match this search</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Try removing a filter or searching by a broader skill, industry, or need.
            </p>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

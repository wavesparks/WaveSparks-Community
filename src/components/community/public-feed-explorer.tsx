"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  MessageCircle,
  Search,
  SearchX,
  SlidersHorizontal,
  UsersRound,
  X,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SectionHeading } from "@/components/ui/section-heading";
import type { FeedPostView } from "@/lib/domain";
import { formatDate } from "@/lib/utils";

export interface PublicFeedPostView extends FeedPostView {
  authorIndustryTags: string[];
  authorStage: string;
}

interface PublicFeedFilters {
  q: string;
  type: string;
  tag: string;
  affiliation: string;
  stage: string;
  industry: string;
  role: string;
}

const emptyFilters: PublicFeedFilters = {
  q: "",
  type: "all",
  tag: "",
  affiliation: "",
  stage: "",
  industry: "",
  role: "",
};

const opportunitySourceLabels = {
  member: "User published",
  mentor: "Mentor published",
  official: "Official",
} as const;

function filtersFromSearch(search: string): PublicFeedFilters {
  const params = new URLSearchParams(search);

  return {
    q: params.get("q") ?? "",
    type: params.get("type") ?? "all",
    tag: params.get("tag") ?? "",
    affiliation: params.get("affiliation") ?? "",
    stage: params.get("stage") ?? "",
    industry: params.get("industry") ?? "",
    role: params.get("role") ?? "",
  };
}

function includesNormalized(values: string[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) => value.toLowerCase().includes(normalizedQuery));
}

function activeFilterCount(filters: PublicFeedFilters) {
  return [
    filters.type && filters.type !== "all",
    filters.tag,
    filters.affiliation,
    filters.stage,
    filters.industry,
    filters.role,
  ].filter(Boolean).length;
}

function postMatchesFilters(post: PublicFeedPostView, filters: PublicFeedFilters) {
  if (filters.type && filters.type !== "all" && post.type !== filters.type) {
    return false;
  }

  if (filters.affiliation && post.author.affiliationLabel !== filters.affiliation) {
    return false;
  }

  if (filters.stage && post.authorStage !== filters.stage) {
    return false;
  }

  if (!includesNormalized(post.authorIndustryTags, filters.industry)) {
    return false;
  }

  if (!includesNormalized(post.tags, filters.tag)) {
    return false;
  }

  if (!includesNormalized(post.relatedRolesNeeded, filters.role)) {
    return false;
  }

  const query = filters.q.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    post.title,
    post.body,
    post.tags.join(" "),
    post.relatedRolesNeeded.join(" "),
    post.author.displayName,
    post.author.headline,
    post.author.affiliationLabel,
    post.authorIndustryTags.join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function PublicPostCard({ post, slug }: { post: PublicFeedPostView; slug: string }) {
  const typeLabel = post.type.replaceAll("_", " ");
  const authorSignals = [
    post.author.affiliationLabel,
    post.author.currentStatus,
    post.author.location,
  ].filter(Boolean);

  return (
    <Card className="group space-y-3 overflow-hidden p-4 transition before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[linear-gradient(180deg,var(--cyan),var(--accent),var(--gold))] before:opacity-60 hover:border-[var(--accent)]/30 hover:shadow-[0_16px_42px_rgba(34,27,68,0.1)]">
      <div className="flex flex-wrap items-start gap-2 pl-1">
        <Badge variant={post.featured ? "accent" : "default"}>{typeLabel}</Badge>
        {post.opportunitySource ? (
          <Badge variant="muted">{opportunitySourceLabels[post.opportunitySource]}</Badge>
        ) : null}
        <span className="ml-auto text-xs font-semibold uppercase text-[var(--ink-soft)]">
          {formatDate(post.createdAt)}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0 space-y-2 pl-1">
          <h3 className="text-lg font-semibold leading-snug text-[var(--ink)] sm:text-xl">
            <Link
              className="transition hover:text-[var(--accent)]"
              href={`/org/${slug}/posts/${post.id}`}
            >
              {post.title}
            </Link>
          </h3>
          <p className="line-clamp-2 text-sm leading-6 text-[var(--ink-soft)]">
            {post.body}
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-soft)] transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface)] hover:text-[var(--ink)]"
          href={`/org/${slug}/posts/${post.id}`}
        >
          Open
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 pl-1">
        {post.tags.map((tag, index) => (
          <Badge key={`tag-${tag}-${index}`} variant="muted">
            {tag}
          </Badge>
        ))}
        {post.relatedRolesNeeded.map((role, index) => (
          <Badge key={`role-${role}-${index}`} variant="default">
            {role}
          </Badge>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-9" name={post.author.displayName} src={post.author.photo} />
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold text-[var(--ink)]">{post.author.displayName}</p>
            <p className="line-clamp-1 text-xs font-medium text-[var(--ink-soft)]">
              {post.author.headline}
            </p>
            {authorSignals.length ? (
              <p className="line-clamp-1 text-xs text-[var(--ink-soft)]/80">
                {authorSignals.slice(0, 3).join(" / ")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--ink-soft)]">
            <MessageCircle className="size-4" />
            {post.commentCount}
          </span>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/org/${slug}/posts/${post.id}`}>Open thread</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RailPanel({
  body,
  title,
  value,
}: {
  body: string;
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <p className="text-xs font-semibold uppercase text-[var(--accent)]">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{body}</p>
    </div>
  );
}

export function PublicFeedExplorer({
  posts,
  slug,
}: {
  posts: PublicFeedPostView[];
  slug: string;
}) {
  const [filters, setFilters] = useState(emptyFilters);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);

  useEffect(() => {
    const syncFilters = () => {
      const nextFilters = filtersFromSearch(window.location.search);
      setFilters(nextFilters);
      setDraftFilters(nextFilters);
    };

    syncFilters();
    window.addEventListener("popstate", syncFilters);
    return () => window.removeEventListener("popstate", syncFilters);
  }, []);

  const filteredPosts = useMemo(
    () => posts.filter((post) => postMatchesFilters(post, filters)),
    [filters, posts],
  );
  const filterCount = activeFilterCount(filters);
  const hasFilters = Boolean(filters.q) || filterCount > 0;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_10px_32px_rgba(34,27,68,0.06)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <SectionHeading
            eyebrow="Community signal"
            level={1}
            title="Wavespark Forum"
            description="Founder asks, updates, resources, opportunities, and warm-intro signals from the approved network."
          />
        </div>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2">
            <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Visible</p>
            <p className="font-semibold text-[var(--ink)]">
              {filteredPosts.length || posts.length} posts
            </p>
          </div>
          <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2">
            <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Access</p>
            <p className="font-semibold text-[var(--ink)]">Public reading</p>
          </div>
          <div className="rounded-lg bg-[var(--surface-muted)] px-3 py-2">
            <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Focus</p>
            <p className="font-semibold text-[var(--ink)]">Asks, intros, resources</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]" id="latest-posts">
        <div className="space-y-5">
          <Card className="border-[rgba(137,88,240,0.14)] bg-[var(--surface)] p-3">
            <form action={`/org/${slug}/feed`} className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-soft)]" />
                  <Input
                    className="pl-9"
                    name="q"
                    onChange={(event) =>
                      setDraftFilters((current) => ({ ...current, q: event.target.value }))
                    }
                    placeholder="Search posts, tags, people"
                    value={draftFilters.q}
                  />
                </label>
                <details className="group w-full sm:w-auto">
                  <summary className="inline-flex h-10 w-full cursor-pointer list-none items-center justify-center gap-2 rounded-lg bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] ring-1 ring-[var(--line)] transition hover:bg-[var(--cyan-soft)] sm:w-auto">
                    <SlidersHorizontal className="size-4" />
                    Filters
                    {filterCount ? (
                      <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs text-[var(--surface)]">
                        {filterCount}
                      </span>
                    ) : null}
                  </summary>
                  <div className="mt-3 grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3 md:grid-cols-2 xl:grid-cols-3">
                    <Select
                      name="type"
                      onChange={(event) =>
                        setDraftFilters((current) => ({ ...current, type: event.target.value }))
                      }
                      value={draftFilters.type}
                    >
                      <option value="all">All post types</option>
                      <option value="general_update">General update</option>
                      <option value="ask">Ask</option>
                      <option value="opportunity">Opportunity</option>
                      <option value="looking_for_cofounder">Looking for cofounder</option>
                      <option value="looking_for_mentor">Looking for mentor</option>
                      <option value="resource">Resource</option>
                      <option value="announcement">Announcement</option>
                    </Select>
                    <Input
                      name="tag"
                      onChange={(event) =>
                        setDraftFilters((current) => ({ ...current, tag: event.target.value }))
                      }
                      placeholder="Tag"
                      value={draftFilters.tag}
                    />
                    <Select
                      name="affiliation"
                      onChange={(event) =>
                        setDraftFilters((current) => ({
                          ...current,
                          affiliation: event.target.value,
                        }))
                      }
                      value={draftFilters.affiliation}
                    >
                      <option value="">Any affiliation</option>
                      <option value="current participant">Current participant</option>
                      <option value="alumni">Alumni</option>
                      <option value="mentor">Mentor</option>
                      <option value="invited outsider">Invited outsider</option>
                    </Select>
                    <Select
                      name="stage"
                      onChange={(event) =>
                        setDraftFilters((current) => ({ ...current, stage: event.target.value }))
                      }
                      value={draftFilters.stage}
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
                      name="industry"
                      onChange={(event) =>
                        setDraftFilters((current) => ({
                          ...current,
                          industry: event.target.value,
                        }))
                      }
                      placeholder="Industry"
                      value={draftFilters.industry}
                    />
                    <Input
                      name="role"
                      onChange={(event) =>
                        setDraftFilters((current) => ({ ...current, role: event.target.value }))
                      }
                      placeholder="Role needed"
                      value={draftFilters.role}
                    />
                    <Button>Apply filters</Button>
                  </div>
                </details>
                {hasFilters ? (
                  <Button asChild className="w-full sm:w-auto" type="button" variant="ghost">
                    <Link href={`/org/${slug}/feed`}>
                      <X className="size-4" />
                      Clear
                    </Link>
                  </Button>
                ) : null}
                <Button className="w-full sm:w-auto">Search</Button>
              </div>
            </form>
          </Card>

          <div className="space-y-3">
            {filteredPosts.map((post) => (
              <PublicPostCard key={post.id} post={post} slug={slug} />
            ))}
          </div>
          {!filteredPosts.length ? (
            <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <SearchX className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {hasFilters ? "No posts match these filters" : "The public forum is ready for posts"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                    {hasFilters
                      ? "Clear the filters to return to the main forum view."
                      : "You can browse without an account. Sign in when you are ready to interact."}
                  </p>
                </div>
              </div>
              {hasFilters ? (
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
            value="Gated"
            body="Public reading stays open while posting, following, and intros remain member-gated."
          />
        </aside>
      </div>
    </div>
  );
}

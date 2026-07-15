import Link from "next/link";
import { BookOpen, Search } from "lucide-react";

import { PostCard } from "@/components/community/post-card";
import { NavPendingIndicator } from "@/components/layout/nav-pending-indicator";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { pathWithQuery, singleQueryValue } from "@/lib/feed-filters";
import { getSpaceViewerContext } from "@/lib/space-auth";
import { cn } from "@/lib/utils";
import type { KnowledgeMode } from "@/server/view-models";
import { getKnowledgePostViewsForSpace } from "@/server/view-models";

const reasonLabels = {
  resource: "Resource",
  featured: "Featured",
  active_discussion: "Active discussion",
  saved: "Saved",
} as const;

function knowledgeModeFromQuery(value?: string): KnowledgeMode {
  return value === "saved" ? "saved" : "all";
}

function modeHref(basePath: string, mode: KnowledgeMode, q?: string) {
  const params = new URLSearchParams();
  if (mode === "saved") params.set("mode", "saved");
  if (q) params.set("q", q);
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ""}`;
}

export default async function SpaceKnowledgePage({
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
  const mode = knowledgeModeFromQuery(singleQueryValue(query.mode));
  const q = singleQueryValue(query.q);
  const basePath = `/org/${slug}/s/${space.slug}/knowledge`;
  const posts = await getKnowledgePostViewsForSpace(space.id, viewer.org, {
    viewerMembershipId: viewer.membership.id,
    viewerProfileId: viewer.profile?.id,
    mode,
    q,
    limit: 80,
  });
  const returnPath = pathWithQuery(basePath, query);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          description={`Resources and reusable discussions shared inside ${space.name}. Saved items and search results never cross into another Space.`}
          eyebrow="Space library"
          level={1}
          title={`Knowledge in ${space.name}`}
        />
        {context.canInteract ? (
          <LinkButton
            href={`/org/${slug}/s/${space.slug}/compose?kind=feed&type=resource`}
            size="sm"
            variant="secondary"
          >
            <BookOpen className="size-4" />
            Share resource
          </LinkButton>
        ) : null}
      </div>
      <StatusBanner spaceName={space.name} status={singleQueryValue(query.status)} />

      <div className="flex flex-wrap gap-2">
        {[
          { label: "Library", mode: "all" as const },
          { label: "Saved in this Space", mode: "saved" as const },
        ].map((item) => (
          <Link
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-[var(--line)] transition duration-150 ease-out active:translate-y-px active:scale-[0.99]",
              mode === item.mode
                ? "bg-[var(--accent)] text-[var(--surface)] ring-transparent"
                : "bg-[var(--surface)] text-[var(--ink-soft)] hover:bg-[var(--surface-muted)]",
            )}
            href={modeHref(basePath, item.mode, q)}
            key={item.mode}
          >
            {item.label}
            <NavPendingIndicator className="size-1.5" />
          </Link>
        ))}
      </div>

      <Card className="p-3">
        <form action={basePath} className="flex flex-wrap items-center gap-3">
          {mode === "saved" ? <input name="mode" type="hidden" value="saved" /> : null}
          <label className="relative min-w-[220px] flex-1">
            <span className="sr-only">Search knowledge in {space.name}</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-soft)]" />
            <Input
              className="pl-9"
              defaultValue={q}
              name="q"
              placeholder={mode === "saved" ? "Search saved posts" : "Search this Space"}
            />
          </label>
          {q ? (
            <LinkButton
              className="w-full sm:w-auto"
              href={modeHref(basePath, mode)}
              variant="ghost"
            >
              Clear
            </LinkButton>
          ) : null}
          <SubmitButton className="w-full sm:w-auto" pendingLabel="Searching">
            Search
          </SubmitButton>
        </form>
      </Card>

      <div className="space-y-5">
        {posts.map((post) => (
          <div className="space-y-2" key={post.id}>
            <Badge variant="accent">{reasonLabels[post.knowledgeReason]}</Badge>
            <PostCard
              post={post}
              returnPath={returnPath}
              slug={slug}
              spaceId={space.id}
              spaceSlug={space.slug}
              viewerMembershipId={context.canInteract ? viewer.membership.id : undefined}
            />
          </div>
        ))}
      </div>

      {!posts.length ? (
        <Card>
          <p className="font-semibold text-[var(--ink)]">
            {mode === "saved"
              ? `No saved posts in ${space.name}`
              : `No knowledge found in ${space.name}`}
          </p>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
            {mode === "saved"
              ? "Save useful threads from this Space to build a private, Space-specific library."
              : q
                ? "Try a broader search. Results from other Spaces are intentionally excluded."
                : "Resources shared by active members of this Space will collect here."}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

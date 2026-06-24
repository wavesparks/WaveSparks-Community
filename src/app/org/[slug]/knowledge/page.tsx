import Link from "next/link";
import { BookOpen, Search } from "lucide-react";

import { ChannelShortcutBar } from "@/components/community/channel-shortcut-bar";
import { PostCard } from "@/components/community/post-card";
import { AppShell } from "@/components/layout/app-shell";
import { NavPendingIndicator } from "@/components/layout/nav-pending-indicator";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewerContext } from "@/lib/auth";
import { getCommunityChannels } from "@/lib/channels";
import { pathWithQuery, singleQueryValue } from "@/lib/feed-filters";
import { cn } from "@/lib/utils";
import type { KnowledgeMode } from "@/server/view-models";
import { getKnowledgePostViewsForOrg } from "@/server/view-models";

const reasonLabels = {
  resource: "Resource",
  featured: "Featured",
  active_discussion: "Active discussion",
  saved: "Saved",
} as const;

function knowledgeModeFromQuery(value?: string): KnowledgeMode {
  return value === "saved" ? "saved" : "all";
}

function modeHref(slug: string, mode: KnowledgeMode, q?: string) {
  const params = new URLSearchParams();
  if (mode === "saved") {
    params.set("mode", "saved");
  }
  if (q) {
    params.set("q", q);
  }
  const query = params.toString();
  return `/org/${slug}/knowledge${query ? `?${query}` : ""}`;
}

export default async function KnowledgePage({
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

  const mode = knowledgeModeFromQuery(singleQueryValue(query.mode));
  const q = singleQueryValue(query.q);
  const posts = await getKnowledgePostViewsForOrg(viewer.org, {
    viewerMembershipId: viewer.membership.id,
    viewerProfileId: viewer.profile?.id,
    mode,
    q,
    limit: 80,
  });
  const channels = getCommunityChannels(slug);
  const returnPath = pathWithQuery(`/org/${slug}/knowledge`, query);

  return (
    <AppShell currentPath={`/org/${slug}/knowledge`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            eyebrow="Knowledge"
            level={1}
            title="Reusable advice from the community"
            description="Resources, featured threads, active discussions, and your saved posts are gathered here for reuse."
          />
          <LinkButton
            href={`/org/${slug}/compose?kind=feed&type=resource`}
            size="sm"
            variant="secondary"
          >
            <BookOpen className="size-4" />
            Share resource
          </LinkButton>
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />
        <ChannelShortcutBar channels={channels} title="Topic shortcuts" />

        <div className="flex flex-wrap gap-2">
          {[
            { label: "Library", mode: "all" as const },
            { label: "Saved", mode: "saved" as const },
          ].map((item) => (
            <Link
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-[var(--line)] transition duration-150 ease-out active:translate-y-px active:scale-[0.99]",
                mode === item.mode
                  ? "bg-[var(--accent)] text-[var(--surface)] ring-transparent"
                  : "bg-[var(--surface)] text-[var(--ink-soft)] hover:bg-[var(--surface-muted)]",
              )}
              href={modeHref(slug, item.mode, q)}
              key={item.mode}
            >
              {item.label}
              <NavPendingIndicator className="size-1.5" />
            </Link>
          ))}
        </div>

        <Card className="p-3">
          <form action={`/org/${slug}/knowledge`} className="flex flex-wrap items-center gap-3">
            {mode === "saved" ? <input name="mode" type="hidden" value="saved" /> : null}
            <label className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-soft)]" />
              <Input
                className="pl-9"
                defaultValue={q}
                name="q"
                placeholder={mode === "saved" ? "Search saved posts" : "Search knowledge"}
              />
            </label>
            {q ? (
              <LinkButton
                className="w-full sm:w-auto"
                href={modeHref(slug, mode)}
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
                viewerMembershipId={viewer.membership.id}
              />
            </div>
          ))}
        </div>

        {!posts.length ? (
          <Card>
            <p className="text-sm font-semibold text-[var(--ink)]">
              {mode === "saved" ? "No saved posts yet" : "No knowledge posts found"}
            </p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              {mode === "saved"
                ? "Save useful threads from the feed or post detail pages to build your personal library."
                : "Try a broader search or share a resource thread for the community."}
            </p>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

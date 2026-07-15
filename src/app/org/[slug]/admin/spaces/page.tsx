import {
  CalendarDays,
  LockKeyhole,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { adminSpaceName } from "@/components/admin/admin-community-copy";
import { EventSpaceEditorDialog } from "@/components/admin/event-space-editor-dialog";
import { MemberManagementNav } from "@/components/admin/member-management-nav";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import type { Space } from "@/lib/domain";
import {
  listActiveSpaceMemberRecords,
  listSpacesForOrg,
} from "@/server/store";

function formatDate(value?: string) {
  if (!value) return undefined;

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function lifecycleLabel(space: Space) {
  if (space.kind === "main") return "Invitation only";
  if (space.lifecycle === "ended") return "Past Event";
  return `${space.lifecycle[0].toUpperCase()}${space.lifecycle.slice(1)} Event`;
}

function lifecycleDescription(space: Space) {
  if (space.kind === "main") {
    return "People must be added directly to Wavesparks Community. Joining an Event does not grant access.";
  }
  if (space.lifecycle === "draft") {
    return "Visible to administrators only while the Event is being prepared.";
  }
  if (space.lifecycle === "upcoming") {
    return "Participants can enter before the Event begins.";
  }
  if (space.lifecycle === "active") {
    return "Participants can read, interact, and receive matches here.";
  }
  if (space.lifecycle === "ended") {
    return "The Event has ended, but participants keep full access and matching remains available.";
  }
  return "This Event is hidden from participants. You can still review its participants and activity here.";
}

function dateLabel(space: Space) {
  const startsAt = formatDate(space.startsAt);
  const endsAt = formatDate(space.endsAt);

  if (startsAt && endsAt) return `${startsAt} – ${endsAt}`;
  if (startsAt) return `Starts ${startsAt}`;
  if (endsAt) return `Ends ${endsAt}`;
  return space.eventLabel || "Dates not set";
}

function lifecycleBadgeClass(space: Space) {
  if (space.lifecycle === "archived") {
    return "bg-slate-100 text-slate-700 ring-slate-300";
  }
  if (space.lifecycle === "ended") {
    return "bg-amber-50 text-amber-800 ring-amber-300";
  }
  return undefined;
}

function SpaceCard({
  participantCount,
  slug,
  space,
}: {
  participantCount: number;
  slug: string;
  space: Space;
}) {
  const Icon = space.kind === "main" ? LockKeyhole : CalendarDays;
  const participantLabel = space.kind === "main" ? "active members" : "active participants";

  return (
    <Card className="flex h-full flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-[var(--night)] text-[var(--surface)]">
          <Icon aria-hidden className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-[var(--ink)]">{adminSpaceName(space)}</h3>
            <Badge
              className={lifecycleBadgeClass(space)}
              variant={space.lifecycle === "ended" || space.lifecycle === "archived" ? "muted" : "accent"}
            >
              {lifecycleLabel(space)}
            </Badge>
          </div>
          {space.kind === "event" ? (
            <p className="mt-1 text-sm font-medium text-[var(--ink-soft)]">
              {dateLabel(space)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm leading-6 text-[var(--ink-soft)]">
          {space.description || lifecycleDescription(space)}
        </p>
        {space.description ? (
          <p className="text-xs leading-5 text-[var(--ink-soft)]">
            {lifecycleDescription(space)}
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
        <div className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
          <UsersRound aria-hidden className="size-4" />
          <span>
            <strong className="text-[var(--ink)]">{participantCount}</strong> {participantLabel}
          </span>
        </div>
        <LinkButton href={`/org/${slug}/admin/spaces/${space.id}`} size="sm">
          {space.kind === "main" ? "Manage community" : "Manage Event"}
        </LinkButton>
      </div>
    </Card>
  );
}

export default async function AdminSpacesPage({
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
    requireConnected: true,
    requireAdmin: true,
  });

  if (!viewer) return null;

  const spaces = await listSpacesForOrg(viewer.org.id);
  const counts = new Map(
    await Promise.all(
      spaces.map(async (space) => [
        space.id,
        (await listActiveSpaceMemberRecords(space.id)).length,
      ] as const),
    ),
  );
  const mainSpace = spaces.find((space) => space.kind === "main");
  const eventSpaces = spaces.filter((space) => space.kind === "event");
  const openEvents = eventSpaces.filter(
    (space) => space.lifecycle !== "ended" && space.lifecycle !== "archived",
  );
  const pastEvents = eventSpaces.filter((space) => space.lifecycle === "ended");
  const archivedEvents = eventSpaces.filter((space) => space.lifecycle === "archived");

  return (
    <AppShell currentPath={`/org/${slug}/admin/spaces`} viewer={viewer}>
      <div className="space-y-7">
        <MemberManagementNav active="spaces" slug={slug} />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            description="Manage who can join Wavesparks Community and each Event, and review their activity and matching separately."
            eyebrow="Admin · Community access"
            level={1}
            title="Community & Events"
          />
          <EventSpaceEditorDialog slug={slug} />
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />

        <Card className="border-[var(--accent)]/25 bg-[var(--accent-soft)]/35">
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
            <div>
              <p className="font-semibold text-[var(--ink)]">Access is managed separately</p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                Joining an Event does not add someone to Wavesparks Community, and community members only see Events they joined. Past Events stay open; archived Events are hidden from participants.
              </p>
            </div>
          </div>
        </Card>

        <section aria-labelledby="main-community-heading" className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--ink)]" id="main-community-heading">
              Wavesparks Community
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              People must be added directly to Wavesparks Community.
            </p>
          </div>
          {mainSpace ? (
            <div className="max-w-3xl">
              <SpaceCard
                participantCount={counts.get(mainSpace.id) ?? 0}
                slug={slug}
                space={mainSpace}
              />
            </div>
          ) : (
            <Card className="border-red-600/30 bg-red-50">
              <p className="font-semibold text-red-900">Wavesparks Community is not ready</p>
              <p className="mt-1 text-sm text-red-800">
                Set up Wavesparks Community before adding members.
              </p>
            </Card>
          )}
        </section>

        <section aria-labelledby="event-spaces-heading" className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--ink)]" id="event-spaces-heading">
              Events
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Each Event has its own participants, conversations, and match suggestions.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {openEvents.map((space) => (
              <SpaceCard
                key={space.id}
                participantCount={counts.get(space.id) ?? 0}
                slug={slug}
                space={space}
              />
            ))}
          </div>
          {!openEvents.length ? (
            <Card>
              <p className="font-semibold text-[var(--ink)]">No current Events yet</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Create an Event when you are ready, or review past and archived Events below.
              </p>
            </Card>
          ) : null}
        </section>

        {pastEvents.length ? (
          <section aria-labelledby="past-events-heading" className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-[var(--ink)]" id="past-events-heading">
                Past Events
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                These Events have ended, but participants can still interact and receive matches.
              </p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {pastEvents.map((space) => (
                <SpaceCard
                  key={space.id}
                  participantCount={counts.get(space.id) ?? 0}
                  slug={slug}
                  space={space}
                />
              ))}
            </div>
          </section>
        ) : null}

        {archivedEvents.length ? (
          <details className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
            <summary className="cursor-pointer font-semibold text-[var(--ink)]">
              Archived Events ({archivedEvents.length})
            </summary>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Archived Events are hidden from participants and matching is paused. You can still review their history here.
            </p>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {archivedEvents.map((space) => (
                <SpaceCard
                  key={space.id}
                  participantCount={counts.get(space.id) ?? 0}
                  slug={slug}
                  space={space}
                />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </AppShell>
  );
}

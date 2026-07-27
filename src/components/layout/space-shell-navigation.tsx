"use client";

import {
  BookOpen,
  ChevronDown,
  Compass,
  Handshake,
  History,
  LayoutDashboard,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { NavPendingIndicator } from "@/components/layout/nav-pending-indicator";
import {
  getCommunityDisplayName,
  getCommunityTypeLabel,
  WAVESPARKS_COMMUNITY_NAME,
} from "@/lib/community-copy";
import type { Space } from "@/lib/domain";
import { cn } from "@/lib/utils";

export type SpaceShellSpace = Pick<
  Space,
  | "endsAt"
  | "eventLabel"
  | "id"
  | "kind"
  | "lifecycle"
  | "name"
  | "slug"
  | "startsAt"
>;

const sectionLinks = [
  { href: "feed", label: "Feed", icon: Compass },
  { href: "people", label: "People", icon: UsersRound },
  { href: "matches", label: "Matches", icon: Sparkles },
  { href: "knowledge", label: "Knowledge", icon: BookOpen },
  { href: "opportunities", label: "Opportunities", icon: LayoutDashboard },
  { href: "requests", label: "Introductions", icon: Handshake },
] as const;

const switchableSections = new Set(sectionLinks.map((link) => link.href));

function currentSection(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const spaceSegmentIndex = parts.indexOf("s");
  const section = spaceSegmentIndex >= 0 ? parts[spaceSegmentIndex + 2] : undefined;
  return section && switchableSections.has(section as (typeof sectionLinks)[number]["href"])
    ? section
    : "feed";
}

function SpaceOption({
  currentSpaceId,
  onSelect,
  orgSlug,
  section,
  space,
}: {
  currentSpaceId: string;
  onSelect: () => void;
  orgSlug: string;
  section: string;
  space: SpaceShellSpace;
}) {
  const current = space.id === currentSpaceId;

  return (
    <Link
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
        current
          ? "bg-[var(--accent-soft)] text-[var(--ink)]"
          : "text-[var(--ink-soft)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]",
      )}
      href={`/org/${orgSlug}/s/${space.slug}/${section}`}
      onClick={onSelect}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1 size-2 shrink-0 rounded-full",
          space.kind === "main"
            ? "bg-[var(--gold)]"
            : space.lifecycle === "ended"
              ? "bg-[var(--ink-soft)]/45"
              : "bg-[var(--cyan)]",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {getCommunityDisplayName(space)}
        </span>
        {space.kind === "event" ? (
          <span className="mt-0.5 block truncate text-xs">
            {getCommunityTypeLabel(space)}
          </span>
        ) : null}
      </span>
      {current ? (
        <span className="mt-0.5 text-[10px] font-semibold uppercase text-[var(--accent)]">
          Current
        </span>
      ) : null}
    </Link>
  );
}

export function SpaceSwitcher({
  currentSpace,
  orgSlug,
  spaces,
}: {
  currentSpace: SpaceShellSpace;
  orgSlug: string;
  spaces: SpaceShellSpace[];
}) {
  const pathname = usePathname();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const section = currentSection(pathname);
  const mainSpaces = spaces.filter((space) => space.kind === "main");
  const activeEvents = spaces.filter(
    (space) => space.kind === "event" && space.lifecycle !== "ended",
  );
  const pastEvents = spaces.filter(
    (space) => space.kind === "event" && space.lifecycle === "ended",
  );
  const closeSwitcher = () => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  };

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) {
        details.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const details = detailsRef.current;
      if (event.key !== "Escape" || !details?.open) return;
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details className="group relative min-w-0" ref={detailsRef}>
      <summary className="flex min-h-11 min-w-0 cursor-pointer list-none items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left shadow-sm transition hover:bg-[var(--surface-muted)] [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            currentSpace.kind === "main" ? "bg-[var(--gold)]" : "bg-[var(--cyan)]",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--ink)]">
            {getCommunityDisplayName(currentSpace)}
          </span>
          {currentSpace.kind === "event" ? (
            <span className="block truncate text-xs text-[var(--ink-soft)]">
              {getCommunityTypeLabel(currentSpace)}
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-[var(--ink-soft)] transition group-open:rotate-180"
        />
      </summary>

      <div className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(340px,calc(100vw-2rem))] rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[0_24px_60px_rgba(34,27,68,0.22)]">
        <div className="max-h-[min(520px,70vh)] space-y-3 overflow-y-auto">
          {mainSpaces.length ? (
            <div>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase text-[var(--ink-soft)]">
                {WAVESPARKS_COMMUNITY_NAME}
              </p>
              {mainSpaces.map((space) => (
                <SpaceOption
                  currentSpaceId={currentSpace.id}
                  key={space.id}
                  onSelect={closeSwitcher}
                  orgSlug={orgSlug}
                  section={section}
                  space={space}
                />
              ))}
            </div>
          ) : null}

          {activeEvents.length ? (
            <div>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase text-[var(--ink-soft)]">
                Your events
              </p>
              {activeEvents.map((space) => (
                <SpaceOption
                  currentSpaceId={currentSpace.id}
                  key={space.id}
                  onSelect={closeSwitcher}
                  orgSlug={orgSlug}
                  section={section}
                  space={space}
                />
              ))}
            </div>
          ) : null}

          {pastEvents.length ? (
            <div>
              <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase text-[var(--ink-soft)]">
                <History aria-hidden className="size-3" />
                Past events
              </p>
              {pastEvents.map((space) => (
                <SpaceOption
                  currentSpaceId={currentSpace.id}
                  key={space.id}
                  onSelect={closeSwitcher}
                  orgSlug={orgSlug}
                  section={section}
                  space={space}
                />
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-2 border-t border-[var(--line)] pt-2">
          <Link
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]"
            href={`/org/${orgSlug}`}
            onClick={closeSwitcher}
          >
            Home
            <NavPendingIndicator className="size-1.5" />
          </Link>
        </div>
      </div>
    </details>
  );
}

export function SpaceSectionNavigation({
  orgSlug,
  spaceSlug,
}: {
  orgSlug: string;
  spaceSlug: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Community navigation"
      className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1"
    >
      {sectionLinks.map((link) => {
        const href = `/org/${orgSlug}/s/${spaceSlug}/${link.href}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const Icon = link.icon;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition duration-150 ease-out active:translate-y-px active:scale-[0.99]",
              active
                ? "bg-[var(--night)] text-[var(--surface)] shadow-[0_10px_24px_rgba(34,27,68,0.18)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--cyan-soft)] hover:text-[var(--ink)]",
            )}
            href={href}
            key={link.href}
          >
            <Icon aria-hidden className="size-4" />
            {link.label}
            <NavPendingIndicator className="size-1.5" />
          </Link>
        );
      })}
    </nav>
  );
}

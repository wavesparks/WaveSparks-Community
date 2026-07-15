import { UserButton } from "@clerk/nextjs";
import {
  CalendarDays,
  LockKeyhole,
  PenLine,
  Shield,
  UserCircle2,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import {
  SpaceSectionNavigation,
  SpaceSwitcher,
  type SpaceShellSpace,
} from "@/components/layout/space-shell-navigation";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/ui/brand-logo";
import { LinkButton } from "@/components/ui/link-button";
import { wavesparksBrand } from "@/lib/brand";
import {
  getCommunityDisplayName,
  getCommunityTypeLabel,
  WAVESPARKS_COMMUNITY_NAME,
} from "@/lib/community-copy";
import type { ViewerContext } from "@/lib/domain";
import { isClerkConfigured } from "@/lib/env";
import { getMemberDisplayName } from "@/lib/member-display-name";

function formatSpaceDate(value?: string) {
  if (!value) return undefined;

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function spaceDateLabel(space: SpaceShellSpace) {
  const start = formatSpaceDate(space.startsAt);
  const end = formatSpaceDate(space.endsAt);

  if (start && end) return `${start} – ${end}`;
  if (start) return `Starts ${start}`;
  if (end) return `Ends ${end}`;
  return space.eventLabel || undefined;
}

function lifecycleStatus(space: SpaceShellSpace) {
  if (space.lifecycle === "ended") return "Past";
  if (space.lifecycle === "upcoming") return "Upcoming";
  if (space.lifecycle === "draft") return "Draft";
  return undefined;
}

export function SpaceShell({
  canInteract,
  children,
  currentSpace,
  spaces,
  viewer,
}: {
  canInteract: boolean;
  children: ReactNode;
  currentSpace: SpaceShellSpace;
  spaces: SpaceShellSpace[];
  viewer: ViewerContext;
}) {
  const theme = wavesparksBrand.theme;
  const clerkConfigured = isClerkConfigured();
  const dateLabel = currentSpace.kind === "event" ? spaceDateLabel(currentSpace) : undefined;
  const statusLabel = lifecycleStatus(currentSpace);
  const communityName = getCommunityDisplayName(currentSpace);
  const memberName = getMemberDisplayName({
    email: viewer.user.email,
    name: viewer.user.name,
    preferredName: viewer.profile?.preferredName,
  });
  const audienceDescription =
    currentSpace.kind === "main"
      ? `Conversations, members and matches here are visible only to ${WAVESPARKS_COMMUNITY_NAME} members.`
      : "Conversations, participants and matches here are visible only to people in this Event.";

  return (
    <div
      className="ws-page-shell min-h-screen text-[var(--ink)]"
      style={
        {
          "--accent": theme.accent,
          "--accent-soft": theme.accentSoft,
          "--canvas": theme.canvas,
          "--ink": theme.ink,
          "--ink-soft": theme.inkSoft,
          "--cyan": theme.cyan,
          "--cyan-soft": theme.cyanSoft,
          "--gold": theme.gold,
          "--night": theme.night,
          "--blue": theme.blue,
        } as CSSProperties
      }
    >
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 flex-wrap items-center gap-3 py-2.5 lg:flex-nowrap">
            <Link
              aria-label="Home"
              className="flex shrink-0 items-center"
              href={`/org/${viewer.org.slug}`}
            >
              <BrandLogo className="h-8 max-w-[150px]" />
            </Link>

            <div className="min-w-[220px] flex-1 sm:max-w-sm">
              <SpaceSwitcher
                currentSpace={currentSpace}
                orgSlug={viewer.org.slug}
                spaces={spaces}
              />
            </div>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <LinkButton
                className="hidden sm:inline-flex"
                href={`/org/${viewer.org.slug}`}
                size="sm"
                variant="ghost"
              >
                Home
              </LinkButton>
              {viewer.canAdmin ? (
                <LinkButton
                  href={`/org/${viewer.org.slug}/admin/members`}
                  size="sm"
                  variant="ghost"
                >
                  <Shield aria-hidden className="size-4" />
                  <span className="hidden md:inline">Admin</span>
                </LinkButton>
              ) : null}
              <LinkButton
                href={`/org/${viewer.org.slug}/requests`}
                size="sm"
                variant="ghost"
              >
                Inbox
              </LinkButton>
              <LinkButton
                href={`/org/${viewer.org.slug}/profile`}
                size="sm"
                variant="secondary"
              >
                <UserCircle2 aria-hidden className="size-4" />
                <span className="hidden md:inline">Profile</span>
              </LinkButton>
              <div className="hidden border-l border-[var(--line)] pl-2 lg:block">
                {clerkConfigured ? (
                  <UserButton />
                ) : (
                  <div className="flex items-center gap-2">
                    <Avatar
                      className="size-8"
                      name={memberName}
                      src={viewer.profile?.profilePhoto ?? viewer.user.imageUrl}
                    />
                    <SignOutButton
                      callbackUrl={`/org/${viewer.org.slug}`}
                      mode="local"
                      tone="light"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--line)] py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--night)] text-[var(--surface)] shadow-sm">
                  {currentSpace.kind === "main" ? (
                    <LockKeyhole aria-hidden className="size-4" />
                  ) : (
                    <CalendarDays aria-hidden className="size-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-lg font-semibold text-[var(--ink)]">
                      {communityName}
                    </p>
                    {currentSpace.kind === "event" ? (
                      <>
                        <Badge variant="accent">{getCommunityTypeLabel(currentSpace)}</Badge>
                        {statusLabel ? <Badge variant="muted">{statusLabel}</Badge> : null}
                      </>
                    ) : null}
                    {dateLabel ? (
                      <span className="text-xs font-semibold text-[var(--ink-soft)]">
                        {dateLabel}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--ink-soft)] sm:text-sm">
                    {audienceDescription}
                  </p>
                </div>
              </div>
              {canInteract ? (
                <LinkButton
                  className="w-full lg:w-auto"
                  href={`/org/${viewer.org.slug}/s/${currentSpace.slug}/compose`}
                  size="sm"
                >
                  <PenLine aria-hidden className="size-4" />
                  Post in {communityName}
                </LinkButton>
              ) : null}
            </div>
          </div>

          <div className="border-t border-[var(--line)] py-2">
            <SpaceSectionNavigation
              orgSlug={viewer.org.slug}
              spaceSlug={currentSpace.slug}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {children}
      </main>
    </div>
  );
}

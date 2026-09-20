import { UserButton } from "@clerk/nextjs";
import {
  CalendarDays,
  GraduationCap,
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
      <header className="relative z-40 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-xl sm:sticky sm:top-0">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-16 flex-wrap items-center gap-2 py-2 sm:gap-3 sm:py-2.5 lg:flex-nowrap">
            <Link
              aria-label="Home"
              className="flex shrink-0 items-center"
              href={`/org/${viewer.org.slug}`}
            >
              <BrandLogo className="w-24 sm:w-[150px]" />
            </Link>

            <div className="min-w-0 flex-1 sm:min-w-[220px] sm:max-w-sm">
              <SpaceSwitcher
                currentSpace={currentSpace}
                orgSlug={viewer.org.slug}
                spaces={spaces}
              />
            </div>

            <div className="flex w-full items-center justify-end gap-1.5 sm:ml-auto sm:w-auto sm:gap-2">
              <LinkButton
                className="hidden sm:inline-flex"
                href={`/org/${viewer.org.slug}`}
                size="sm"
                variant="ghost"
              >
                Home
              </LinkButton>
              {viewer.canMentor ? (
                <LinkButton
                  aria-label="Mentoring"
                  className="px-2 sm:px-3"
                  href={`/org/${viewer.org.slug}/mentoring`}
                  size="sm"
                  variant="ghost"
                >
                  <GraduationCap aria-hidden className="size-4" />
                  <span className="hidden xl:inline">Mentoring</span>
                </LinkButton>
              ) : null}
              {viewer.canAdmin ? (
                <LinkButton
                  aria-label="Admin"
                  className="px-2 sm:px-3"
                  href={`/org/${viewer.org.slug}/admin/members`}
                  size="sm"
                  variant="ghost"
                >
                  <Shield aria-hidden className="size-4" />
                  <span className="hidden md:inline">Admin</span>
                </LinkButton>
              ) : null}
              <LinkButton
                className="px-2 sm:px-3"
                href={`/org/${viewer.org.slug}/requests`}
                size="sm"
                variant="ghost"
              >
                Inbox
              </LinkButton>
              <LinkButton
                aria-label="Profile"
                className="px-2 sm:px-3"
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

          <div className="border-t border-[var(--line)] py-2 sm:py-3">
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              <div className="flex min-w-0 items-center gap-2 sm:items-start sm:gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--night)] text-[var(--surface)] shadow-sm sm:size-10">
                  {currentSpace.kind === "main" ? (
                    <LockKeyhole aria-hidden className="size-4" />
                  ) : (
                    <CalendarDays aria-hidden className="size-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-semibold text-[var(--ink)] sm:text-lg">
                      {communityName}
                    </p>
                    {currentSpace.kind === "event" ? (
                      <>
                        <Badge className="hidden sm:inline-flex" variant="accent">
                          {getCommunityTypeLabel(currentSpace)}
                        </Badge>
                        {statusLabel ? (
                          <Badge className="hidden sm:inline-flex" variant="muted">
                            {statusLabel}
                          </Badge>
                        ) : null}
                      </>
                    ) : null}
                    {dateLabel ? (
                      <span className="hidden text-xs font-semibold text-[var(--ink-soft)] sm:inline">
                        {dateLabel}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 hidden line-clamp-2 text-xs leading-5 text-[var(--ink-soft)] sm:block sm:text-sm">
                    {audienceDescription}
                  </p>
                </div>
              </div>
              {canInteract ? (
                <LinkButton
                  aria-label={`Post in ${communityName}`}
                  className="shrink-0 px-2.5 sm:px-3"
                  href={`/org/${viewer.org.slug}/s/${currentSpace.slug}/compose?kind=feed`}
                  size="sm"
                >
                  <PenLine aria-hidden className="size-4" />
                  <span className="hidden sm:inline">Post in {communityName}</span>
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

import { UserButton } from "@clerk/nextjs";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  GraduationCap,
  LockKeyhole,
  Shield,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import type { SpaceShellSpace } from "@/components/layout/space-shell-navigation";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { wavesparksBrand } from "@/lib/brand";
import {
  getCommunityDisplayName,
  WAVESPARKS_COMMUNITY_NAME,
} from "@/lib/community-copy";
import type { ViewerContext } from "@/lib/domain";
import { isClerkConfigured } from "@/lib/env";
import { getMemberDisplayName } from "@/lib/member-display-name";
import { cn } from "@/lib/utils";

function formatDate(value?: string) {
  if (!value) return undefined;
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function dateLabel(space: SpaceShellSpace) {
  const start = formatDate(space.startsAt);
  const end = formatDate(space.endsAt);
  if (start && end) return `${start} – ${end}`;
  if (start) return `Starts ${start}`;
  if (end) return `Ends ${end}`;
  return space.eventLabel || "Dates to be announced";
}

function lifecycleLabel(space: SpaceShellSpace) {
  if (space.kind === "main") return "Community";
  return space.lifecycle === "ended" ? "Past event" : "Event";
}

function SpaceCard({
  locked = false,
  lockedReason = "invitation",
  orgSlug,
  space,
}: {
  locked?: boolean;
  lockedReason?: "account" | "invitation";
  orgSlug: string;
  space: SpaceShellSpace;
}) {
  const Icon = locked ? LockKeyhole : space.kind === "main" ? Sparkles : CalendarDays;
  const content = (
    <Card
      className={cn(
        "group h-full overflow-hidden p-0 transition",
        locked
          ? "border-dashed bg-[var(--surface-muted)] shadow-none"
          : "hover:-translate-y-0.5 hover:border-[var(--accent)]/35 hover:shadow-[0_20px_45px_rgba(34,27,68,0.1)]",
      )}
    >
      <div
        className={cn(
          "h-1.5",
          locked
            ? "bg-[var(--line)]"
            : space.kind === "main"
              ? "bg-[linear-gradient(90deg,var(--gold),var(--accent))]"
              : space.lifecycle === "ended"
                ? "bg-[var(--ink-soft)]/35"
                : "bg-[linear-gradient(90deg,var(--cyan),var(--accent))]",
        )}
      />
      <div className="flex h-[calc(100%-0.375rem)] flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-lg",
              locked
                ? "bg-[var(--line)] text-[var(--ink-soft)]"
                : "bg-[var(--accent-soft)] text-[var(--accent)]",
            )}
          >
            <Icon aria-hidden className="size-5" />
          </div>
          <Badge variant={locked || space.lifecycle === "ended" ? "muted" : "accent"}>
            {locked
              ? lockedReason === "account"
                ? "Account unavailable"
                : "Invitation only"
              : lifecycleLabel(space)}
          </Badge>
        </div>

        <div className="mt-5">
          <h2 className="text-xl font-semibold text-[var(--ink)]">
            {getCommunityDisplayName(space)}
          </h2>
          <p className="mt-2 min-h-12 text-sm leading-6 text-[var(--ink-soft)]">
            {locked
              ? lockedReason === "account"
                ? "This account is currently unavailable, so you can’t open the community or your events."
                : `${WAVESPARKS_COMMUNITY_NAME} is invitation-only. Joining an event won’t add you automatically.`
              : space.kind === "main"
                ? "Meet members, join conversations and discover people with shared interests."
                : "Meet other participants, join the conversation and find people to connect with."}
          </p>
        </div>

        {space.kind === "event" ? (
          <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-[var(--ink-soft)]">
            <Clock3 aria-hidden className="size-4" />
            {dateLabel(space)}
          </div>
        ) : null}

        <div className="mt-auto pt-5">
          {locked ? (
            <div className="rounded-lg bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--ink-soft)] ring-1 ring-[var(--line)]">
              {lockedReason === "account"
                ? "Contact the community team if you believe this account status is incorrect."
                : `If you are invited to ${WAVESPARKS_COMMUNITY_NAME}, it will appear here.`}
            </div>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">
              {space.kind === "main" ? "Visit community" : "View event"}
              <ArrowRight
                aria-hidden
                className="size-4 transition-transform group-hover:translate-x-0.5"
              />
            </span>
          )}
        </div>
      </div>
    </Card>
  );

  if (locked) return content;

  return (
    <Link
      className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
      href={`/org/${orgSlug}/s/${space.slug}/feed`}
    >
      {content}
    </Link>
  );
}

export function MySpacesView({
  accessibleSpaces,
  mainSpace,
  viewer,
}: {
  accessibleSpaces: SpaceShellSpace[];
  mainSpace: SpaceShellSpace;
  viewer: ViewerContext;
}) {
  const theme = wavesparksBrand.theme;
  const clerkConfigured = isClerkConfigured();
  const memberName = getMemberDisplayName({
    email: viewer.user.email,
    name: viewer.user.name,
    preferredName: viewer.profile?.preferredName,
  });
  const mainAccess = accessibleSpaces.find((record) => record.id === mainSpace.id);
  const accountUnavailable =
    viewer.membership.accountStatus === "suspended" ||
    viewer.membership.accountStatus === "deprovisioned";
  const activeEvents = accessibleSpaces.filter(
    (space) => space.kind === "event" && space.lifecycle !== "ended",
  );
  const pastEvents = accessibleSpaces.filter(
    (space) => space.kind === "event" && space.lifecycle === "ended",
  );

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
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <BrandLogo className="h-8 max-w-[160px]" />
          <p className="hidden border-l border-[var(--line)] pl-3 text-sm font-semibold text-[var(--ink-soft)] sm:block">
            Home
          </p>
          <div className="ml-auto flex items-center gap-2">
            {viewer.canMentor ? (
              <LinkButton
                aria-label="Mentoring"
                href={`/org/${viewer.org.slug}/mentoring`}
                size="sm"
                variant="ghost"
              >
                <GraduationCap aria-hidden className="size-4" />
                <span className="hidden sm:inline">Mentoring</span>
              </LinkButton>
            ) : null}
            {viewer.canAdmin ? (
              <LinkButton
                aria-label="Admin"
                href={`/org/${viewer.org.slug}/admin/members`}
                size="sm"
                variant="ghost"
              >
                <Shield aria-hidden className="size-4" />
                <span className="hidden sm:inline">Admin</span>
              </LinkButton>
            ) : null}
            <LinkButton href={`/org/${viewer.org.slug}/profile`} size="sm" variant="secondary">
              Profile
            </LinkButton>
            {clerkConfigured ? (
              <UserButton />
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <Avatar
                  className="size-8"
                  name={memberName}
                  src={viewer.profile?.profilePhoto ?? viewer.user.imageUrl}
                />
                <SignOutButton callbackUrl={`/org/${viewer.org.slug}`} mode="local" tone="light" />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="max-w-3xl">
          <SectionHeading
            description={`${WAVESPARKS_COMMUNITY_NAME} and your events each have their own people, conversations and matches.`}
            eyebrow="Wavesparks"
            level={1}
            title={`Welcome back, ${memberName}`}
          />
        </div>

        <section aria-labelledby="main-community-heading" className="mt-10 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--ink)]" id="main-community-heading">
              {WAVESPARKS_COMMUNITY_NAME}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              A private community for Wavesparks members.
            </p>
          </div>
          <div className="max-w-xl">
            <SpaceCard
              locked={!mainAccess}
              lockedReason={accountUnavailable ? "account" : "invitation"}
              orgSlug={viewer.org.slug}
              space={mainAccess ?? mainSpace}
            />
          </div>
        </section>

        <section aria-labelledby="active-events-heading" className="mt-10 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--ink)]" id="active-events-heading">
              Your events
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Each event has its own participants, conversations and matches.
            </p>
          </div>
          {activeEvents.length ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {activeEvents.map((space) => (
                <SpaceCard key={space.id} orgSlug={viewer.org.slug} space={space} />
              ))}
            </div>
          ) : (
            <Card className="max-w-2xl">
              <p className="font-semibold text-[var(--ink)]">No active events</p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                When you join an event, it will appear here.
              </p>
            </Card>
          )}
        </section>

        {pastEvents.length ? (
          <section aria-labelledby="past-events-heading" className="mt-10 space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-[var(--ink)]" id="past-events-heading">
                Past events
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Revisit past events and keep in touch with other participants.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {pastEvents.map((space) => (
                <SpaceCard key={space.id} orgSlug={viewer.org.slug} space={space} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

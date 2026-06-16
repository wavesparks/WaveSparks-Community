import {
  Bell,
  BookOpen,
  LogIn,
  PenLine,
  Shield,
  UserCircle2,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { SignOutButton } from "@/components/layout/sign-out-button";
import { Avatar } from "@/components/ui/avatar";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { wavesparksBrand } from "@/lib/brand";
import type { Organization, ViewerContext } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { canAccessFeed } from "@/server/permissions";

const memberLinks = [
  { href: "feed", label: "Forum" },
  { href: "people", label: "People", icon: UsersRound },
  { href: "knowledge", label: "Knowledge", icon: BookOpen },
  { href: "opportunities", label: "Opportunities" },
  { href: "matches", label: "Matches" },
  { href: "requests", label: "Requests", icon: Bell },
];

function memberSetupHref(slug: string, viewer: ViewerContext) {
  return viewer.membership.status === "approved"
    ? `/org/${slug}/onboarding`
    : `/org/${slug}/pending`;
}

export function ForumShell({
  children,
  currentPath,
  org,
  viewer,
}: {
  children: ReactNode;
  currentPath: string;
  org: Organization;
  viewer?: ViewerContext | null;
}) {
  const canInteract = viewer ? canAccessFeed(viewer.membership, viewer.profile) : false;
  const visibleLinks = canInteract ? memberLinks : memberLinks.slice(0, 1);
  const theme = wavesparksBrand.theme;

  return (
    <div
      className="ws-page-shell text-[var(--ink)]"
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
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--surface)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            className="flex min-w-0 items-center gap-3"
            href={`/org/${org.slug}/feed`}
          >
            <BrandLogo className="h-8 shrink-0" />
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-xs font-semibold uppercase text-[var(--accent)]">
                Community
              </p>
              <p className="hidden truncate text-xs text-[var(--ink-soft)] sm:block">{org.tagline}</p>
            </div>
          </Link>

          <nav
            aria-label="Forum navigation"
            className="ml-2 hidden items-center gap-1 md:flex"
          >
            {visibleLinks.map((link) => {
              const href = `/org/${org.slug}/${link.href}`;
              const Icon = link.icon;

              return (
                <Link
                  aria-current={currentPath === href ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition",
                    currentPath === href
                      ? "bg-[var(--night)] text-[var(--surface)] shadow-[0_10px_24px_rgba(34,27,68,0.18)]"
                      : "text-[var(--ink-soft)] hover:bg-[var(--cyan-soft)] hover:text-[var(--ink)]",
                  )}
                  href={href}
                  key={href}
                >
                  {Icon ? <Icon className="size-4" /> : null}
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
            {viewer?.canAdmin ? (
              <Button asChild size="sm" variant="ghost">
                <Link href={`/org/${org.slug}/admin/members`}>
                  <Shield className="size-4" />
                  Admin
                </Link>
              </Button>
            ) : null}

            {canInteract ? (
              <>
                <Button asChild className="hidden sm:inline-flex" size="sm">
                  <Link href={`/org/${org.slug}/compose?kind=feed`}>
                    <PenLine className="size-4" />
                    Post
                  </Link>
                </Button>
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/org/${org.slug}/profile`}>
                    <UserCircle2 className="size-4" />
                    <span className="hidden sm:inline">Profile</span>
                  </Link>
                </Button>
              </>
            ) : viewer ? (
              <Button asChild size="sm">
                <Link href={memberSetupHref(org.slug, viewer)}>
                  <UserCircle2 className="size-4" />
                  {viewer.membership.status === "approved" ? "Complete profile" : "Application"}
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href={`/org/${org.slug}/signin`}>
                  <LogIn className="size-4" />
                  Sign in
                </Link>
              </Button>
            )}

            {viewer ? (
              <div className="hidden items-center gap-2 border-l border-[var(--line)] pl-2 lg:flex">
                <Avatar
                  className="size-8"
                  name={viewer.profile?.preferredName ?? viewer.user.name}
                  src={viewer.profile?.profilePhoto ?? viewer.user.imageUrl}
                />
                <SignOutButton callbackUrl={`/org/${org.slug}/feed`} tone="light" />
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {children}
      </main>
    </div>
  );
}

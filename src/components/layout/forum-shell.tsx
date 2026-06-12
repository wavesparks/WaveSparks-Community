import {
  Bell,
  LogIn,
  PenLine,
  Shield,
  UserCircle2,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { SignOutButton } from "@/components/layout/sign-out-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { Organization, ViewerContext } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { canAccessFeed } from "@/server/permissions";

const memberLinks = [
  { href: "feed", label: "Forum" },
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

  return (
    <div
      className="min-h-screen bg-[var(--canvas)] text-slate-950"
      style={
        {
          "--accent": org.theme.accent,
          "--accent-soft": org.theme.accentSoft,
          "--canvas": "#f6f7fb",
          "--ink": org.theme.ink,
        } as CSSProperties
      }
    >
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            className="flex min-w-0 items-center gap-3"
            href={`/org/${org.slug}/feed`}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
              WS
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{org.name}</p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{org.tagline}</p>
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
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
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
              <div className="hidden items-center gap-2 border-l border-slate-200 pl-2 lg:flex">
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

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}

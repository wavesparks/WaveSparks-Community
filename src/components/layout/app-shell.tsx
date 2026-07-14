import {
  Bell,
  BookOpen,
  Compass,
  LayoutDashboard,
  Shield,
  Sparkles,
  UserCircle2,
  UsersRound,
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import type { CSSProperties } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/ui/brand-logo";
import { NavLink } from "@/components/layout/nav-link";
import { SignOutButton } from "@/components/layout/sign-out-button";
import type { ViewerContext } from "@/lib/domain";
import { isClerkConfigured } from "@/lib/env";
import { wavesparksBrand } from "@/lib/brand";
import { cn } from "@/lib/utils";

const memberLinks = [
  { href: "feed", label: "Feed", icon: Compass },
  { href: "people", label: "People", icon: UsersRound },
  { href: "knowledge", label: "Knowledge", icon: BookOpen },
  { href: "matches", label: "Matches", icon: Sparkles },
  { href: "opportunities", label: "Opportunities", icon: LayoutDashboard },
  { href: "requests", label: "Requests", icon: Bell },
  { href: "profile", label: "My Profile", icon: UserCircle2 },
];

const adminLinks = [
  { href: "admin", label: "Overview" },
  { href: "admin/members", label: "Members" },
  { href: "admin/profiles", label: "Profiles" },
  { href: "admin/posts", label: "Posts" },
  { href: "admin/requests", label: "Requests" },
  { href: "admin/matches", label: "Matches" },
  { href: "admin/analytics", label: "Analytics" },
  { href: "admin/settings", label: "Settings" },
];

export function AppShell({
  viewer,
  currentPath,
  children,
}: {
  viewer: ViewerContext;
  currentPath: string;
  children: React.ReactNode;
}) {
  const visibleMemberLinks = viewer.profile?.onboardingComplete
    ? memberLinks
    : [{ href: "onboarding", label: "Complete profile", icon: UserCircle2 }];
  const theme = wavesparksBrand.theme;
  const clerkConfigured = isClerkConfigured();

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
      <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[280px_1fr]">
        <aside className="ws-night-panel border-b border-[var(--surface)] text-[var(--surface)] lg:min-h-screen lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col gap-3 p-3 sm:p-4 lg:gap-6 lg:p-5">
            <div className="overflow-hidden rounded-lg border border-[var(--cyan)] bg-[var(--blue)] p-3 shadow-[0_22px_60px_rgba(0,0,0,0.22)] lg:p-4">
              <div className="space-y-3">
                <BrandLogo className="h-7 max-w-[190px]" tone="light" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--surface)]">{viewer.org.name} Community</p>
                  <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--surface)]/70">
                    {viewer.org.tagline}
                  </p>
                </div>
              </div>
              <Badge className="mt-3 bg-[var(--gold)] text-[var(--night)] ring-[var(--surface)] lg:mt-4">
                {viewer.membership.affiliationType}
              </Badge>
            </div>
            <nav
              className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1"
              aria-label="Member navigation"
            >
              {visibleMemberLinks.map((link) => {
                const href = `/org/${viewer.org.slug}/${link.href}`;
                const active = currentPath === href;
                const Icon = link.icon;
                return (
                  <NavLink
                    active={active}
                    className={cn(
                      "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                      active
                        ? "bg-[var(--surface)] text-[var(--night)] shadow-[0_12px_30px_rgba(0,0,0,0.18)]"
                        : "text-[var(--cyan-soft)] hover:bg-[var(--blue)] hover:text-[var(--surface)]",
                    )}
                    href={href}
                    key={href}
                  >
                    <Icon className="size-4" />
                    <span className="min-w-0 flex-1">{link.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            {viewer.canAdmin ? (
              <div className="rounded-lg border border-[var(--cyan)] bg-[var(--blue)] p-3">
                <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase text-[var(--cyan-soft)]">
                  <Shield className="size-4" />
                  Admin
                </div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
                  {adminLinks.map((link) => {
                    const href = `/org/${viewer.org.slug}/${link.href}`;
                    const active =
                      currentPath === href ||
                      (link.href === "admin/members" &&
                        currentPath.startsWith(`/org/${viewer.org.slug}/admin/cohorts`));
                    return (
                      <NavLink
                        active={active}
                        className={cn(
                          "flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                          active
                            ? "bg-[var(--surface)] text-[var(--night)] shadow-sm"
                            : "text-[var(--cyan-soft)] hover:bg-[var(--night)] hover:text-[var(--surface)]",
                        )}
                        href={href}
                        key={href}
                      >
                        <span className="min-w-0 flex-1">{link.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-auto flex items-center justify-between gap-3 rounded-lg border border-[var(--cyan)] bg-[var(--blue)] p-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  className="size-10 ring-[var(--gold)]"
                  name={viewer.profile?.preferredName ?? viewer.user.name}
                  src={viewer.profile?.profilePhoto ?? viewer.user.imageUrl}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {viewer.profile?.preferredName ?? viewer.user.name}
                  </p>
                  <p className="text-xs capitalize text-[var(--cyan-soft)]">
                    {viewer.membership.status}
                  </p>
                </div>
              </div>
              {clerkConfigured ? (
                <UserButton />
              ) : (
                <SignOutButton callbackUrl={`/org/${viewer.org.slug}`} mode="local" />
              )}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

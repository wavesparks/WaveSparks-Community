import {
  Bell,
  Compass,
  LayoutDashboard,
  Shield,
  Sparkles,
  UserCircle2,
} from "lucide-react";
import type { CSSProperties } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/ui/brand-logo";
import { NavLink } from "@/components/layout/nav-link";
import { SignOutButton } from "@/components/layout/sign-out-button";
import type { ViewerContext } from "@/lib/domain";
import { cn } from "@/lib/utils";

const memberLinks = [
  { href: "feed", label: "Feed", icon: Compass },
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

  return (
    <div
      className="min-h-screen bg-[var(--canvas)] text-slate-950"
      style={
        {
          "--accent": viewer.org.theme.accent,
          "--accent-soft": viewer.org.theme.accentSoft,
          "--canvas": viewer.org.theme.canvas,
          "--ink": viewer.org.theme.ink,
        } as CSSProperties
      }
    >
      <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-white/10 bg-[var(--night)] text-white lg:min-h-screen lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col gap-3 p-3 sm:p-4 lg:gap-6 lg:p-5">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 lg:p-4">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-white">
                  <BrandLogo className="h-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{viewer.org.name} Community</p>
                  <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-slate-300">
                    {viewer.org.tagline}
                  </p>
                </div>
              </div>
              <Badge className="mt-3 bg-white/10 text-white ring-white/10 lg:mt-4">
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
                        ? "bg-white text-[var(--ink)] shadow-sm"
                        : "text-slate-300 hover:bg-white/10 hover:text-white",
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
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  <Shield className="size-4" />
                  Admin
                </div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
                  {adminLinks.map((link) => {
                    const href = `/org/${viewer.org.slug}/${link.href}`;
                    const active = currentPath === href;
                    return (
                      <NavLink
                        active={active}
                        className={cn(
                          "flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                          active
                            ? "bg-white text-[var(--ink)] shadow-sm"
                            : "text-slate-300 hover:bg-white/10 hover:text-white",
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

            <div className="mt-auto flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  className="size-10 ring-white/20"
                  name={viewer.profile?.preferredName ?? viewer.user.name}
                  src={viewer.profile?.profilePhoto ?? viewer.user.imageUrl}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {viewer.profile?.preferredName ?? viewer.user.name}
                  </p>
                  <p className="text-xs capitalize text-slate-400">
                    {viewer.membership.status}
                  </p>
                </div>
              </div>
              <SignOutButton callbackUrl={`/org/${viewer.org.slug}`} />
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

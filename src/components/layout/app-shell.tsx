import Link from "next/link";
import { Bell, Compass, LayoutDashboard, Shield, Sparkles, UserCircle2 } from "lucide-react";
import type { CSSProperties } from "react";

import { Badge } from "@/components/ui/badge";
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
  return (
    <div
      className="min-h-screen bg-[var(--canvas)]"
      style={
        {
          "--accent": viewer.org.theme.accent,
          "--accent-soft": viewer.org.theme.accentSoft,
          "--canvas": viewer.org.theme.canvas,
          "--ink": viewer.org.theme.ink,
        } as CSSProperties
      }
    >
      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-6 px-4 py-6 lg:flex-row lg:px-6">
        <aside className="w-full shrink-0 rounded-[32px] border border-white/70 bg-[#231f2d] p-6 text-white shadow-[0_24px_60px_rgba(35,31,45,0.28)] lg:w-[300px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-orange-200">
                  {viewer.org.name}
                </p>
                <h1 className="mt-2 text-2xl font-semibold">{viewer.org.tagline}</h1>
              </div>
            </div>
            <p className="text-sm text-slate-300">{viewer.org.description}</p>
            <Badge className="w-fit bg-white/10 text-orange-100 ring-0">
              {viewer.membership.affiliationType}
            </Badge>
          </div>

          <nav className="mt-8 space-y-2">
            {memberLinks.map((link) => {
              const href = `/org/${viewer.org.slug}/${link.href}`;
              const active = currentPath === href;
              const Icon = link.icon;
              return (
                <Link
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition",
                    active
                      ? "bg-white text-[#231f2d]"
                      : "text-slate-200 hover:bg-white/10 hover:text-white",
                  )}
                  href={href}
                  key={href}
                >
                  <Icon className="size-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {viewer.canAdmin ? (
            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Shield className="size-4" />
                Admin surface
              </div>
              <div className="space-y-1">
                {adminLinks.map((link) => {
                  const href = `/org/${viewer.org.slug}/${link.href}`;
                  const active = currentPath === href;
                  return (
                    <Link
                      className={cn(
                        "block rounded-2xl px-3 py-2 text-sm transition",
                        active
                          ? "bg-white text-[#231f2d]"
                          : "text-slate-300 hover:bg-white/10 hover:text-white",
                      )}
                      href={href}
                      key={href}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex items-center justify-between rounded-3xl border border-white/10 bg-white/5 p-4">
            <div>
              <p className="text-sm font-semibold">{viewer.profile?.preferredName ?? viewer.user.name}</p>
              <p className="text-xs text-slate-300">{viewer.membership.status}</p>
            </div>
            <SignOutButton />
          </div>
        </aside>

        <main className="flex-1 rounded-[32px] bg-white/65 p-4 shadow-[0_28px_70px_rgba(15,23,42,0.08)] backdrop-blur sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

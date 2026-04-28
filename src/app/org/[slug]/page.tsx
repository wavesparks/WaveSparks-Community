import Link from "next/link";
import { ArrowRight, Lock, Sparkles, Users2 } from "lucide-react";
import type { CSSProperties } from "react";

import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { getAnalyticsSnapshot, getOrganizationBySlug } from "@/server/store";

export default async function OrganizationLanding({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrganizationBySlug(slug);
  const viewer = await getViewerContext(slug);

  if (!org) {
    return null;
  }

  const analytics = await getAnalyticsSnapshot(org.id);

  const destination = !viewer
    ? `/org/${slug}/signin`
    : viewer.membership.status === "approved" && viewer.profile?.onboardingComplete
      ? `/org/${slug}/feed`
      : `/org/${slug}/pending`;

  return (
    <main
      className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8"
      style={
        {
          "--accent": org.theme.accent,
          "--accent-soft": org.theme.accentSoft,
          "--canvas": org.theme.canvas,
          "--ink": org.theme.ink,
        } as CSSProperties
      }
    >
      <section className="overflow-hidden rounded-[40px] border border-white/70 bg-[#1f1d2b] px-6 py-10 text-white shadow-[0_36px_90px_rgba(31,29,43,0.28)] sm:px-10 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-orange-200">
                {org.name}
              </p>
              <h1 className="max-w-3xl text-4xl leading-tight sm:text-6xl">
                {org.tagline}
              </h1>
              <p className="max-w-2xl text-lg text-slate-300">{org.description}</p>
            </div>
            <div className="flex flex-wrap gap-4">
              <Link
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(255,120,90,0.32)]"
                href={destination}
              >
                {viewer ? "Continue" : "Sign in to apply"}
                <ArrowRight className="size-4" />
              </Link>
              <div className="rounded-full border border-white/10 px-6 py-3 text-sm text-slate-300">
                Semi-private · Admin approved · No open directory
              </div>
            </div>
          </div>
          <Card className="bg-white/10 text-white shadow-none">
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {[
                {
                  label: "Approved members",
                  value: analytics.approvedMembers,
                  icon: Users2,
                },
                {
                  label: "Accepted intros",
                  value: analytics.introRequestsAccepted,
                  icon: Sparkles,
                },
                {
                  label: "Trust gates",
                  value: "3",
                  icon: Lock,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div className="rounded-[24px] border border-white/10 bg-white/5 p-4" key={item.label}>
                    <Icon className="size-5 text-orange-200" />
                    <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-300">
                      {item.label}
                    </p>
                    <p className="mt-2 text-3xl font-semibold">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {org.membershipRules.map((rule) => (
          <Card key={rule}>
            <p className="text-sm text-slate-700">{rule}</p>
          </Card>
        ))}
      </section>

      <section className="space-y-6 rounded-[36px] bg-white/65 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
        <SectionHeading
          eyebrow="What happens next"
          title="The member journey is intentionally gated and context-rich"
          description="Wavespark is designed so members earn context through profiles, posts, and intros rather than open browsing."
        />
        <div className="grid gap-4 md:grid-cols-4">
          {[
            "Sign in with Google, GitHub, or LinkedIn",
            "Complete a structured profile for matching",
            "Wait for admin approval to unlock the community",
            "Discover people through feed, AI matches, and intros",
          ].map((step, index) => (
            <Card key={step}>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                Step {index + 1}
              </p>
              <p className="mt-3 text-sm text-slate-700">{step}</p>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

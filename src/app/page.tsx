import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles, Users2 } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[40px] border border-white/70 bg-[#1f1d2b] px-6 py-10 text-white shadow-[0_36px_90px_rgba(31,29,43,0.28)] sm:px-10 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-orange-200">
                Wavespark Platform
              </p>
              <h1 className="max-w-3xl text-4xl leading-tight sm:text-6xl">
                Structured community energy for founders who need signal, not noise.
              </h1>
              <p className="max-w-2xl text-lg text-slate-300">
                Wavespark pairs a semi-private feed, structured profiles, admin trust
                gates, and explainable AI matches so the right people surface without
                turning the community into an open directory.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <Link
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(255,120,90,0.32)]"
                href="/org/wavespark"
              >
                Enter Wavespark
                <ArrowRight className="size-4" />
              </Link>
              <div className="rounded-full border border-white/10 px-6 py-3 text-sm text-slate-300">
                Vercel-first • Multi-tenant-ready • Admin-gated
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {[
              {
                icon: ShieldCheck,
                title: "Trust first",
                body: "Admin approvals, hidden contact details, and no open member directory.",
              },
              {
                icon: Sparkles,
                title: "AI with context",
                body: "Structured + semantic matching with plain-language reasons for every suggestion.",
              },
              {
                icon: Users2,
                title: "Warm community flow",
                body: "Posts, asks, opportunities, and intros all live in one calmer rhythm.",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  className="rounded-[28px] border border-white/10 bg-white/5 p-5"
                  key={item.title}
                >
                  <Icon className="size-5 text-orange-200" />
                  <h2 className="mt-4 text-xl">{item.title}</h2>
                  <p className="mt-2 text-sm text-slate-300">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6 py-10 lg:grid-cols-3">
        {[
          "Launches at /org/wavespark with multi-tenant schema, routing, and permission boundaries from day one.",
          "Members discover each other through the feed, surfaced matches, intro requests, and admin-curated context.",
          "In-app chat stays out of scope in V1 so the product stays crisp around trust, signal, and handoff.",
        ].map((point) => (
          <div
            className="rounded-[28px] border border-white/70 bg-white/75 p-6 text-sm text-slate-700 shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
            key={point}
          >
            {point}
          </div>
        ))}
      </section>
    </main>
  );
}

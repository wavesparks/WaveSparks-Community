function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[var(--line)] ${className}`} />;
}

export function OrgRouteLoading() {
  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      <div
        aria-label="Loading workspace"
        className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center gap-6 px-4 py-8 sm:px-6 lg:px-8"
        role="status"
      >
        <section className="rounded-lg border border-[var(--surface)] bg-[var(--night)] p-6 shadow-[0_24px_70px_rgba(1,2,10,0.22)] sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-7">
              <div className="space-y-4">
                <div className="h-3 w-28 animate-pulse rounded bg-[var(--surface)]/30" />
                <div className="h-11 w-full max-w-2xl animate-pulse rounded bg-[var(--surface)]/20" />
                <div className="h-11 w-4/5 max-w-xl animate-pulse rounded bg-[var(--surface)]/20" />
                <div className="space-y-2">
                  <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-[var(--surface)]/15" />
                  <div className="h-4 w-5/6 max-w-xl animate-pulse rounded bg-[var(--surface)]/15" />
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="h-10 w-36 animate-pulse rounded-full bg-[var(--flame)]/80" />
                <div className="h-10 w-72 max-w-full animate-pulse rounded-lg bg-[var(--surface)]/10" />
              </div>
            </div>
            <div className="rounded-lg border border-[var(--surface)] bg-[var(--surface)] p-4">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {["approved", "intros", "trust"].map((item) => (
                  <div
                    className="rounded-lg border border-[var(--surface)] bg-[var(--surface)] p-4"
                    key={`org-loading-${item}`}
                  >
                    <div className="size-5 animate-pulse rounded bg-[var(--surface)]/30" />
                    <div className="mt-3 h-3 w-28 animate-pulse rounded bg-[var(--surface)]/15" />
                    <div className="mt-3 h-9 w-16 animate-pulse rounded bg-[var(--surface)]/20" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          {["first", "second", "third"].map((item) => (
            <div
              className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_18px_45px_rgba(1,2,10,0.06)]"
              key={`org-rule-loading-${item}`}
            >
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="mt-3 h-4 w-5/6" />
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[var(--line)] ${className}`}
    />
  );
}

function SidebarSkeleton() {
  return (
    <aside className="ws-night-panel border-b border-white/10 text-white lg:min-h-screen lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col gap-3 p-3 sm:p-4 lg:gap-6 lg:p-5">
        <div className="rounded-lg border border-white/[0.12] bg-white/[0.06] p-3 lg:p-4">
          <div className="flex items-start gap-3">
            <div className="size-10 shrink-0 animate-pulse rounded-lg bg-white/20" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-28 animate-pulse rounded bg-white/25" />
              <div className="h-3 w-full animate-pulse rounded bg-white/15" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-white/15" />
            </div>
          </div>
          <div className="mt-3 h-6 w-32 animate-pulse rounded-md bg-white/15 lg:mt-4" />
        </div>

        <nav
          aria-hidden
          className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1"
        >
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              className="flex min-h-10 items-center gap-3 rounded-lg px-3 py-2"
              key={`member-nav-skeleton-${index}`}
            >
              <div className="size-4 shrink-0 animate-pulse rounded bg-white/20" />
              <div className="h-3 w-20 animate-pulse rounded bg-white/15" />
            </div>
          ))}
        </nav>

        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-2 h-3 w-24 animate-pulse rounded bg-white/15" />
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                className="h-9 rounded-lg bg-white/[0.06]"
                key={`admin-nav-skeleton-${index}`}
              />
            ))}
          </div>
        </div>

        <div className="mt-auto flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3">
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-white/20" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-28 animate-pulse rounded bg-white/20" />
            <div className="h-3 w-16 animate-pulse rounded bg-white/10" />
          </div>
        </div>
      </div>
    </aside>
  );
}

function ContentSkeleton() {
  return (
    <main className="min-w-0 flex-1">
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="space-y-8" role="status" aria-label="Loading page">
          <div className="space-y-3">
            <SkeletonBlock className="h-3 w-24 bg-[var(--accent-soft)]" />
            <SkeletonBlock className="h-8 w-full max-w-xl" />
            <SkeletonBlock className="h-4 w-full max-w-2xl" />
            <SkeletonBlock className="h-4 w-3/4 max-w-xl" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  className="ws-card-glow rounded-lg border border-[var(--line)] bg-white/[0.88] p-5"
                  key={`primary-card-skeleton-${index}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="w-full space-y-3">
                      <SkeletonBlock className="h-4 w-28" />
                      <SkeletonBlock className="h-6 w-3/4" />
                      <SkeletonBlock className="h-4 w-full" />
                      <SkeletonBlock className="h-4 w-5/6" />
                    </div>
                    <SkeletonBlock className="h-8 w-20 shrink-0" />
                  </div>
                  <div className="mt-5 flex gap-2">
                    <SkeletonBlock className="h-7 w-16" />
                    <SkeletonBlock className="h-7 w-20" />
                    <SkeletonBlock className="h-7 w-14" />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-6">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  className="ws-card-glow rounded-lg border border-[var(--line)] bg-white/[0.88] p-5"
                  key={`secondary-card-skeleton-${index}`}
                >
                  <div className="space-y-3">
                    <SkeletonBlock className="h-4 w-24" />
                    <SkeletonBlock className="h-6 w-2/3" />
                    <SkeletonBlock className="h-4 w-full" />
                    <SkeletonBlock className="h-10 w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export function AppShellLoading() {
  return (
    <div className="ws-page-shell text-[var(--ink)]">
      <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-[280px_1fr]">
        <SidebarSkeleton />
        <ContentSkeleton />
      </div>
    </div>
  );
}

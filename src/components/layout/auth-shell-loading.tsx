import { Card } from "@/components/ui/card";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-[var(--line)] ${className}`} />;
}

export function AuthShellLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <div
        aria-label="Loading account"
        className="grid w-full gap-8 lg:grid-cols-[0.9fr_1.1fr]"
        role="status"
      >
        <Card className="border-0 bg-[var(--night)] text-white">
          <div className="space-y-5">
            <div className="h-3 w-20 animate-pulse rounded bg-white/30" />
            <div className="space-y-3">
              <div className="h-9 w-full max-w-sm animate-pulse rounded bg-white/20" />
              <div className="h-9 w-4/5 max-w-xs animate-pulse rounded bg-white/20" />
            </div>
            <div className="space-y-2 pt-2">
              <div className="h-4 w-full animate-pulse rounded bg-white/15" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-white/15" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/15" />
            </div>
          </div>
        </Card>

        <Card className="space-y-5">
          <div className="space-y-3">
            <SkeletonBlock className="h-3 w-24 bg-[var(--accent-soft)]" />
            <SkeletonBlock className="h-7 w-48" />
          </div>
          <div className="mx-auto w-full max-w-md space-y-4 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full bg-[var(--flame-soft)]" />
          </div>
        </Card>
      </div>
    </main>
  );
}

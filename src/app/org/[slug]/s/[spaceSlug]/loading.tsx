function Skeleton({ className }: { className: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-[var(--line)] ${className}`} />;
}

export default function SpaceLoading() {
  return (
    <div aria-label="Loading" className="space-y-8" role="status">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-full max-w-lg" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5"
            key={`space-loading-${index}`}
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-6 w-3/4" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-5/6" />
          </div>
        ))}
      </div>
    </div>
  );
}

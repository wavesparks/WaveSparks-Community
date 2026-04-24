import { Card } from "@/components/ui/card";

export function AnalyticsBars({
  points,
}: {
  points: Array<{ date: string; value: number }>;
}) {
  const maxValue = Math.max(...points.map((point) => point.value), 1);

  return (
    <Card className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
          30 day activity
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-950">
          Community heartbeat
        </h3>
      </div>
      <div className="flex h-48 items-end gap-2">
        {points.map((point) => (
          <div className="flex flex-1 flex-col items-center gap-2" key={point.date}>
            <div
              className="w-full rounded-t-2xl bg-[var(--accent)]/80"
              style={{
                height: `${Math.max(8, (point.value / maxValue) * 100)}%`,
              }}
            />
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
              {point.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

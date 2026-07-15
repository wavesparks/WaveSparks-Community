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
        <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">
          30 day activity
        </p>
        <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">
          Community heartbeat
        </h3>
      </div>
      <div className="flex h-52 items-end gap-2">
        {points.map((point) => (
          <div className="flex h-full flex-1 flex-col items-center gap-2" key={point.date}>
            <div className="flex min-h-0 w-full flex-1 items-end">
              <div
                className="w-full rounded-t bg-[linear-gradient(180deg,var(--cyan),var(--accent))]"
                style={{
                  height: `${Math.max(8, (point.value / maxValue) * 100)}%`,
                }}
              />
            </div>
            <span className="text-[10px] font-medium text-[var(--ink-soft)]">
              {point.date.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

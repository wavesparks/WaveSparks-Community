import { Card } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
        {label}
      </p>
      <p className="text-3xl font-semibold leading-none text-[var(--ink)]">{value}</p>
      {hint ? <p className="text-sm leading-5 text-[var(--ink-soft)]">{hint}</p> : null}
    </Card>
  );
}

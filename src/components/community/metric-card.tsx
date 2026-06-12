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
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="text-3xl font-semibold leading-none text-slate-950">{value}</p>
      {hint ? <p className="text-sm leading-5 text-slate-600">{hint}</p> : null}
    </Card>
  );
}

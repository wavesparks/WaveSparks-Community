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
    <Card className="space-y-3">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
      <p className="text-3xl font-semibold text-slate-950">{value}</p>
      {hint ? <p className="text-sm text-slate-600">{hint}</p> : null}
    </Card>
  );
}

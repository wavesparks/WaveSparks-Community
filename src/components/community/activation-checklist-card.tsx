import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MemberActivationState } from "@/lib/domain";
import { cn } from "@/lib/utils";

export function ActivationChecklistCard({
  activation,
  compact = false,
}: {
  activation: MemberActivationState;
  compact?: boolean;
}) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Activation
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">
            {activation.isComplete ? "You’re fully activated" : "Make your first loop count"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {activation.completedCount} of {activation.totalCount} core steps complete.
          </p>
        </div>
        <Badge variant={activation.isComplete ? "accent" : "default"}>
          {Math.round((activation.completedCount / activation.totalCount) * 100)}%
        </Badge>
      </div>

      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "lg:grid-cols-2")}>
        {activation.items.map((item) => {
          const Icon = item.complete ? CheckCircle2 : Circle;

          return (
            <div
              className={cn(
                "rounded-lg border p-4",
                item.complete
                  ? "border-[var(--accent)]/20 bg-[var(--accent-soft)]"
                  : "border-slate-200 bg-slate-50",
              )}
              key={item.id}
            >
              <div className="flex gap-3">
                <Icon
                  className={cn(
                    "mt-0.5 size-5 shrink-0",
                    item.complete ? "text-[var(--accent)]" : "text-slate-400",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {item.description}
                  </p>
                  <Button
                    asChild
                    className="mt-3"
                    size="sm"
                    variant={item.complete ? "secondary" : "primary"}
                  >
                    <Link href={item.href}>
                      {item.cta}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

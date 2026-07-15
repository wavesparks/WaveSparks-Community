import { ArrowRight, CheckCircle2, Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import type { MemberActivationState } from "@/lib/domain";
import { cn } from "@/lib/utils";

const checklistCopy = {
  profile: {
    label: "Complete your profile",
    complete: "Your profile is ready for matches and introductions.",
    incomplete:
      "Add a few details so members can understand what you’re building and looking for.",
  },
  post: {
    label: "Share your first post",
    complete: "You’ve shared a post people can respond to.",
    incomplete: "Post a question, update, or resource to start a conversation.",
  },
  matches: {
    label: "Explore your matches",
    complete: "You’ve found or followed someone you may want to meet.",
    incomplete: "Review suggestions and follow people you’d like to keep up with.",
  },
  intro: {
    label: "Ask for an introduction",
    complete: "You’ve requested an introduction.",
    incomplete:
      "Ask to meet someone from a profile, match, or post. Contact details stay private until they accept.",
  },
} as const;

export function ActivationChecklistCard({
  activation,
  compact = false,
}: {
  activation: MemberActivationState;
  compact?: boolean;
}) {
  return (
    <Card className="space-y-4 overflow-hidden border-[var(--accent)]/25 bg-[var(--surface)] before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-[linear-gradient(90deg,var(--cyan),var(--accent),var(--gold))]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--accent)]">
            Getting started
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--ink)]">
            {activation.isComplete ? "You’re all set" : "Your next steps"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
            {activation.completedCount} of {activation.totalCount} steps complete.
          </p>
        </div>
        <Badge variant={activation.isComplete ? "accent" : "default"}>
          {Math.round((activation.completedCount / activation.totalCount) * 100)}%
        </Badge>
      </div>

      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "lg:grid-cols-2")}>
        {activation.items.map((item) => {
          const Icon = item.complete ? CheckCircle2 : Circle;
          const copy = checklistCopy[item.id];

          return (
            <div
              className={cn(
                "rounded-lg border p-4",
                item.complete
                  ? "border-[var(--accent)]/20 bg-[var(--accent-soft)]"
                  : "border-[var(--line)] bg-[var(--surface-muted)]",
              )}
              key={item.id}
            >
              <div className="flex gap-3">
                <Icon
                  className={cn(
                    "mt-0.5 size-5 shrink-0",
                    item.complete ? "text-[var(--accent)]" : "text-[var(--ink-soft)]",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--ink)]">{copy.label}</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                    {item.complete ? copy.complete : copy.incomplete}
                  </p>
                  <LinkButton
                    className="mt-3"
                    href={item.href}
                    size="sm"
                    variant={item.complete ? "secondary" : "primary"}
                  >
                    {item.cta}
                    <ArrowRight className="size-4" />
                  </LinkButton>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

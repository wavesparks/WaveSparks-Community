import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MatchCardView } from "@/lib/domain";

export function MatchCard({
  match,
  children,
}: {
  match: MatchCardView;
  children?: React.ReactNode;
}) {
  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar
            className="size-12"
            name={match.target.displayName}
            src={match.target.photo}
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-[var(--accent)]">
              {match.matchTypeLabel}
            </p>
            <h3 className="mt-1 text-lg font-semibold leading-tight text-[var(--ink)]">
              {match.target.displayName}
            </h3>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--ink-soft)]">
              {match.target.headline}
            </p>
          </div>
        </div>
        <div className="w-full border-t border-[var(--line)] pt-3 sm:w-auto sm:min-w-28 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 sm:text-right">
          <p className="text-xs font-semibold uppercase text-[var(--accent)]">
            Fit score
          </p>
          <p className="text-2xl font-semibold text-[var(--ink)]">{match.score}</p>
          <p className="text-sm text-[var(--ink-soft)]">
            {match.scoreBand} · {match.confidence} confidence
          </p>
        </div>
      </div>
      <div className="border-t border-[var(--line)] pt-4">
        <p className="text-xs font-semibold uppercase text-[var(--accent)]">Why this surfaced</p>
        <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">{match.explanationText}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {match.overlapTags.map((tag, index) => (
          <Badge key={`overlap-${tag}-${index}`} variant="muted">
            {tag}
          </Badge>
        ))}
      </div>
      <div className="border-t border-[var(--line)] pt-4 text-sm leading-6 text-[var(--ink-soft)]">
        <p className="font-semibold text-[var(--ink)]">What they’re building / offering</p>
        <p className="mt-2">{match.target.whatTheyAreBuilding}</p>
      </div>
      {children ?? <Button className="w-full">Request intro</Button>}
    </Card>
  );
}

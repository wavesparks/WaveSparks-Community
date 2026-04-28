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
    <Card className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar
            className="size-14"
            name={match.target.displayName}
            src={match.target.photo}
          />
          <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            {match.matchType.replaceAll("_", " ")}
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-950">
            {match.target.displayName}
          </h3>
          <p className="mt-1 text-sm text-slate-600">{match.target.headline}</p>
          </div>
        </div>
        <div className="rounded-[24px] bg-[var(--accent-soft)] px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Score</p>
          <p className="text-2xl font-semibold text-[var(--ink)]">{match.score}</p>
          <p className="text-sm text-slate-600">{match.scoreBand}</p>
        </div>
      </div>
      <p className="text-sm text-slate-700">{match.explanationText}</p>
      <div className="flex flex-wrap gap-2">
        {match.overlapTags.map((tag, index) => (
          <Badge key={`overlap-${tag}-${index}`} variant="muted">
            {tag}
          </Badge>
        ))}
      </div>
      <div className="rounded-[24px] bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">What they’re building / offering</p>
        <p className="mt-2">{match.target.whatTheyAreBuilding}</p>
      </div>
      {children ?? <Button className="w-full">Request intro</Button>}
    </Card>
  );
}

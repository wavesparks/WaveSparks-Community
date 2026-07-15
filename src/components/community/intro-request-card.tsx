import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { IntroRequestView } from "@/lib/domain";
import { formatDate } from "@/lib/utils";

const introSourceLabels = {
  admin_manual: "Introduced by the Wavesparks team",
  match: "From your matches",
  post: "Started from a post",
  profile: "Started from a profile",
} as const;

const introStatusLabels = {
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  pending: "Pending",
} as const;

export function IntroRequestCard({
  request,
  actions,
  sourceName,
}: {
  request: IntroRequestView;
  actions?: React.ReactNode;
  sourceName?: string;
}) {
  const displaySourceName = sourceName ?? request.spaceName;

  return (
    <Card className="space-y-5" data-testid="intro-request-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase text-[var(--accent)]">
              {request.isIncoming ? "Received" : "Sent"} ·{" "}
              {introSourceLabels[request.sourceType]}
            </p>
            {displaySourceName ? <Badge variant="muted">{displaySourceName}</Badge> : null}
          </div>
          <h3 className="mt-1 text-xl font-semibold leading-tight text-[var(--ink)]">
            {request.otherParty.displayName}
          </h3>
        </div>
        <Badge variant={request.status === "accepted" ? "accent" : "default"}>
          {introStatusLabels[request.status]}
        </Badge>
      </div>
      <div className="space-y-2 text-sm text-[var(--ink-soft)]">
        <p className="font-semibold text-[var(--ink)]">{request.introPurpose}</p>
        <p className="leading-6">{request.note}</p>
        <p className="text-[var(--ink-soft)]">
          {request.isIncoming ? "Received" : "Sent"} {formatDate(request.createdAt)}
        </p>
      </div>
      {request.contactDetails ? (
        <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-soft)] p-4 text-sm text-[var(--ink)]">
          <p className="font-semibold">Contact details</p>
          <p className="mt-2">{request.contactDetails.email}</p>
          <p>{request.contactDetails.whatsapp}</p>
        </div>
      ) : null}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--ink-soft)]">
        <p className="font-semibold text-[var(--ink)]">Opening message</p>
        <p className="mt-2">{request.suggestedFirstMessage}</p>
      </div>
      {actions}
    </Card>
  );
}

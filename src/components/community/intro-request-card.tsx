import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { IntroRequestView } from "@/lib/domain";
import { formatDate } from "@/lib/utils";

export function IntroRequestCard({
  request,
  actions,
}: {
  request: IntroRequestView;
  actions?: React.ReactNode;
}) {
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {request.isIncoming ? "Incoming" : "Outgoing"} · {request.sourceType.replaceAll("_", " ")}
          </p>
          <h3 className="mt-1 text-xl font-semibold leading-tight text-slate-950">
            {request.otherParty.displayName}
          </h3>
        </div>
        <Badge variant={request.status === "accepted" ? "accent" : "default"}>
          {request.status}
        </Badge>
      </div>
      <div className="space-y-2 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">{request.introPurpose}</p>
        <p className="leading-6">{request.note}</p>
        <p className="text-slate-500">Requested {formatDate(request.createdAt)}</p>
      </div>
      {request.contactDetails ? (
        <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-soft)] p-4 text-sm text-slate-800">
          <p className="font-semibold">Contact unlocked</p>
          <p className="mt-2">{request.contactDetails.email}</p>
          <p>{request.contactDetails.whatsapp}</p>
        </div>
      ) : null}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
        <p className="font-semibold text-slate-900">Suggested first message</p>
        <p className="mt-2">{request.suggestedFirstMessage}</p>
      </div>
      {actions}
    </Card>
  );
}

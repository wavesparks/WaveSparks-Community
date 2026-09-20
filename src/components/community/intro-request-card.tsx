import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
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
  const contact = request.status === "accepted" ? request.contactDetails : undefined;
  const whatsapp = contact?.whatsapp?.replace(/[^\d]/g, "");

  return (
    <Card className="space-y-5" data-testid="intro-request-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase text-[var(--accent)]">
              {request.isIncoming ? "Received" : "Sent"} ·{" "}
              {introSourceLabels[request.sourceType]}
            </p>
            {request.kind === "mentoring" ? (
              <Badge variant="accent">Mentoring</Badge>
            ) : null}
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
      {contact ? (
        <div className="rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-soft)] p-4 text-sm text-[var(--ink)]">
          <p className="font-semibold">Contact details</p>
          <p className="mt-2">{contact.email}</p>
          {contact.whatsapp ? (
            <p>{contact.whatsapp}</p>
          ) : null}
          <p className="mt-2">Your introduction is accepted. Continue the conversation by email or WhatsApp.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {contact.email ? (
              <LinkButton href={`mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(`Re: ${request.introPurpose}`)}&body=${encodeURIComponent(`Hi ${request.otherParty.displayName},\n\nThanks for connecting on Wavesparks!\n\n\n--- Opening message ---\n${request.suggestedFirstMessage}`)}`} size="sm" variant="secondary">
                Reply by email
              </LinkButton>
            ) : null}
            {whatsapp && whatsapp.length >= 7 && whatsapp.length <= 15 ? (
              <LinkButton href={`https://wa.me/${whatsapp}`} rel="noopener noreferrer" size="sm" target="_blank" variant="secondary">
                Reply on WhatsApp
              </LinkButton>
            ) : null}
          </div>
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

import { createManualIntroAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import type { IntroSourceType, IntroStatus } from "@/lib/domain";
import { getAdminIntroRequestDashboard } from "@/server/view-models";

const introRequestQueues = [
  { label: "All", status: undefined, sourceType: undefined },
  { label: "Pending", status: "pending", sourceType: undefined },
  { label: "Accepted", status: "accepted", sourceType: undefined },
  { label: "Manual", status: undefined, sourceType: "admin_manual" },
  { label: "From matches", status: undefined, sourceType: "match" },
  { label: "From profiles", status: undefined, sourceType: "profile" },
] satisfies Array<{
  label: string;
  status?: IntroStatus;
  sourceType?: IntroSourceType;
}>;

function introStatusFromQuery(value?: string) {
  return value === "pending" ||
    value === "accepted" ||
    value === "declined" ||
    value === "expired"
    ? value
    : undefined;
}

function introSourceTypeFromQuery(value?: string) {
  return value === "match" || value === "post" || value === "profile" || value === "admin_manual"
    ? value
    : undefined;
}

function introQueueHref(slug: string, queue: (typeof introRequestQueues)[number]) {
  const params = new URLSearchParams();
  if (queue.status) {
    params.set("request_status", queue.status);
  }
  if (queue.sourceType) {
    params.set("source_type", queue.sourceType);
  }

  const query = params.toString();
  return `/org/${slug}/admin/requests${query ? `?${query}` : ""}`;
}

export default async function AdminRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const selectedRequestStatus = introStatusFromQuery(singleQueryValue(query.request_status));
  const selectedSourceType = introSourceTypeFromQuery(singleQueryValue(query.source_type));
  const { manualIntroCandidates, requests } = await getAdminIntroRequestDashboard(
    viewer.org.id,
    {
      requestStatus: selectedRequestStatus,
      sourceType: selectedSourceType,
    },
  );

  return (
    <AppShell currentPath={`/org/${slug}/admin/requests`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin - Requests"
          level={1}
          title="Watch intro flow and create manual intros"
          description="Manual intros let admins catalyze obvious fits without opening the member graph to everyone."
        />
        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="space-y-4">
            <SectionHeading title="Create manual intro" />
            <form
              action={createManualIntroAction.bind(null, slug)}
              className="space-y-4"
            >
              <select className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]" name="requester_membership_id" required>
                <option value="">Choose the member requesting the intro</option>
                {manualIntroCandidates.map((candidate) => {
                  return (
                    <option key={candidate.membershipId} value={candidate.membershipId}>
                      {candidate.name}
                    </option>
                  );
                })}
              </select>
              <select className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]" name="receiver_membership_id" required>
                <option value="">Choose the receiving member</option>
                {manualIntroCandidates.map((candidate) => {
                  return (
                    <option key={candidate.membershipId} value={candidate.membershipId}>
                      {candidate.name}
                    </option>
                  );
                })}
              </select>
              <Input name="intro_purpose" placeholder="general connection / mentor guidance" />
              <Textarea
                name="note"
                placeholder="Why are you making this intro?"
                defaultValue="Admin-curated intro based on a strong fit and helpful overlap."
              />
              <SubmitButton className="w-full" pendingLabel="Sending intro">
                Send manual intro
              </SubmitButton>
            </form>
          </Card>

          <div className="space-y-4">
            <SectionHeading eyebrow="Latest" title="Intro requests" />
            <div className="flex flex-wrap gap-2">
              {introRequestQueues.map((queue) => {
                const active =
                  queue.status === selectedRequestStatus &&
                  queue.sourceType === selectedSourceType;

                return (
                  <LinkButton
                    href={introQueueHref(slug, queue)}
                    key={queue.label}
                    size="sm"
                    variant={active ? "primary" : "secondary"}
                  >
                    {queue.label}
                  </LinkButton>
                );
              })}
            </div>
            {requests.map((request) => {
              return (
                <Card className="space-y-3" key={request.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-[var(--ink)]">{request.introPurpose}</p>
                    <Badge variant={request.status === "accepted" ? "accent" : "default"}>
                      {request.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-[var(--ink-soft)]">
                    {request.requesterName} to {request.receiverName}
                  </p>
                  <p className="text-sm text-[var(--ink-soft)]">{request.note}</p>
                </Card>
              );
            })}
            {!requests.length ? (
              <Card>
                <p className="text-sm font-semibold text-[var(--ink)]">No requests in this queue</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Try another request status or source type.
                </p>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

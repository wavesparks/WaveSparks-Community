import { createManualIntroAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  listSpacesForOrg,
  listVisibleSpacesForMembership,
} from "@/server/store";
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

function introQueueHref(
  slug: string,
  queue: (typeof introRequestQueues)[number],
  spaceId?: string,
) {
  const params = new URLSearchParams();
  if (spaceId) {
    params.set("space_id", spaceId);
  }
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
    requireConnected: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const selectedRequestStatus = introStatusFromQuery(singleQueryValue(query.request_status));
  const selectedSourceType = introSourceTypeFromQuery(singleQueryValue(query.source_type));
  const requestedSpaceId = singleQueryValue(query.space_id);
  const [allSpaces, adminSpaceRecords] = await Promise.all([
    listSpacesForOrg(viewer.org.id),
    listVisibleSpacesForMembership(viewer.membership.id),
  ]);
  const adminSpaces = adminSpaceRecords.map(({ space }) => space);
  const selectedSpace = adminSpaces.find((space) => space.id === requestedSpaceId);
  const { manualIntroCandidates, requests } = await getAdminIntroRequestDashboard(viewer.org.id, {
    requestStatus: selectedRequestStatus,
    sourceType: selectedSourceType,
    spaceId: selectedSpace?.id,
  });
  const spaceById = new Map(allSpaces.map((space) => [space.id, space]));

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
            <SectionHeading
              description="A manual intro belongs to exactly one Space. You must explicitly join that Space before acting in its social graph."
              title="Create manual intro"
            />
            <form action={`/org/${slug}/admin/requests`} className="space-y-2" method="get">
              <label className="text-sm font-semibold text-[var(--ink)]" htmlFor="manual-intro-space">
                Space
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                  defaultValue={selectedSpace?.id ?? ""}
                  id="manual-intro-space"
                  name="space_id"
                  required
                >
                  <option value="">Choose a Space</option>
                  {adminSpaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name} · {space.kind === "main" ? "Main Community" : "Event"}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="secondary">
                  Load roster
                </Button>
              </div>
            </form>

            {selectedSpace ? (
              <form
                action={createManualIntroAction.bind(null, slug)}
                className="space-y-4 border-t border-[var(--line)] pt-4"
              >
                <input name="space_id" type="hidden" value={selectedSpace.id} />
                <p className="text-sm text-[var(--ink-soft)]">
                  Creating inside <strong className="text-[var(--ink)]">{selectedSpace.name}</strong>.
                  Only its active, connected, profile-ready participants are listed.
                </p>
                <label className="sr-only" htmlFor="manual-intro-requester">
                  Person requesting the intro
                </label>
                <select
                  className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                  id="manual-intro-requester"
                  name="requester_membership_id"
                  required
                >
                  <option value="">Choose the person requesting the intro</option>
                  {manualIntroCandidates.map((candidate) => (
                    <option key={candidate.membershipId} value={candidate.membershipId}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="manual-intro-receiver">
                  Person receiving the intro
                </label>
                <select
                  className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                  id="manual-intro-receiver"
                  name="receiver_membership_id"
                  required
                >
                  <option value="">Choose the person receiving the intro</option>
                  {manualIntroCandidates.map((candidate) => (
                    <option key={candidate.membershipId} value={candidate.membershipId}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
                <Input name="intro_purpose" placeholder="general connection / mentor guidance" />
                <Textarea
                  defaultValue="Admin-curated intro based on a strong fit and helpful overlap."
                  name="note"
                  placeholder="Why are you making this intro?"
                />
                <SubmitButton
                  className="w-full"
                  disabled={manualIntroCandidates.length < 2}
                  pendingLabel="Sending intro"
                >
                  Send manual intro in {selectedSpace.name}
                </SubmitButton>
                {manualIntroCandidates.length < 2 ? (
                  <p className="text-sm text-[var(--ink-soft)]">
                    At least two eligible participants are required in this Space.
                  </p>
                ) : null}
              </form>
            ) : (
              <div className="border-t border-[var(--line)] pt-4 text-sm leading-6 text-[var(--ink-soft)]">
                {adminSpaces.length
                  ? "Choose a Space to load its eligible participant roster."
                  : "You are not an active participant in any Space. Add your own account to a Space before creating social interactions there."}
              </div>
            )}
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
                    href={introQueueHref(slug, queue, selectedSpace?.id)}
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
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="muted">
                        {request.spaceId
                          ? spaceById.get(request.spaceId)?.name ?? "Unknown Space"
                          : "Legacy unscoped"}
                      </Badge>
                      <Badge variant={request.status === "accepted" ? "accent" : "default"}>
                        {request.status}
                      </Badge>
                    </div>
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

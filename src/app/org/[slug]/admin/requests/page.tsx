import { createManualIntroAction } from "@/actions/admin";
import {
  adminSpaceName,
  adminSpaceOptionLabel,
} from "@/components/admin/admin-community-copy";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  { label: "Awaiting response", status: "pending", sourceType: undefined },
  { label: "Accepted", status: "accepted", sourceType: undefined },
  { label: "Created by admin", status: undefined, sourceType: "admin_manual" },
  { label: "From a match", status: undefined, sourceType: "match" },
  { label: "From a profile", status: undefined, sourceType: "profile" },
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

function introductionStatusLabel(status: IntroStatus) {
  if (status === "pending") return "Awaiting response";
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
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
  const spaceNameById = new Map(
    allSpaces.map((space) => [space.id, adminSpaceName(space)]),
  );
  const selectedPeopleLabel = selectedSpace?.kind === "main" ? "members" : "participants";
  const selectedPersonLabel = selectedSpace?.kind === "main" ? "member" : "participant";

  return (
    <AppShell currentPath={`/org/${slug}/admin/requests`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin · Introductions"
          level={1}
          title="Introduction requests"
          description="Help people meet the right contacts and see which introductions are awaiting a response."
        />
        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="space-y-4">
            <SectionHeading
              description="Choose where the introduction belongs. You must have access there before connecting people."
              title="Create an introduction"
            />
            <form action={`/org/${slug}/admin/requests`} className="space-y-2" method="get">
              <label className="text-sm font-semibold text-[var(--ink)]" htmlFor="manual-intro-space">
                Community or Event
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                  defaultValue={selectedSpace?.id ?? ""}
                  id="manual-intro-space"
                  name="space_id"
                  required
                >
                  <option value="">Choose Wavesparks Community or an Event</option>
                  {adminSpaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {adminSpaceOptionLabel(space)}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="secondary">
                  Show people
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
                  This introduction will appear in <strong className="text-[var(--ink)]">{adminSpaceName(selectedSpace)}</strong>.
                  Only current {selectedPeopleLabel} who have finished setting up their profile are shown.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="manual-intro-requester">Who is asking?</Label>
                  <select
                    className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                    id="manual-intro-requester"
                    name="requester_membership_id"
                    required
                  >
                    <option value="">Choose a {selectedPersonLabel}</option>
                    {manualIntroCandidates.map((candidate) => (
                      <option key={candidate.membershipId} value={candidate.membershipId}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-intro-receiver">Who should they meet?</Label>
                  <select
                    className="h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
                    id="manual-intro-receiver"
                    name="receiver_membership_id"
                    required
                  >
                    <option value="">Choose a {selectedPersonLabel}</option>
                    {manualIntroCandidates.map((candidate) => (
                      <option key={candidate.membershipId} value={candidate.membershipId}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-intro-purpose">What is the introduction for?</Label>
                  <Input
                    id="manual-intro-purpose"
                    name="intro_purpose"
                    placeholder="Mentorship, collaboration, or a shared interest"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-intro-note">Why should they meet?</Label>
                  <Textarea
                    id="manual-intro-note"
                    name="note"
                    placeholder="Share the reason for bringing these two people together."
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-intro-first-message">Suggested first message</Label>
                  <Textarea
                    id="manual-intro-first-message"
                    name="suggested_first_message"
                    placeholder="Write a short message they can respond to."
                    required
                  />
                </div>
                <SubmitButton
                  className="w-full"
                  disabled={manualIntroCandidates.length < 2}
                  pendingLabel="Sending"
                >
                  Send introduction in {adminSpaceName(selectedSpace)}
                </SubmitButton>
                {manualIntroCandidates.length < 2 ? (
                  <p className="text-sm text-[var(--ink-soft)]">
                    Add at least two available {selectedPeopleLabel} here before creating an introduction.
                  </p>
                ) : null}
              </form>
            ) : (
              <div className="border-t border-[var(--line)] pt-4 text-sm leading-6 text-[var(--ink-soft)]">
                {adminSpaces.length
                  ? "Choose Wavesparks Community or an Event to see who can be introduced."
                  : "Your account does not currently have access to Wavesparks Community or an Event. Add access before creating introductions."}
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <SectionHeading eyebrow="Recent activity" title="Introductions" />
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
                          ? spaceNameById.get(request.spaceId) ?? "Unknown community or event"
                          : "Wavesparks Community"}
                      </Badge>
                      <Badge variant={request.status === "accepted" ? "accent" : "default"}>
                        {introductionStatusLabel(request.status)}
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
                <p className="text-sm font-semibold text-[var(--ink)]">No introductions found</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Try a different filter or choose another community or Event.
                </p>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

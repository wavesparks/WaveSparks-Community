import { redirect } from "next/navigation";
import { CalendarClock, GraduationCap, UsersRound } from "lucide-react";

import { IntroRequestCard } from "@/components/community/intro-request-card";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getViewerContext } from "@/lib/auth";
import type { IntroStatus } from "@/lib/domain";
import { singleQueryValue } from "@/lib/feed-filters";
import { listVisibleSpacesForMembership } from "@/server/store";
import { getAccountIntroHistoryViews } from "@/server/view-models";

const mentoringQueues = [
  { label: "All", status: undefined },
  { label: "Needs response", status: "pending" },
  { label: "Accepted", status: "accepted" },
  { label: "Declined", status: "declined" },
  { label: "Expired", status: "expired" },
] satisfies Array<{ label: string; status?: IntroStatus }>;

function mentoringStatusFromQuery(value?: string) {
  return value === "pending" ||
    value === "accepted" ||
    value === "declined" ||
    value === "expired"
    ? value
    : undefined;
}

function mentoringQueueHref(slug: string, status?: IntroStatus) {
  return `/org/${slug}/mentoring${status ? `?request_status=${status}` : ""}`;
}

function mentorAvailabilityLabel(value: string) {
  if (!value) return "Not added yet";
  return value.replaceAll("_", " ");
}

export default async function MentoringPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireConnected: true,
    requireCompleteProfile: true,
  });
  if (!viewer) return null;
  if (!viewer.canMentor) redirect(`/org/${slug}`);

  const selectedStatus = mentoringStatusFromQuery(
    singleQueryValue(query.request_status),
  );
  const accessRecords = await listVisibleSpacesForMembership(viewer.membership.id);
  const accessibleSpaces = accessRecords.map(({ space }) => space);
  const accessibleSpaceIdSet = new Set(accessibleSpaces.map((space) => space.id));
  const requests = await getAccountIntroHistoryViews(
    viewer.membership.id,
    viewer.org.id,
    accessibleSpaces,
    {
      direction: "incoming",
      kind: "mentoring",
      limit: 40,
      status: selectedStatus,
    },
  );
  const profile = viewer.profile;
  const acceptingMentoringRequests = Boolean(
    profile?.introOptIn && profile.offeringMatchTypes.includes("mentor_match"),
  );
  const requestAvailabilityCopy = !profile?.introOptIn
    ? "All new introduction requests are paused in your profile. Existing requests and history remain available here."
    : acceptingMentoringRequests
      ? "You are accepting direct mentoring requests and can appear in new mentor matches."
      : "Direct mentoring requests and new mentor matches are paused. General introduction requests remain available.";
  const requestAvailabilityHref = profile?.introOptIn
    ? `/org/${slug}/onboarding?step=2&return_to=${encodeURIComponent(`/org/${slug}/mentoring#mentor-profile`)}#matching_intent_group`
    : `/org/${slug}/onboarding?step=3&return_to=${encodeURIComponent(`/org/${slug}/mentoring#mentor-profile`)}#intro_opt_in`;

  return (
    <AppShell currentPath={`/org/${slug}/mentoring`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            description="Review your mentoring requests across the communities and events you can access."
            eyebrow="Approved mentor"
            level={1}
            title="Mentoring"
          />
          <LinkButton href={`/org/${slug}/profile`} size="sm" variant="secondary">
            View my profile
          </LinkButton>
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div
              className="flex flex-wrap gap-2"
              aria-label="Mentoring request filters"
              role="group"
            >
              {mentoringQueues.map((queue) => (
                <LinkButton
                  aria-current={queue.status === selectedStatus ? "page" : undefined}
                  href={mentoringQueueHref(slug, queue.status)}
                  key={queue.label}
                  size="sm"
                  variant={queue.status === selectedStatus ? "primary" : "secondary"}
                >
                  {queue.label}
                </LinkButton>
              ))}
            </div>

            {requests.map((request) => {
              const canOpenSource = Boolean(
                request.spaceId &&
                  request.spaceSlug &&
                  accessibleSpaceIdSet.has(request.spaceId),
              );
              const sourceRequestsPath = canOpenSource
                ? `/org/${slug}/s/${request.spaceSlug}/requests`
                : undefined;

              return (
                <IntroRequestCard
                  actions={
                    sourceRequestsPath ? (
                      <LinkButton href={sourceRequestsPath} size="sm" variant="secondary">
                        {request.status === "pending"
                          ? `Respond in ${request.spaceName ?? "this community"}`
                          : `Open ${request.spaceName ?? "this community"}`}
                      </LinkButton>
                    ) : null
                  }
                  key={request.id}
                  request={request}
                />
              );
            })}

            {!requests.length ? (
              <Card>
                <p className="font-semibold text-[var(--ink)]">
                  No mentoring requests in this view
                </p>
                <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                  {acceptingMentoringRequests
                    ? "Requests sent specifically for mentoring will appear here. General introductions remain in your Introductions inbox."
                    : requestAvailabilityCopy}
                </p>
              </Card>
            ) : null}
          </div>

          <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
            <Card className="scroll-mt-24 space-y-4" id="mentor-profile">
              <div className="flex flex-wrap items-center gap-2">
                <GraduationCap className="size-5 text-[var(--accent)]" aria-hidden />
                <h2 className="text-xl font-semibold text-[var(--ink)]">Mentor profile</h2>
                <Badge variant="accent">Approved mentor</Badge>
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    Mentoring requests
                  </p>
                  <Badge variant={acceptingMentoringRequests ? "accent" : "muted"}>
                    {acceptingMentoringRequests ? "Accepting" : "Paused"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                  {requestAvailabilityCopy}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                    <CalendarClock className="size-4 text-[var(--accent)]" aria-hidden />
                    Availability
                  </p>
                  <p className="mt-1 text-sm capitalize text-[var(--ink-soft)]">
                    {mentorAvailabilityLabel(profile?.mentorAvailability ?? "")}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                    <UsersRound className="size-4 text-[var(--accent)]" aria-hidden />
                    Preferred capacity
                  </p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    {profile?.maxMentees === null || profile?.maxMentees === undefined
                      ? "Not added yet"
                      : `${profile.maxMentees} mentee${profile.maxMentees === 1 ? "" : "s"}`}
                  </p>
                </div>
              </div>
              {profile?.mentorshipPreferences ? (
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">Preferences</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                    {profile.mentorshipPreferences}
                  </p>
                </div>
              ) : null}
              <p className="text-sm leading-6 text-[var(--ink-soft)]">
                Availability and capacity are guidance only. Turn off Mentor in matching
                offers to pause new matches and direct mentoring requests.
              </p>
              <LinkButton
                className="w-full"
                href={requestAvailabilityHref}
                variant="secondary"
              >
                Manage request availability
              </LinkButton>
              <LinkButton
                className="w-full"
                href={`/org/${slug}/onboarding?step=3&return_to=${encodeURIComponent(`/org/${slug}/mentoring#mentor-profile`)}#mentoring_details`}
                variant="secondary"
              >
                Edit mentor details
              </LinkButton>
            </Card>

            <Card className="space-y-3">
              <h2 className="text-xl font-semibold text-[var(--ink)]">Contact privacy</h2>
              <p className="text-sm leading-6 text-[var(--ink-soft)]">
                Email and WhatsApp stay private until you accept a mentoring request.
                This workspace never shows another mentor’s queue.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

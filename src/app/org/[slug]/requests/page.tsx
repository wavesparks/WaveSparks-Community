import Link from "next/link";

import { markAccountNotificationsReadAction } from "@/actions/member";
import { IntroRequestCard } from "@/components/community/intro-request-card";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewerContext } from "@/lib/auth";
import type { IntroStatus } from "@/lib/domain";
import { singleQueryValue } from "@/lib/feed-filters";
import { safeNotificationHref } from "@/lib/notification-links";
import {
  hasUnreadNotificationsForMembershipWithSpaceAccess,
  listVisibleSpacesForMembership,
} from "@/server/store";
import {
  getAccountInboxNotificationViews,
  getAccountIntroHistoryViews,
} from "@/server/view-models";

type RequestDirection = "incoming" | "outgoing";

const requestQueues = [
  { label: "All", direction: undefined, status: undefined },
  { label: "Needs response", direction: "incoming", status: "pending" },
  { label: "Incoming", direction: "incoming", status: undefined },
  { label: "Sent", direction: "outgoing", status: undefined },
  { label: "Accepted", direction: undefined, status: "accepted" },
] satisfies Array<{
  label: string;
  direction?: RequestDirection;
  status?: IntroStatus;
}>;

function requestDirectionFromQuery(value?: string) {
  return value === "incoming" || value === "outgoing" ? value : undefined;
}

function requestStatusFromQuery(value?: string) {
  return value === "pending" ||
    value === "accepted" ||
    value === "declined" ||
    value === "expired"
    ? value
    : undefined;
}

function requestQueueHref(slug: string, queue: (typeof requestQueues)[number]) {
  const params = new URLSearchParams();
  if (queue.direction) params.set("request_direction", queue.direction);
  if (queue.status) params.set("request_status", queue.status);
  const query = params.toString();
  return `/org/${slug}/requests${query ? `?${query}` : ""}`;
}

export default async function AccountInboxPage({
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
  });
  if (!viewer) return null;

  const selectedRequestDirection = requestDirectionFromQuery(
    singleQueryValue(query.request_direction),
  );
  const selectedRequestStatus = requestStatusFromQuery(
    singleQueryValue(query.request_status),
  );
  const accessRecords = await listVisibleSpacesForMembership(viewer.membership.id);
  const accessibleSpaces = accessRecords.map(({ space }) => space);
  const accessibleSpaceIds = accessibleSpaces.map((space) => space.id);
  const accessibleSpaceIdSet = new Set(accessibleSpaceIds);
  const [requests, notifications, hasUnreadNotifications] = await Promise.all([
    getAccountIntroHistoryViews(viewer.membership.id, viewer.org.id, accessibleSpaces, {
      direction: selectedRequestDirection,
      limit: 24,
      status: selectedRequestStatus,
    }),
    getAccountInboxNotificationViews(viewer.membership.id, accessibleSpaces, {
      limit: 12,
    }),
    hasUnreadNotificationsForMembershipWithSpaceAccess(
      viewer.membership.id,
      accessibleSpaceIds,
    ),
  ]);
  const profileReady = Boolean(viewer.profile?.onboardingComplete);

  return (
    <AppShell currentPath={`/org/${slug}/requests`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          description="See your introduction history and recent notifications in one place."
          eyebrow="Inbox"
          level={1}
          title="Introductions and notifications"
        />
        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              {requestQueues.map((queue) => {
                const active =
                  queue.direction === selectedRequestDirection &&
                  queue.status === selectedRequestStatus;
                return (
                  <LinkButton
                    href={requestQueueHref(slug, queue)}
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
              const canOpenSource = Boolean(
                request.spaceId &&
                  request.spaceSlug &&
                  accessibleSpaceIdSet.has(request.spaceId),
              );
              const sourceRequestsPath = canOpenSource
                ? `/org/${slug}/s/${request.spaceSlug}/requests`
                : undefined;
              const needsProfile =
                request.isIncoming && request.status === "pending" && !profileReady;
              const actionHref = needsProfile && request.spaceSlug
                ? `/org/${slug}/onboarding?space=${encodeURIComponent(request.spaceSlug)}`
                : sourceRequestsPath;

              return (
                <IntroRequestCard
                  actions={
                    actionHref ? (
                      <LinkButton href={actionHref} size="sm" variant="secondary">
                        {needsProfile
                          ? "Complete profile to respond"
                          : request.isIncoming && request.status === "pending"
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
                <p className="font-semibold text-[var(--ink)]">No introduction requests yet</p>
                <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                  Introduction requests will appear here. Accepted introductions remain private
                  to your account.
                </p>
              </Card>
            ) : null}
          </div>

          <Card className="h-fit space-y-4 xl:sticky xl:top-24">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeading eyebrow="Inbox" title="Latest notifications" />
              {hasUnreadNotifications ? (
                <form
                  action={markAccountNotificationsReadAction.bind(
                    null,
                    slug,
                    viewer.membership.id,
                  )}
                >
                  <SubmitButton pendingLabel="Marking as read" size="sm" variant="secondary">
                    Mark all as read
                  </SubmitButton>
                </form>
              ) : null}
            </div>

            <div className="space-y-3">
              {notifications.map((notification) => {
                const href = safeNotificationHref(slug, notification.link);
                const content = (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="muted">
                        {notification.spaceName ?? "Account"}
                      </Badge>
                      {!notification.readAt ? <Badge variant="accent">new</Badge> : null}
                    </div>
                    <p className="mt-3 font-semibold text-[var(--ink)]">
                      {notification.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                      {notification.body}
                    </p>
                  </>
                );

                return href ? (
                  <Link
                    className="block rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 transition hover:border-[var(--accent)]/40"
                    href={href}
                    key={notification.id}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4"
                    key={notification.id}
                  >
                    {content}
                  </div>
                );
              })}

              {!notifications.length ? (
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
                  <p className="text-sm text-[var(--ink-soft)]">No notifications yet.</p>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

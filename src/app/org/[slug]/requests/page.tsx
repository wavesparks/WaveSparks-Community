import { markNotificationsReadAction, respondIntroAction } from "@/actions/member";
import { IntroRequestCard } from "@/components/community/intro-request-card";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import type { IntroStatus } from "@/lib/domain";
import { hasUnreadNotificationsForMembership } from "@/server/store";
import { getIntroRequestViews, getNotificationViews } from "@/server/view-models";
import Link from "next/link";

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
  if (queue.direction) {
    params.set("request_direction", queue.direction);
  }
  if (queue.status) {
    params.set("request_status", queue.status);
  }

  const query = params.toString();
  return `/org/${slug}/requests${query ? `?${query}` : ""}`;
}

export default async function RequestsPage({
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
    requireCompleteProfile: true,
  });

  if (!viewer) {
    return null;
  }

  const selectedRequestDirection = requestDirectionFromQuery(
    singleQueryValue(query.request_direction),
  );
  const selectedRequestStatus = requestStatusFromQuery(
    singleQueryValue(query.request_status),
  );
  const [requests, notifications, hasUnreadNotifications] = await Promise.all([
    getIntroRequestViews(viewer.membership.id, viewer.org.id, {
      direction: selectedRequestDirection,
      limit: 24,
      status: selectedRequestStatus,
    }),
    getNotificationViews(viewer.membership.id, { limit: 8 }),
    hasUnreadNotificationsForMembership(viewer.membership.id),
  ]);

  return (
    <AppShell currentPath={`/org/${slug}/requests`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Requests"
          level={1}
          title="Manage introductions and notifications"
          description="Accepted intros reveal contact details. Declines stay polite. Pending requests keep context visible without exposing private contact fields."
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
                  <Button
                    asChild
                    key={queue.label}
                    size="sm"
                    variant={active ? "primary" : "secondary"}
                  >
                    <Link href={requestQueueHref(slug, queue)}>{queue.label}</Link>
                  </Button>
                );
              })}
            </div>
            {requests.map((request) => (
              <IntroRequestCard
                actions={
                  request.isIncoming && request.status === "pending" ? (
                    <div className="flex gap-3">
                      <form
                        action={respondIntroAction.bind(
                          null,
                          slug,
                          request.id,
                          viewer.membership.id,
                          "accepted",
                        )}
                      >
                        <SubmitButton pendingLabel="Accepting">Accept</SubmitButton>
                      </form>
                      <form
                        action={respondIntroAction.bind(
                          null,
                          slug,
                          request.id,
                          viewer.membership.id,
                          "declined",
                        )}
                      >
                        <SubmitButton pendingLabel="Declining" variant="secondary">
                          Decline
                        </SubmitButton>
                      </form>
                    </div>
                  ) : null
                }
                key={request.id}
                request={request}
              />
            ))}
            {!requests.length ? (
              <Card>
                <p className="text-sm font-semibold text-slate-950">No intro requests yet</p>
                <p className="mt-1 text-sm text-slate-600">
                  Requests from matches and posts will appear here with their context.
                </p>
              </Card>
            ) : null}
          </div>

          <div className="space-y-6">
            <Card className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionHeading eyebrow="Inbox" title="Latest notifications" />
                {hasUnreadNotifications ? (
                  <form
                    action={markNotificationsReadAction.bind(
                      null,
                      slug,
                      viewer.membership.id,
                    )}
                  >
                    <SubmitButton pendingLabel="Marking read" size="sm" variant="secondary">
                      Mark all read
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                    key={notification.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{notification.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{notification.body}</p>
                      </div>
                      {!notification.readAt ? <Badge variant="accent">new</Badge> : null}
                    </div>
                  </div>
                ))}
                {!notifications.length ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600">No notifications yet.</p>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

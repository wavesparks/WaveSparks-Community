import Link from "next/link";

import {
  markNotificationsReadInSpaceAction,
  respondIntroInSpaceAction,
} from "@/actions/member";
import { IntroRequestCard } from "@/components/community/intro-request-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCommunityDisplayName } from "@/lib/community-copy";
import type { IntroStatus } from "@/lib/domain";
import { singleQueryValue } from "@/lib/feed-filters";
import { safeNotificationHref } from "@/lib/notification-links";
import { getSpaceViewerContext } from "@/lib/space-auth";
import {
  getIntroRequestViewsForSpace,
  getNotificationViewsForSpace,
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

function requestQueueHref(
  basePath: string,
  queue: (typeof requestQueues)[number],
) {
  const params = new URLSearchParams();
  if (queue.direction) params.set("request_direction", queue.direction);
  if (queue.status) params.set("request_status", queue.status);
  const query = params.toString();
  return `${basePath}${query ? `?${query}` : ""}`;
}

export default async function SpaceRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; spaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug, spaceSlug }, query] = await Promise.all([params, searchParams]);
  const context = await getSpaceViewerContext(slug, spaceSlug, {
    requireAccess: true,
    requireAuth: true,
  });
  const { space, viewer } = context;
  const communityName = getCommunityDisplayName(space);
  const selectedRequestDirection = requestDirectionFromQuery(
    singleQueryValue(query.request_direction),
  );
  const selectedRequestStatus = requestStatusFromQuery(
    singleQueryValue(query.request_status),
  );
  const [requests, notifications] = await Promise.all([
    getIntroRequestViewsForSpace(space.id, viewer.membership.id, viewer.org.id, {
      direction: selectedRequestDirection,
      limit: 24,
      status: selectedRequestStatus,
    }),
    getNotificationViewsForSpace(space.id, viewer.membership.id, { limit: 8 }),
  ]);
  const hasUnreadNotifications = notifications.some((notification) => !notification.readAt);
  const basePath = `/org/${slug}/s/${space.slug}/requests`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeading
          description={`Your introductions and recent activity in ${communityName}.`}
          eyebrow="Introductions"
          level={1}
          title={`Introductions in ${communityName}`}
        />
        <LinkButton href={`/org/${slug}/requests`} size="sm" variant="secondary">
          All introductions
        </LinkButton>
      </div>
      <StatusBanner spaceName={communityName} status={singleQueryValue(query.status)} />

      {!context.canInteract ? (
        <Card className="border-amber-500/25 bg-amber-50">
          <p className="font-semibold text-[var(--ink)]">
            Complete your profile to respond
          </p>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
            You can review existing introductions now. Complete your profile to respond
            or request a new one.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {requestQueues.map((queue) => {
              const active =
                queue.direction === selectedRequestDirection &&
                queue.status === selectedRequestStatus;
              return (
                <LinkButton
                  href={requestQueueHref(basePath, queue)}
                  key={queue.label}
                  size="sm"
                  variant={active ? "primary" : "secondary"}
                >
                  {queue.label}
                </LinkButton>
              );
            })}
          </div>

          {requests.map((request) => (
            <IntroRequestCard
              actions={
                context.canInteract &&
                request.isIncoming &&
                request.status === "pending" ? (
                  <div className="flex flex-wrap gap-3">
                    <form
                      action={respondIntroInSpaceAction.bind(
                        null,
                        slug,
                        space.id,
                        request.id,
                        viewer.membership.id,
                        "accepted",
                      )}
                    >
                      <SubmitButton pendingLabel="Accepting">Accept</SubmitButton>
                    </form>
                    <form
                      action={respondIntroInSpaceAction.bind(
                        null,
                        slug,
                        space.id,
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
              sourceName={communityName}
            />
          ))}

          {!requests.length ? (
            <Card>
              <p className="font-semibold text-[var(--ink)]">
                No introductions in this view
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                Try another tab, or meet someone through People and Matches.
              </p>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit space-y-4 xl:sticky xl:top-64">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading eyebrow={communityName} title="Latest notifications" />
            {context.canInteract && hasUnreadNotifications ? (
              <form
                action={markNotificationsReadInSpaceAction.bind(
                  null,
                  slug,
                  space.id,
                  viewer.membership.id,
                )}
              >
                <SubmitButton pendingLabel="Marking read" size="sm" variant="secondary">
                  Mark read
                </SubmitButton>
              </form>
            ) : null}
          </div>
          <div className="space-y-3">
            {notifications.map((notification) => {
              const href = safeNotificationHref(slug, notification.link, space.slug);
              const content = (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--ink)]">{notification.title}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                      {notification.body}
                    </p>
                  </div>
                  {!notification.readAt ? <Badge variant="accent">new</Badge> : null}
                </div>
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
                <p className="text-sm text-[var(--ink-soft)]">
                  No notifications yet.
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

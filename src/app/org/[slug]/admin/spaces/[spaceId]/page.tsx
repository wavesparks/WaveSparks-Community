import {
  CalendarDays,
  CheckCircle2,
  CircleOff,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { notFound } from "next/navigation";

import { AddToMainCommunityPanel } from "@/components/admin/add-to-main-community-panel";
import {
  adminSpaceName,
  WAVESPARKS_COMMUNITY_NAME,
} from "@/components/admin/admin-community-copy";
import { EventSpaceEditorDialog } from "@/components/admin/event-space-editor-dialog";
import { EventSpaceLifecycleActions } from "@/components/admin/event-space-lifecycle-actions";
import { InvitePeopleDialog } from "@/components/admin/invite-people-dialog";
import { MemberManagementNav } from "@/components/admin/member-management-nav";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getViewerContext } from "@/lib/auth";
import type { Space } from "@/lib/domain";
import { isE2ELocalAuthEnabled } from "@/lib/e2e-local-auth";
import { isClerkConfigured } from "@/lib/env";
import { singleQueryValue } from "@/lib/feed-filters";
import { postTypeLabel } from "@/lib/post-copy";
import {
  getSpaceAuditMetrics,
  getSpaceById,
  listActiveSpaceMemberRecords,
  listIntroRequestsForSpace,
  listMatchProfileRecordsForSpace,
  listMatchRunsForSpace,
  listPostsForSpace,
  listVisibleCommentCountsForSpace,
} from "@/server/store";

function formatDate(value?: string) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function lifecycleLabel(space: Space) {
  if (space.kind === "main") return "Invitation only";
  if (space.lifecycle === "ended") return "Past Event";
  return `${space.lifecycle[0].toUpperCase()}${space.lifecycle.slice(1)} Event`;
}

function lifecycleExplanation(space: Space) {
  if (space.kind === "main") {
    return "Wavesparks Community is invitation-only and always available to people who have access.";
  }
  if (space.lifecycle === "draft") {
    return "This Event is visible to administrators only. Participants cannot enter it yet.";
  }
  if (space.lifecycle === "upcoming") {
    return "Participants can enter this Event before its start date.";
  }
  if (space.lifecycle === "active") {
    return "Participants can read, post, connect, and receive matches here.";
  }
  if (space.lifecycle === "ended") {
    return "This is a Past Event. Participants can still take part and receive matches.";
  }
  return "This Event is hidden from participants. Access and matching are paused, but its history is still available to administrators.";
}

function participantName(record: Awaited<ReturnType<typeof listActiveSpaceMemberRecords>>[number]) {
  return record.profile?.preferredName || record.user?.name || "Unnamed person";
}

function introductionStatusLabel(status: string) {
  if (status === "pending") return "Awaiting response";
  return `${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

function scoreBandLabel(scoreBand: "high" | "good" | "emerging") {
  if (scoreBand === "high") return "Strong match";
  if (scoreBand === "good") return "Good match";
  return "Worth exploring";
}

function matchRunStatusLabel(status: "running" | "completed" | "failed") {
  if (status === "running") return "Updating";
  if (status === "completed") return "Updated";
  return "Needs attention";
}

const sectionLinks = [
  ["overview", "Overview"],
  ["participants", "Participants"],
  ["content", "Content"],
  ["matching", "Matching"],
  ["settings", "Settings"],
] as const;

export default async function AdminSpaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; spaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, spaceId } = await params;
  const query = await searchParams;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireConnected: true,
    requireAdmin: true,
  });

  if (!viewer) return null;

  const space = await getSpaceById(spaceId);
  if (!space || space.orgId !== viewer.org.id) notFound();

  const [
    unsortedParticipantRecords,
    auditMetrics,
    recentPosts,
    recentIntroRequests,
    recentMatchRecords,
    recentMatchRuns,
  ] = await Promise.all([
    listActiveSpaceMemberRecords(space.id),
    getSpaceAuditMetrics(space.id),
    listPostsForSpace(space.id, { limit: 3 }),
    listIntroRequestsForSpace(space.id, { limit: 3 }),
    listMatchProfileRecordsForSpace(space.id, { limit: 3 }),
    listMatchRunsForSpace(space.id, 1),
  ]);
  if (!auditMetrics) notFound();
  const visibleCommentCounts = await listVisibleCommentCountsForSpace(space.id, {
    postIds: recentPosts.map((post) => post.id),
  });

  const participantRecords = unsortedParticipantRecords.sort((left, right) =>
    participantName(left).localeCompare(participantName(right)),
  );
  const participantNameByMembershipId = new Map(
    participantRecords.map((record) => [record.membership.id, participantName(record)]),
  );
  const latestMatchRun = recentMatchRuns[0];
  const profileReadyCount = participantRecords.filter(
    ({ profile }) => profile?.onboardingComplete,
  ).length;
  const intentReadyCount = participantRecords.filter(
    ({ intent }) => intent?.intentComplete,
  ).length;
  const matchingEligibleCount = participantRecords.filter(
    ({ intent, profile }) =>
      space.matchingEnabled &&
      space.lifecycle !== "archived" &&
      profile?.onboardingComplete &&
      intent?.intentComplete &&
      intent.matchingOptIn,
  ).length;
  const displayName = adminSpaceName(space);
  const kindLabel = space.kind === "main" ? WAVESPARKS_COMMUNITY_NAME : "Event";
  const participantNoun = space.kind === "main" ? "members" : "participants";
  const Icon = space.kind === "main" ? LockKeyhole : CalendarDays;
  const overviewMetrics = [
    {
      icon: UsersRound,
      label: space.kind === "main" ? "Active members" : "Active participants",
      value: participantRecords.length,
    },
    { icon: UserRoundCheck, label: "Profiles completed", value: profileReadyCount },
    { icon: CheckCircle2, label: "Preferences completed", value: intentReadyCount },
    { icon: Sparkles, label: "Ready for matching", value: matchingEligibleCount },
  ];
  const invitationsEnabled = isClerkConfigured() || isE2ELocalAuthEnabled();

  return (
    <AppShell currentPath={`/org/${slug}/admin/spaces/${space.id}`} viewer={viewer}>
      <div className="space-y-7">
        <MemberManagementNav active="spaces" slug={slug} />
        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={`/org/${slug}/admin/spaces`} size="sm" variant="ghost">
              Community &amp; Events
            </LinkButton>
            <Badge variant={space.lifecycle === "ended" || space.lifecycle === "archived" ? "muted" : "accent"}>
              {lifecycleLabel(space)}
            </Badge>
            {space.kind === "event" && space.eventLabel ? (
              <Badge variant="default">{space.eventLabel}</Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-[var(--night)] text-[var(--surface)] shadow-sm">
                <Icon aria-hidden className="size-5" />
              </div>
              <SectionHeading
                description={space.description || lifecycleExplanation(space)}
                eyebrow={`Admin · ${kindLabel}`}
                level={1}
                title={displayName}
              />
            </div>
            {space.kind === "event" && space.lifecycle !== "archived" ? (
              <EventSpaceEditorDialog slug={slug} space={space} />
            ) : null}
          </div>
        </div>

        <nav
          aria-label="Community and Event sections"
          className="overflow-x-auto border-b border-[var(--line)]"
        >
          <div className="flex min-w-max gap-5">
            {sectionLinks.map(([target, label]) => (
              <a
                className="min-h-11 border-b-2 border-transparent px-1 py-3 text-sm font-semibold text-[var(--ink-soft)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink)]"
                href={`#${target}`}
                key={target}
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        <section className="scroll-mt-6 space-y-4" id="overview">
          <SectionHeading
            description={`Review people and activity for ${displayName} only. Nothing from other Events is included.`}
            eyebrow={space.kind === "main" ? "Community overview" : "Event overview"}
            title="Overview"
          />

          <Card className={space.lifecycle === "archived" ? "border-slate-400/40 bg-slate-50" : "border-[var(--accent)]/25 bg-[var(--accent-soft)]/35"}>
            <div className="flex items-start gap-3">
              {space.lifecycle === "archived" ? (
                <CircleOff aria-hidden className="mt-0.5 size-5 shrink-0 text-slate-700" />
              ) : (
                <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
              )}
              <div>
                <p className="font-semibold text-[var(--ink)]">{lifecycleLabel(space)}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                  {lifecycleExplanation(space)}
                </p>
              </div>
            </div>
          </Card>

          <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {overviewMetrics.map(({ icon: MetricIcon, label, value }) => (
              <Card className="p-4" key={label}>
                <dt className="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--ink-soft)]">
                  <MetricIcon aria-hidden className="size-4" />
                  {label}
                </dt>
                <dd className="mt-2 text-3xl font-semibold text-[var(--ink)]">{value}</dd>
              </Card>
            ))}
          </dl>
        </section>

        <section className="scroll-mt-6 space-y-4" id="participants">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeading
              description={`Only people who can currently enter ${displayName} appear here.`}
              eyebrow={space.kind === "main" ? "Community members" : "Event participants"}
              title={`${space.kind === "main" ? "Members" : "Participants"} (${participantRecords.length})`}
            />
            <div className="flex flex-wrap gap-2">
              {space.lifecycle !== "archived" ? (
                <InvitePeopleDialog
                  defaultAccessStatus="active"
                  defaultDestinationSpaceId={space.id}
                  invitationsEnabled={invitationsEnabled}
                  slug={slug}
                  spaces={[{
                    id: space.id,
                    kind: space.kind,
                    lifecycle: space.lifecycle,
                    name: space.name,
                  }]}
                  triggerLabel={space.kind === "main" ? "Add people" : "Add participants"}
                />
              ) : null}
              <LinkButton href={`/org/${slug}/admin/members`} size="sm" variant="secondary">
                Manage accounts
              </LinkButton>
            </div>
          </div>

          <div className="space-y-3">
            {participantRecords.map(({ intent, membership, profile, spaceMembership, user }) => {
              const matchingReady = Boolean(
                space.matchingEnabled &&
                space.lifecycle !== "archived" &&
                profile?.onboardingComplete &&
                intent?.intentComplete &&
                intent.matchingOptIn,
              );

              return (
                <Card className="p-4" key={spaceMembership.id}>
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_0.8fr_0.8fr] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--ink)]">
                        {participantName({ intent, membership, profile, spaceMembership, user })}
                      </p>
                      <p className="mt-1 truncate text-sm text-[var(--ink-soft)]">
                        {user?.email || "Email unavailable"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Account</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="accent">Connected</Badge>
                        {membership.role === "org_admin" ? <Badge>Administrator</Badge> : null}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Matching</p>
                      <p className="mt-1 text-sm font-medium text-[var(--ink)]">
                        {matchingReady
                          ? "Ready to be matched here"
                          : intent?.matchingOptIn === false
                            ? "Opted out"
                            : "Profile or preferences incomplete"}
                      </p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {!participantRecords.length ? (
            <Card>
              <p className="font-semibold text-[var(--ink)]">No active {participantNoun}</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                People appear here after they have been added and connected their account.
              </p>
            </Card>
          ) : null}

          {space.kind === "event" && space.lifecycle !== "archived" ? (
            <AddToMainCommunityPanel
              participants={participantRecords.map(({ membership, profile, user }) => ({
                email: user?.email || "Email unavailable",
                membershipId: membership.id,
                name: profile?.preferredName || user?.name || "Unnamed member",
              }))}
              slug={slug}
              sourceSpaceId={space.id}
            />
          ) : null}
        </section>

        <section className="scroll-mt-6 space-y-4" id="content">
          <SectionHeading
            description={`All activity shown here belongs to ${displayName}.`}
            eyebrow="Activity"
            title="Content"
          />
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Posts", auditMetrics.posts],
              ["Comments", auditMetrics.visibleComments],
              ["People followed", auditMetrics.follows],
              ["Saved posts", auditMetrics.savedPosts],
              ["Notifications sent", auditMetrics.notifications],
              ["Introduction requests", auditMetrics.introRequests],
              ["Awaiting response", auditMetrics.pendingIntroRequests],
            ].map(([label, value]) => (
              <Card className="p-4" key={label}>
                <dt className="text-xs font-semibold uppercase text-[var(--ink-soft)]">
                  {label}
                </dt>
                <dd className="mt-2 text-3xl font-semibold text-[var(--ink)]">{value}</dd>
              </Card>
            ))}
          </dl>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--ink)]">Recent posts</p>
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">Recently shared in {displayName}.</p>
                </div>
              </div>
              <div className="space-y-3">
                {recentPosts.map((post) => {
                  const authorName =
                    participantNameByMembershipId.get(post.authorMembershipId) ??
                    "Not currently active here";
                  const commentCount = visibleCommentCounts.get(post.id) ?? 0;

                  return (
                    <div
                      className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4"
                      key={post.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--ink)]">{post.title}</p>
                          <p className="mt-1 text-sm text-[var(--ink-soft)]">
                            {authorName} · {formatDate(post.createdAt)}
                          </p>
                        </div>
                        <Badge>{postTypeLabel(post.type)}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--ink-soft)]">
                        <span>{commentCount} {commentCount === 1 ? "comment" : "comments"}</span>
                        {post.hidden ? <Badge variant="muted">Hidden</Badge> : null}
                        {post.commentsLocked ? <Badge variant="muted">Comments locked</Badge> : null}
                      </div>
                    </div>
                  );
                })}
                {!recentPosts.length ? (
                  <p className="rounded-lg border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-soft)]">
                    No posts have been shared here yet.
                  </p>
                ) : null}
              </div>
            </Card>

            <Card className="space-y-4">
              <div>
                <p className="font-semibold text-[var(--ink)]">Recent introductions</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Private introduction requests from {displayName}.
                </p>
              </div>
              <div className="space-y-3">
                {recentIntroRequests.map((request) => (
                  <div
                    className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4"
                    key={request.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--ink)]">{request.introPurpose}</p>
                        <p className="mt-1 text-sm text-[var(--ink-soft)]">
                          Created {formatDate(request.createdAt)}
                        </p>
                      </div>
                      <Badge variant={request.status === "accepted" ? "accent" : "default"}>
                        {introductionStatusLabel(request.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
                {!recentIntroRequests.length ? (
                  <p className="rounded-lg border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-soft)]">
                    No introduction requests have started here yet.
                  </p>
                ) : null}
              </div>
            </Card>
          </div>
        </section>

        <section className="scroll-mt-6 space-y-4" id="matching">
          <SectionHeading
            description={`Suggestions are based only on people, preferences, and recent activity in ${displayName}.`}
            eyebrow="Member matching"
            title="Matching"
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Matching status</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant={space.matchingEnabled ? "accent" : "muted"}>
                  {space.matchingEnabled ? "Matching enabled" : "Matching disabled"}
                </Badge>
                {space.lifecycle === "archived" ? <Badge variant="muted">Paused while archived</Badge> : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
                Past Events keep matching available. Archiving an Event pauses matching and hides suggestions from participants.
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">People ready to match</p>
              <p className="mt-2 text-3xl font-semibold text-[var(--ink)]">{matchingEligibleCount}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                People who completed their profile and preferences and chose to receive matches.
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Match suggestions</p>
              <p className="mt-2 text-3xl font-semibold text-[var(--ink)]">{auditMetrics.matches}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                {auditMetrics.visibleMatches} are currently visible to {participantNoun}.
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Last refreshed</p>
              <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                {latestMatchRun ? matchRunStatusLabel(latestMatchRun.status) : "Not refreshed yet"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                {latestMatchRun
                  ? `Last update started ${formatDate(latestMatchRun.startedAt)}.`
                  : "Match suggestions have not been refreshed yet."}
              </p>
            </Card>
          </div>

          <Card className="space-y-4">
            <div>
              <p className="font-semibold text-[var(--ink)]">Top match suggestions</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                The strongest current suggestions in {displayName}.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {recentMatchRecords.map(({ match, sourceProfile, targetProfile }) => (
                <div
                  className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4"
                  key={match.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--ink)]">
                        {sourceProfile?.preferredName || "Member unavailable"} and {targetProfile?.preferredName || "Member unavailable"}
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase text-[var(--ink-soft)]">
                        {match.matchType.replaceAll("_", " ")}
                      </p>
                    </div>
                    <Badge variant={match.scoreBand === "high" ? "accent" : "default"}>
                      {scoreBandLabel(match.scoreBand)}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {match.hiddenByAdmin ? <Badge variant="muted">Hidden</Badge> : null}
                    {match.dismissedBySource ? <Badge variant="muted">Dismissed</Badge> : null}
                  </div>
                </div>
              ))}
            </div>
            {!recentMatchRecords.length ? (
              <p className="rounded-lg border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-soft)]">
                No match suggestions are available here yet.
              </p>
            ) : null}
          </Card>
        </section>

        <section className="scroll-mt-6 space-y-4" id="settings">
          <SectionHeading
            description="Review this community or Event and manage when people can access it."
            eyebrow="Details"
            title="Settings"
          />
          <Card>
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ["Name", displayName],
                ["Type", kindLabel],
                ["Status", lifecycleLabel(space)],
                ["Start date", space.kind === "event" ? formatDate(space.startsAt) : "Not applicable"],
                ["End date", space.kind === "event" ? formatDate(space.endsAt) : "Not applicable"],
                ["Created", formatDate(space.createdAt)],
                ["Matching", space.matchingEnabled ? "Enabled" : "Disabled"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase text-[var(--ink-soft)]">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium text-[var(--ink)]">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="border-[var(--line)] bg-[var(--surface-muted)]">
            <p className="font-semibold text-[var(--ink)]">
              {space.kind === "main" ? WAVESPARKS_COMMUNITY_NAME : "Event availability"}
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
              {space.kind === "main"
                ? "Wavesparks Community stays open. Add or remove each member directly."
                : "Edit dates and availability above. Archiving hides the Event without deleting its content; restoring reopens the same Event and its history."}
            </p>
            {space.kind === "event" ? (
              <div className="mt-4 border-t border-[var(--line)] pt-4">
                <EventSpaceLifecycleActions
                  archived={space.lifecycle === "archived"}
                  slug={slug}
                  spaceId={space.id}
                />
              </div>
            ) : null}
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

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
  if (space.kind === "main") return "Main Community";
  if (space.lifecycle === "ended") return "Past Event";
  return `${space.lifecycle[0].toUpperCase()}${space.lifecycle.slice(1)} Event`;
}

function lifecycleExplanation(space: Space) {
  if (space.kind === "main") {
    return "Main is permanent and invitation-only. It cannot be ended or archived.";
  }
  if (space.lifecycle === "draft") {
    return "This Event is visible to administrators only. Members cannot enter it yet.";
  }
  if (space.lifecycle === "upcoming") {
    return "Participants with active access can enter this Event before its start date.";
  }
  if (space.lifecycle === "active") {
    return "Participants can read, post, interact, and match within this Event.";
  }
  if (space.lifecycle === "ended") {
    return "This is a Past Event. Participants retain full interaction and matching access.";
  }
  return "This Event is hidden from participants. Member access and matching are closed, while all data is retained for audit.";
}

function participantName(record: Awaited<ReturnType<typeof listActiveSpaceMemberRecords>>[number]) {
  return record.profile?.preferredName || record.user?.name || "Unnamed member";
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
  const kindLabel = space.kind === "main" ? "Main Community" : "Event";
  const participantNoun = space.kind === "main" ? "members" : "participants";
  const Icon = space.kind === "main" ? LockKeyhole : CalendarDays;
  const overviewMetrics = [
    { icon: UsersRound, label: "Active access", value: participantRecords.length },
    { icon: UserRoundCheck, label: "Core profile ready", value: profileReadyCount },
    { icon: CheckCircle2, label: "Space intent ready", value: intentReadyCount },
    { icon: Sparkles, label: "Matching eligible", value: matchingEligibleCount },
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
              All spaces
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
                title={space.name}
              />
            </div>
            {space.kind === "event" && space.lifecycle !== "archived" ? (
              <EventSpaceEditorDialog slug={slug} space={space} />
            ) : null}
          </div>
        </div>

        <nav
          aria-label="Space administration sections"
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
            description="A single audit view of this Space boundary. Counts below never include people from another Space."
            eyebrow="Space health"
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
              description={`Only connected accounts with active access to this Space appear here. Other Spaces do not contribute to this roster.`}
              eyebrow="Access roster"
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
                        {membership.role === "org_admin" ? <Badge>Global admin</Badge> : null}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Matching</p>
                      <p className="mt-1 text-sm font-medium text-[var(--ink)]">
                        {matchingReady
                          ? "Eligible in this Space"
                          : intent?.matchingOptIn === false
                            ? "Opted out"
                            : "Setup incomplete"}
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
                Account membership alone does not grant access. People appear here only after an active Space entitlement is assigned.
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
            description="Posts, comments, follows, saved posts, intros, and notifications created here remain inside this Space."
            eyebrow="Isolation boundary"
            title="Content"
          />
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Posts", auditMetrics.posts],
              ["Visible comments", auditMetrics.visibleComments],
              ["Follows", auditMetrics.follows],
              ["Saved posts", auditMetrics.savedPosts],
              ["Notifications", auditMetrics.notifications],
              ["Intro requests", auditMetrics.introRequests],
              ["Pending intros", auditMetrics.pendingIntroRequests],
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
                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                    Latest posts written specifically in this Space.
                  </p>
                </div>
                <Badge variant="muted">Read-only audit</Badge>
              </div>
              <div className="space-y-3">
                {recentPosts.map((post) => {
                  const authorName =
                    participantNameByMembershipId.get(post.authorMembershipId) ??
                    "Account not in active roster";
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
                        <Badge>{post.type.replaceAll("_", " ")}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--ink-soft)]">
                        <span>{commentCount} visible comments</span>
                        {post.hidden ? <Badge variant="muted">Hidden</Badge> : null}
                        {post.commentsLocked ? <Badge variant="muted">Comments locked</Badge> : null}
                      </div>
                    </div>
                  );
                })}
                {!recentPosts.length ? (
                  <p className="rounded-lg border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-soft)]">
                    No posts have been created in this Space yet.
                  </p>
                ) : null}
              </div>
            </Card>

            <Card className="space-y-4">
              <div>
                <p className="font-semibold text-[var(--ink)]">Recent intro requests</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Private connection requests retain this Space as their source.
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
                        {request.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                {!recentIntroRequests.length ? (
                  <p className="rounded-lg border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-soft)]">
                    No intro requests originated in this Space yet.
                  </p>
                ) : null}
              </div>
            </Card>
          </div>
        </section>

        <section className="scroll-mt-6 space-y-4" id="matching">
          <SectionHeading
            description="Candidates are selected only from this active roster and use this Space’s intent and recent content."
            eyebrow="AI matching"
            title="Matching"
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Space setting</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant={space.matchingEnabled ? "accent" : "muted"}>
                  {space.matchingEnabled ? "Matching enabled" : "Matching disabled"}
                </Badge>
                {space.lifecycle === "archived" ? <Badge variant="muted">Stopped by archive</Badge> : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
                Ended Events keep matching enabled. Archived Events stop matching and hide results from members.
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Current candidate pool</p>
              <p className="mt-2 text-3xl font-semibold text-[var(--ink)]">{matchingEligibleCount}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                Connected, active, core-profile-ready participants with a completed Space intent who have not opted out.
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Generated recommendations</p>
              <p className="mt-2 text-3xl font-semibold text-[var(--ink)]">{auditMetrics.matches}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                {auditMetrics.visibleMatches} are currently visible after member dismissal and admin moderation.
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Latest recompute</p>
              <p className="mt-2 text-lg font-semibold capitalize text-[var(--ink)]">
                {latestMatchRun?.status ?? "Never run"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                {latestMatchRun
                  ? `Started ${formatDate(latestMatchRun.startedAt)} for this Space only.`
                  : "No Space-scoped matching run has been recorded yet."}
              </p>
            </Card>
          </div>

          <Card className="space-y-4">
            <div>
              <p className="font-semibold text-[var(--ink)]">Highest-scoring recommendations</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                A read-only snapshot of recommendations generated within this Space.
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
                        {sourceProfile?.preferredName || "Source"} → {targetProfile?.preferredName || "Target"}
                      </p>
                      <p className="mt-1 text-xs font-semibold uppercase text-[var(--ink-soft)]">
                        {match.matchType.replaceAll("_", " ")}
                      </p>
                    </div>
                    <Badge variant={match.scoreBand === "high" ? "accent" : "default"}>
                      {match.score}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {match.hiddenByAdmin ? <Badge variant="muted">Hidden by admin</Badge> : null}
                    {match.dismissedBySource ? <Badge variant="muted">Dismissed</Badge> : null}
                  </div>
                </div>
              ))}
            </div>
            {!recentMatchRecords.length ? (
              <p className="rounded-lg border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-soft)]">
                No recommendations have been generated for this Space yet.
              </p>
            ) : null}
          </Card>
        </section>

        <section className="scroll-mt-6 space-y-4" id="settings">
          <SectionHeading
            description="Stable identity and lifecycle information for this Space."
            eyebrow="Configuration"
            title="Settings"
          />
          <Card>
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ["Name", space.name],
                ["Type", kindLabel],
                ["Lifecycle", lifecycleLabel(space)],
                ["Stable slug", space.slug],
                ["Start date", space.kind === "event" ? formatDate(space.startsAt) : "Not applicable"],
                ["End date", space.kind === "event" ? formatDate(space.endsAt) : "Not applicable"],
                ["Created", formatDate(space.createdAt)],
                ["Space ID", space.id],
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
              {space.kind === "main" ? "Permanent Main Community" : "Lifecycle controls"}
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
              {space.kind === "main"
                ? "Main cannot be ended or archived. Access must be granted or removed explicitly per member."
                : "Edit dates and lifecycle above. Archiving closes member access without deleting content; restoring preserves the Event’s original scope."}
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

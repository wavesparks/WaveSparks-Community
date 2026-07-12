import { notFound } from "next/navigation";

import {
  importCohortStudentsAction,
  promoteCohortMembersAction,
} from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { getViewerContext } from "@/lib/auth";
import { isE2ELocalAuthEnabled } from "@/lib/e2e-local-auth";
import { isClerkConfigured } from "@/lib/env";
import { singleQueryValue } from "@/lib/feed-filters";
import {
  getCohortRecordForOrg,
  listCohortMemberRecordsForCohort,
} from "@/server/store";

function formatDate(value?: string) {
  if (!value) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function AdminCohortDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; cohortId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, cohortId } = await params;
  const query = await searchParams;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireApproved: true,
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const [cohortRecord, members] = await Promise.all([
    getCohortRecordForOrg(viewer.org.id, cohortId),
    listCohortMemberRecordsForCohort(viewer.org.id, cohortId),
  ]);

  if (!cohortRecord) {
    notFound();
  }

  const { cohort, invitedMembers, promotedMembers, totalMembers } = cohortRecord;
  const clerkConfigured = isClerkConfigured();
  const invitationsEnabled = clerkConfigured || isE2ELocalAuthEnabled();

  return (
    <AppShell currentPath={`/org/${slug}/admin/cohorts`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            eyebrow="Admin · Cohort"
            level={1}
            title={cohort.name}
            description={cohort.description || "Review pool for this event cohort."}
          />
          <LinkButton href={`/org/${slug}/admin/cohorts`} variant="secondary">
            All cohorts
          </LinkButton>
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Students</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--ink)]">{totalMembers}</p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Waiting</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--ink)]">{invitedMembers}</p>
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Promoted</p>
            <p className="mt-2 text-3xl font-semibold text-[var(--ink)]">{promotedMembers}</p>
          </Card>
        </div>

        <Card className="space-y-5">
          <SectionHeading
            eyebrow="Invite"
            title="Import students"
            description={
              clerkConfigured
                ? "Paste one student per line. Use email or email,name."
                : invitationsEnabled
                  ? "Paste one student per line. Local E2E auth will simulate invitations."
                  : "Configure Clerk keys before sending cohort invitations."
            }
          />
          <form
            action={importCohortStudentsAction.bind(null, slug, cohort.id)}
            className="space-y-4"
          >
            <Textarea
              className="min-h-[180px] font-mono"
              disabled={!invitationsEnabled}
              name="students"
              placeholder={"email,name\nstudent@example.com,Student Name"}
              required
            />
            <SubmitButton disabled={!invitationsEnabled} pendingLabel="Importing students">
              Import and invite
            </SubmitButton>
          </form>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="space-y-4 border-b border-[var(--line)] px-4 py-4">
            <SectionHeading eyebrow={cohort.eventLabel || "Roster"} title="Cohort students" />
          </div>
          <form action={promoteCohortMembersAction.bind(null, slug, cohort.id)}>
            <div className="grid gap-3 bg-[var(--surface-muted)] px-4 py-3 text-xs font-semibold uppercase text-[var(--ink-soft)] lg:grid-cols-[44px_1.2fr_0.75fr_0.75fr_1fr_0.75fr]">
              <span />
              <span>Student</span>
              <span>Cohort</span>
              <span>Community</span>
              <span>Clerk</span>
              <span>Promoted</span>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {members.map(({ cohortMember, membership, user, profile }) => {
                const canPromote =
                  cohortMember.status !== "promoted" && membership.status !== "approved";

                return (
                  <div
                    className="grid gap-3 px-4 py-4 lg:grid-cols-[44px_1.2fr_0.75fr_0.75fr_1fr_0.75fr] lg:items-center"
                    key={cohortMember.id}
                  >
                    <input
                      className="size-4 rounded border-[var(--line)]"
                      disabled={!canPromote}
                      name="membership_id"
                      type="checkbox"
                      value={membership.id}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--ink)]">
                        {profile?.preferredName || user?.name || cohortMember.invitedName}
                      </p>
                      <p className="mt-1 truncate text-sm text-[var(--ink-soft)]">
                        {user?.email || cohortMember.invitedEmail}
                      </p>
                    </div>
                    <Badge variant={cohortMember.status === "promoted" ? "accent" : "default"}>
                      {cohortMember.status}
                    </Badge>
                    <Badge variant={membership.status === "approved" ? "accent" : "muted"}>
                      {membership.status}
                    </Badge>
                    <div className="min-w-0 text-sm text-[var(--ink-soft)]">
                      <p>
                        {membership.clerkMembershipId
                          ? "Connected"
                          : membership.clerkInvitationStatus
                            ? `Invite ${membership.clerkInvitationStatus}`
                            : "Not connected"}
                      </p>
                      {membership.clerkInvitationError ? (
                        <p className="mt-1 break-words text-xs text-red-700">
                          {membership.clerkInvitationError}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-sm text-[var(--ink-soft)]">
                      {formatDate(cohortMember.promotedAt)}
                    </p>
                  </div>
                );
              })}
              {!members.length ? (
                <div className="px-4 py-6">
                  <p className="text-sm text-[var(--ink-soft)]">No students imported yet.</p>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 border-t border-[var(--line)] bg-[var(--surface-muted)] px-4 py-4 md:flex-row md:items-end">
              <div className="min-w-0 flex-1">
                <Label htmlFor="approval_note">Approval note</Label>
                <Input
                  id="approval_note"
                  name="approval_note"
                  placeholder="Approved from cohort review."
                />
              </div>
              <SubmitButton pendingLabel="Promoting selected">Promote selected</SubmitButton>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}

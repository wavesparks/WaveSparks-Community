import { notFound } from "next/navigation";

import { CohortApprovalForm } from "@/components/admin/cohort-approval-form";
import {
  ArchiveCohortButton,
  CohortEditorDialog,
} from "@/components/admin/cohort-editor-dialog";
import { InvitePeopleDialog } from "@/components/admin/invite-people-dialog";
import { MemberManagementNav } from "@/components/admin/member-management-nav";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getViewerContext } from "@/lib/auth";
import { isE2ELocalAuthEnabled } from "@/lib/e2e-local-auth";
import { isClerkConfigured } from "@/lib/env";
import { singleQueryValue } from "@/lib/feed-filters";
import {
  getCohortRecordForOrg,
  listCohortMemberRecordsForCohort,
  listCohortRecordsForOrg,
} from "@/server/store";

function invitationLabel(membership: {
  clerkInvitationStatus?: string;
  clerkMembershipId?: string;
}) {
  if (membership.clerkMembershipId) return "Connected";
  if (!membership.clerkInvitationStatus) return "Not invited";
  return `Invitation ${membership.clerkInvitationStatus}`;
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

  if (!viewer) return null;

  const [cohortRecord, members, allCohorts] = await Promise.all([
    getCohortRecordForOrg(viewer.org.id, cohortId),
    listCohortMemberRecordsForCohort(viewer.org.id, cohortId),
    listCohortRecordsForOrg(viewer.org.id),
  ]);

  if (!cohortRecord) notFound();

  const {
    cohort,
    totalMembers,
    needsDecisionMembers,
    activeMembers,
    needsAttentionMembers,
  } = cohortRecord;
  const invitationsEnabled = isClerkConfigured() || isE2ELocalAuthEnabled();
  const isActive = cohort.status === "active";
  const activeCohorts = allCohorts
    .filter((record) => record.cohort.status === "active")
    .map(({ cohort: option }) => ({ id: option.id, name: option.name }));

  return (
    <AppShell currentPath={`/org/${slug}/admin/cohorts`} viewer={viewer}>
      <div className="space-y-7">
        <MemberManagementNav active="cohorts" slug={slug} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <LinkButton href={`/org/${slug}/admin/cohorts`} size="sm" variant="ghost">
                All cohorts
              </LinkButton>
              <Badge variant={isActive ? "accent" : "muted"}>
                {isActive ? "Active" : "Archived"}
              </Badge>
            </div>
            <SectionHeading
              description={cohort.description || "A focused group and community-access review queue."}
              eyebrow={cohort.eventLabel || "Cohort"}
              level={1}
              title={cohort.name}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isActive ? (
              <>
                <CohortEditorDialog
                  cohort={{
                    id: cohort.id,
                    name: cohort.name,
                    eventLabel: cohort.eventLabel,
                    description: cohort.description,
                  }}
                  slug={slug}
                />
                <InvitePeopleDialog
                  cohorts={activeCohorts}
                  defaultAccessStatus="waitlist"
                  defaultCohortId={cohort.id}
                  invitationsEnabled={invitationsEnabled}
                  slug={slug}
                  triggerLabel="Add people"
                />
              </>
            ) : null}
          </div>
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />

        {!isActive ? (
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--ink-soft)]">
            This cohort is archived. Its members remain in the community, but people cannot be added or approved from this view.
          </div>
        ) : !invitationsEnabled ? (
          <div className="rounded-lg border border-amber-600/30 bg-amber-50 p-4 text-sm text-amber-900">
            Configure Clerk before creating invitations. Existing cohort members can still be reviewed.
          </div>
        ) : null}

        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Total", totalMembers],
            ["Needs decision", needsDecisionMembers],
            ["Active", activeMembers],
            ["Needs attention", needsAttentionMembers],
          ].map(([label, value]) => (
            <Card className="p-4" key={label}>
              <dt className="text-xs font-semibold uppercase text-[var(--ink-soft)]">{label}</dt>
              <dd className="mt-2 text-3xl font-semibold text-[var(--ink)]">{value}</dd>
            </Card>
          ))}
        </dl>

        <Card className="space-y-5">
          <SectionHeading
            description="Filter the roster, select everyone who is ready, then approve their community access in one confirmed action."
            eyebrow="Community access"
            title="Review cohort members"
          />
          <CohortApprovalForm
            cohortId={cohort.id}
            disabled={!isActive}
            members={members.map(({ membership, profile, user }) => ({
              membershipId: membership.id,
              name: profile?.preferredName || user?.name || "Unnamed member",
              email: user?.email || "Email unavailable",
              status: membership.status,
              invitationLabel: invitationLabel(membership),
            }))}
            slug={slug}
          />
        </Card>

        {isActive ? (
          <Card className="flex flex-wrap items-center justify-between gap-4 border-amber-600/25 bg-amber-50/50">
            <div>
              <p className="font-semibold text-[var(--ink)]">Archive cohort</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Archiving closes this group workflow without removing anyone from the community.
              </p>
            </div>
            <ArchiveCohortButton cohortId={cohort.id} slug={slug} />
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

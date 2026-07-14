import { CohortEditorDialog } from "@/components/admin/cohort-editor-dialog";
import { MemberManagementNav } from "@/components/admin/member-management-nav";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import { listCohortRecordsForOrg, type CohortRecord } from "@/server/store";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function CohortCard({ record, slug }: { record: CohortRecord; slug: string }) {
  const { cohort, totalMembers, needsDecisionMembers, activeMembers, needsAttentionMembers } = record;
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-[var(--ink)]">{cohort.name}</h3>
            <Badge variant={cohort.status === "active" ? "accent" : "muted"}>
              {cohort.status === "active" ? "Active" : "Archived"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            {cohort.eventLabel || "No event label"} · Created {formatDate(cohort.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {cohort.status === "active" ? (
            <CohortEditorDialog
              cohort={{
                id: cohort.id,
                name: cohort.name,
                eventLabel: cohort.eventLabel,
                description: cohort.description,
              }}
              slug={slug}
            />
          ) : null}
          <LinkButton href={`/org/${slug}/admin/cohorts/${cohort.id}`} size="sm">
            Open cohort
          </LinkButton>
        </div>
      </div>
      {cohort.description ? (
        <p className="text-sm leading-6 text-[var(--ink-soft)]">{cohort.description}</p>
      ) : null}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Total", totalMembers],
          ["Needs decision", needsDecisionMembers],
          ["Active", activeMembers],
          ["Needs attention", needsAttentionMembers],
        ].map(([label, value]) => (
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3" key={label}>
            <dt className="text-xs font-semibold uppercase text-[var(--ink-soft)]">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold text-[var(--ink)]">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export default async function AdminCohortsPage({
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
    requireAdmin: true,
  });

  if (!viewer) return null;

  const cohorts = await listCohortRecordsForOrg(viewer.org.id);
  const activeCohorts = cohorts.filter(({ cohort }) => cohort.status === "active");
  const archivedCohorts = cohorts.filter(({ cohort }) => cohort.status === "archived");

  return (
    <AppShell currentPath={`/org/${slug}/admin/cohorts`} viewer={viewer}>
      <div className="space-y-7">
        <MemberManagementNav active="cohorts" slug={slug} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            description="Use cohorts as optional member groups and focused review queues—not as a separate member system."
            eyebrow="Admin · Member management"
            level={1}
            title="Cohorts"
          />
          <CohortEditorDialog slug={slug} />
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />

        <section aria-labelledby="active-cohorts" className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-[var(--ink)]" id="active-cohorts">Active cohorts</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Counts are derived from each person’s current community access and invitation state.
            </p>
          </div>
          {activeCohorts.map((record) => (
            <CohortCard key={record.cohort.id} record={record} slug={slug} />
          ))}
          {!activeCohorts.length ? (
            <Card>
              <p className="font-semibold text-[var(--ink)]">No active cohorts</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Create a cohort when you need a group-specific invitation or review workflow.
              </p>
            </Card>
          ) : null}
        </section>

        {archivedCohorts.length ? (
          <details className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
            <summary className="cursor-pointer font-semibold text-[var(--ink)]">
              Archived cohorts ({archivedCohorts.length})
            </summary>
            <div className="mt-4 space-y-4">
              {archivedCohorts.map((record) => (
                <CohortCard key={record.cohort.id} record={record} slug={slug} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </AppShell>
  );
}

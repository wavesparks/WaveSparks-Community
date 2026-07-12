import { createCohortAction } from "@/actions/admin";
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
import { singleQueryValue } from "@/lib/feed-filters";
import { listCohortRecordsForOrg } from "@/server/store";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
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

  if (!viewer) {
    return null;
  }

  const cohorts = await listCohortRecordsForOrg(viewer.org.id);

  return (
    <AppShell currentPath={`/org/${slug}/admin/cohorts`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin · Cohorts"
          level={1}
          title="Event cohort pools"
          description="Create event-specific pools, invite students into review, and promote selected members into the main community."
        />
        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <Card className="space-y-5">
            <SectionHeading eyebrow="New cohort" title="Create event pool" />
            <form
              action={createCohortAction.bind(null, slug)}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" placeholder="YFS Demo Day July" required />
              </div>
              <div>
                <Label htmlFor="event_label">Event label</Label>
                <Input id="event_label" name="event_label" placeholder="July 2026" />
              </div>
              <div>
                <Label htmlFor="description">Notes</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Source, event context, or selection notes"
                />
              </div>
              <SubmitButton pendingLabel="Creating cohort">Create cohort</SubmitButton>
            </form>
          </Card>

          <div className="space-y-4">
            <SectionHeading eyebrow="Latest" title="Cohorts" />
            {cohorts.map(({ cohort, invitedMembers, promotedMembers, totalMembers }) => (
              <Card className="space-y-4" key={cohort.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-semibold text-[var(--ink)]">{cohort.name}</h3>
                      <Badge variant={cohort.status === "active" ? "accent" : "muted"}>
                        {cohort.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
                      {cohort.eventLabel || "No event label"} · Created {formatDate(cohort.createdAt)}
                    </p>
                  </div>
                  <LinkButton href={`/org/${slug}/admin/cohorts/${cohort.id}`} size="sm">
                    Open
                  </LinkButton>
                </div>
                {cohort.description ? (
                  <p className="text-sm leading-6 text-[var(--ink-soft)]">{cohort.description}</p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                    <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Students</p>
                    <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{totalMembers}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                    <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Waiting</p>
                    <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{invitedMembers}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                    <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Promoted</p>
                    <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{promotedMembers}</p>
                  </div>
                </div>
              </Card>
            ))}
            {!cohorts.length ? (
              <Card>
                <p className="text-sm font-semibold text-[var(--ink)]">No cohorts yet</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Create the first event pool to start inviting students.
                </p>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

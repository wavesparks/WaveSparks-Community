import Link from "next/link";

import { InvitePeopleDialog } from "@/components/admin/invite-people-dialog";
import { MemberDetailPanel } from "@/components/admin/member-detail-panel";
import { MemberManagementNav } from "@/components/admin/member-management-nav";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { Select } from "@/components/ui/select";
import { StatusBanner } from "@/components/ui/status-banner";
import { getViewerContext } from "@/lib/auth";
import type { MembershipStatus } from "@/lib/domain";
import { isE2ELocalAuthEnabled } from "@/lib/e2e-local-auth";
import { isClerkConfigured } from "@/lib/env";
import { singleQueryValue } from "@/lib/feed-filters";
import { cn } from "@/lib/utils";
import {
  listCohortRecordsForOrg,
  listMemberWorkspaceForOrg,
  type MemberWorkspaceInvitationStatus,
} from "@/server/store";

const accessOptions = [
  ["", "All access states"],
  ["pending", "Pending review"],
  ["waitlist", "Waitlist"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["suspended", "Suspended"],
] as const;

const invitationOptions = [
  ["", "All invitation states"],
  ["connected", "Connected"],
  ["pending", "Invitation pending"],
  ["failed", "Invitation failed"],
  ["expired", "Invitation expired"],
  ["revoked", "Invitation revoked"],
  ["accepted", "Invitation accepted"],
  ["not_invited", "Not invited"],
] as const;

function optionValue<T extends string>(
  value: string | undefined,
  options: ReadonlyArray<readonly [string, string]>,
) {
  return options.some(([option]) => option === value) && value ? (value as T) : undefined;
}

function positivePage(value?: string) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function memberListHref(
  slug: string,
  values: {
    access?: string;
    cohort?: string;
    invitation?: string;
    page?: number;
    search?: string;
  },
) {
  const query = new URLSearchParams();
  if (values.search) query.set("search", values.search);
  if (values.access) query.set("access", values.access);
  if (values.invitation) query.set("invitation", values.invitation);
  if (values.cohort) query.set("cohort", values.cohort);
  if (values.page && values.page > 1) query.set("page", String(values.page));
  const suffix = query.toString();
  return `/org/${slug}/admin/members${suffix ? `?${suffix}` : ""}`;
}

function accessLabel(status: MembershipStatus) {
  return status === "pending" ? "Pending review" : status[0].toUpperCase() + status.slice(1);
}

function invitationLabel(membership: {
  clerkInvitationStatus?: string;
  clerkMembershipId?: string;
}) {
  if (membership.clerkMembershipId) return "Connected";
  if (!membership.clerkInvitationStatus) return "Not invited";
  return `Invitation ${membership.clerkInvitationStatus}`;
}

export default async function AdminMembersPage({
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

  const search = singleQueryValue(query.search)?.trim() ?? "";
  const access = optionValue<MembershipStatus>(
    singleQueryValue(query.access) ?? singleQueryValue(query.member_status),
    accessOptions,
  );
  const invitation = optionValue<MemberWorkspaceInvitationStatus>(
    singleQueryValue(query.invitation),
    invitationOptions,
  );
  const requestedCohort = singleQueryValue(query.cohort)?.trim() || undefined;
  const requestedPage = positivePage(singleQueryValue(query.page));
  const cohortRecords = await listCohortRecordsForOrg(viewer.org.id);
  const cohorts = cohortRecords.map(({ cohort }) => cohort);
  const activeCohorts = cohorts.filter((cohort) => cohort.status === "active");
  const selectedCohort = cohorts.some((cohort) => cohort.id === requestedCohort)
    ? requestedCohort
    : undefined;
  const memberPage = await listMemberWorkspaceForOrg(viewer.org.id, {
    query: search,
    status: access,
    invitationStatus: invitation,
    cohortId: selectedCohort,
    page: requestedPage,
    pageSize: 25,
  });
  const invitationsEnabled = isClerkConfigured() || isE2ELocalAuthEnabled();
  const listValues = { search, access, invitation, cohort: selectedCohort };

  return (
    <AppShell currentPath={`/org/${slug}/admin/members`} viewer={viewer}>
      <div className="space-y-7">
        <MemberManagementNav active="members" slug={slug} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            description="Search, review, invite, and manage everyone in this community from one place."
            eyebrow="Admin · Member management"
            level={1}
            title="Members"
          />
          <InvitePeopleDialog
            cohorts={activeCohorts.map(({ id, name }) => ({ id, name }))}
            invitationsEnabled={invitationsEnabled}
            slug={slug}
          />
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />

        {!invitationsEnabled ? (
          <div className="rounded-lg border border-amber-600/30 bg-amber-50 p-4 text-sm text-amber-900">
            Configure Clerk before creating invitations. Existing membership records remain manageable.
          </div>
        ) : null}

        <Card className="space-y-4">
          <form className="grid gap-4 lg:grid-cols-[minmax(220px,1.4fr)_1fr_1fr_1fr_auto] lg:items-end">
            <div>
              <Label htmlFor="member-search">Name or email</Label>
              <Input
                defaultValue={search}
                id="member-search"
                name="search"
                placeholder="Search members"
                type="search"
              />
            </div>
            <div>
              <Label htmlFor="member-access">Community access</Label>
              <Select defaultValue={access ?? ""} id="member-access" name="access">
                {accessOptions.map(([value, label]) => (
                  <option key={label} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="member-invitation">Invitation</Label>
              <Select defaultValue={invitation ?? ""} id="member-invitation" name="invitation">
                {invitationOptions.map(([value, label]) => (
                  <option key={label} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="member-cohort">Cohort</Label>
              <Select defaultValue={selectedCohort ?? ""} id="member-cohort" name="cohort">
                <option value="">All cohorts</option>
                {cohorts.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>
                    {cohort.name}{cohort.status === "archived" ? " (archived)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Filter</Button>
              <Link
                className={cn(buttonVariants({ variant: "ghost", size: "md" }))}
                href={`/org/${slug}/admin/members`}
              >
                Reset
              </Link>
            </div>
          </form>
        </Card>

        <section aria-labelledby="member-list-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[var(--ink)]" id="member-list-heading">
                {memberPage.total} {memberPage.total === 1 ? "member" : "members"}
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Invitation and community access are tracked separately.
              </p>
            </div>
            {memberPage.pageCount > 1 ? (
              <p className="text-sm text-[var(--ink-soft)]">
                Page {memberPage.page} of {memberPage.pageCount}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            {memberPage.records.map(({ cohorts: memberCohorts, membership, profile, user }) => {
              const connected = Boolean(membership.clerkMembershipId);
              const invitation = invitationLabel(membership);
              return (
                <Card className="space-y-4" key={membership.id}>
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_0.8fr_0.9fr] md:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[var(--ink)]">
                          {profile?.preferredName || user?.name || "Unnamed member"}
                        </h3>
                        {membership.role === "org_admin" ? <Badge variant="accent">Admin</Badge> : null}
                      </div>
                      <p className="mt-1 break-words text-sm text-[var(--ink-soft)]">
                        {user?.email || "Email unavailable"}
                      </p>
                      {profile?.headline ? (
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--ink-soft)]">
                          {profile.headline}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Community access</p>
                      <Badge className="mt-2" variant={membership.status === "approved" ? "accent" : "default"}>
                        {accessLabel(membership.status)}
                      </Badge>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Invitation</p>
                      <Badge className="mt-2" variant={connected ? "accent" : membership.clerkInvitationStatus === "failed" ? "muted" : "default"}>
                        {invitation}
                      </Badge>
                      {membership.clerkInvitationError ? (
                        <p className="mt-2 break-words text-xs leading-5 text-red-700">
                          {membership.clerkInvitationError}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
                    <span className="mr-1 text-xs font-semibold uppercase text-[var(--ink-soft)]">Cohorts</span>
                    {memberCohorts.length ? memberCohorts.map((cohort) => (
                      <Link key={cohort.id} href={`/org/${slug}/admin/cohorts/${cohort.id}`}>
                        <Badge variant="muted">{cohort.name}</Badge>
                      </Link>
                    )) : <span className="text-xs text-[var(--ink-soft)]">None</span>}
                  </div>

                  <MemberDetailPanel
                    invitationsEnabled={invitationsEnabled}
                    member={{
                      email: user?.email || "Email unavailable",
                      headline: profile?.headline || undefined,
                      name: profile?.preferredName || user?.name || "Unnamed member",
                    }}
                    membership={{
                      id: membership.id,
                      role: membership.role,
                      status: membership.status,
                      approvalNote: membership.approvalNote,
                      clerkMembershipId: membership.clerkMembershipId,
                      clerkInvitationStatus: membership.clerkInvitationStatus,
                      clerkInvitationError: membership.clerkInvitationError,
                    }}
                    slug={slug}
                  />
                </Card>
              );
            })}
            {!memberPage.records.length ? (
              <Card>
                <p className="font-semibold text-[var(--ink)]">No members match these filters</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Reset the filters or invite people to create the first records.
                </p>
              </Card>
            ) : null}
          </div>

          {memberPage.pageCount > 1 ? (
            <nav aria-label="Member list pages" className="flex items-center justify-between gap-3 pt-2">
              {memberPage.page > 1 ? (
                <Link
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                  href={memberListHref(slug, { ...listValues, page: memberPage.page - 1 })}
                >
                  Previous
                </Link>
              ) : <span />}
              <span className="text-sm text-[var(--ink-soft)]">
                {memberPage.page} / {memberPage.pageCount}
              </span>
              {memberPage.page < memberPage.pageCount ? (
                <Link
                  className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                  href={memberListHref(slug, { ...listValues, page: memberPage.page + 1 })}
                >
                  Next
                </Link>
              ) : <span />}
            </nav>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

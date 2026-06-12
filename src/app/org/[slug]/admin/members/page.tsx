import Link from "next/link";

import { createManagedAccountAction, updateMembershipAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewerContext } from "@/lib/auth";
import { isClerkConfigured } from "@/lib/env";
import { singleQueryValue } from "@/lib/feed-filters";
import { listMembershipRecordsForOrg } from "@/server/store";
import type { MembershipStatus } from "@/lib/domain";

const memberStatusFilters = [
  { label: "All", value: undefined },
  { label: "Pending", value: "pending" },
  { label: "Waitlist", value: "waitlist" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Suspended", value: "suspended" },
] satisfies Array<{ label: string; value?: MembershipStatus }>;

function memberStatusFromQuery(value?: string) {
  return memberStatusFilters.some((filter) => filter.value === value)
    ? (value as MembershipStatus)
    : undefined;
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

  if (!viewer) {
    return null;
  }

  const selectedMemberStatus = memberStatusFromQuery(singleQueryValue(query.member_status));
  const memberCards = await listMembershipRecordsForOrg(viewer.org.id, {
    limit: 100,
    status: selectedMemberStatus,
  });
  const clerkConfigured = isClerkConfigured();

  return (
    <AppShell currentPath={`/org/${slug}/admin/members`} viewer={viewer}>
      <div className="space-y-8">
        <SectionHeading
          eyebrow="Admin · Members"
          level={1}
          title="Accounts and membership states"
          description={
            clerkConfigured
              ? "Invite users through Clerk, approve members, and control who can reach admin surfaces."
              : "Create local fallback accounts, approve members, and control who can reach admin surfaces."
          }
        />
        <StatusBanner status={singleQueryValue(query.status)} />
        <Card className="space-y-5">
          <SectionHeading
            eyebrow={clerkConfigured ? "Clerk invitation" : "Local fallback account"}
            title={clerkConfigured ? "Invite or update a member" : "Create or update an account"}
            description={
              clerkConfigured
                ? "Clerk sends the account invitation. Wavespark stores the member role, status, and approval state."
                : "Used only when Clerk keys are not configured in this environment."
            }
          />
          <form
            action={createManagedAccountAction.bind(null, slug)}
            className="grid gap-4 lg:grid-cols-2"
          >
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Member name" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" placeholder="member@company.com" required type="email" />
            </div>
            {clerkConfigured ? null : (
              <div>
                <Label htmlFor="password">Temporary password</Label>
                <Input id="password" minLength={8} name="password" required type="password" />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="role">Role</Label>
                <Select defaultValue="member" id="role" name="role">
                  <option value="member">Member</option>
                  <option value="org_admin">Org admin</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select defaultValue="approved" id="status" name="status">
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="waitlist">Waitlist</option>
                  <option value="suspended">Suspended</option>
                </Select>
              </div>
            </div>
            <div className="lg:col-span-2">
              <SubmitButton
                pendingLabel={clerkConfigured ? "Sending invitation" : "Saving account"}
              >
                {clerkConfigured ? "Send invitation" : "Save account"}
              </SubmitButton>
            </div>
          </form>
        </Card>
        <Card className="overflow-hidden p-0">
          <div className="space-y-4 border-b border-slate-200 px-4 py-4">
            <SectionHeading eyebrow="Latest" title="Member records" />
            <div className="flex flex-wrap gap-2">
              {memberStatusFilters.map((filter) => {
                const active = filter.value === selectedMemberStatus;
                const href = filter.value
                  ? `/org/${slug}/admin/members?member_status=${filter.value}`
                  : `/org/${slug}/admin/members`;

                return (
                  <Button
                    asChild
                    key={filter.label}
                    size="sm"
                    variant={active ? "primary" : "secondary"}
                  >
                    <Link href={href}>{filter.label}</Link>
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 lg:grid-cols-[1.2fr_0.8fr_1.2fr_auto]">
            <span>Member</span>
            <span>Status</span>
            <span>Admin note</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-slate-200">
            {memberCards.map(({ membership, profile, user }) => {
              return (
                <form
                  action={updateMembershipAction.bind(null, slug, membership.id)}
                  className="grid gap-3 px-4 py-4 lg:grid-cols-[1.2fr_0.8fr_1.2fr_auto] lg:items-center"
                  key={membership.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-950">
                        {user?.name ?? membership.id}
                      </h3>
                      <Badge variant={membership.status === "approved" ? "accent" : "default"}>
                        {membership.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {membership.affiliationType} · {membership.programName} ·{" "}
                      {membership.cohortNameOrYear}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-700">
                      {profile?.headline ?? "No profile headline yet."}
                    </p>
                  </div>
                  <select
                    className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
                    defaultValue={membership.status}
                    name="status"
                  >
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="waitlist">Waitlist</option>
                    <option value="rejected">Rejected</option>
                    <option value="suspended">Suspended</option>
                  </select>
                  <Input
                    defaultValue={membership.approvalNote ?? ""}
                    name="approval_note"
                    placeholder="Admin note"
                  />
                  <SubmitButton className="lg:justify-self-end" pendingLabel="Saving">
                    Save
                  </SubmitButton>
                </form>
              );
            })}
            {!memberCards.length ? (
              <div className="px-4 py-6">
                <p className="text-sm text-slate-600">No members found yet.</p>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

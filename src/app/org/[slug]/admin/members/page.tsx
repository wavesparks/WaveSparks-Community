import Link from "next/link";

import {
  adminInvitationIssue,
  adminSpaceName,
} from "@/components/admin/admin-community-copy";
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
import type { AccountStatus, MembershipInvitation } from "@/lib/domain";
import { isE2ELocalAuthEnabled } from "@/lib/e2e-local-auth";
import { isClerkConfigured } from "@/lib/env";
import { singleQueryValue } from "@/lib/feed-filters";
import {
  getAccountStatusLabel,
  getSpaceAccessStatusLabel,
} from "@/lib/member-copy";
import { cn } from "@/lib/utils";
import {
  listMemberWorkspaceForOrg,
  listSpacesForOrg,
  type MemberWorkspaceInvitationStatus,
} from "@/server/store";

const accessOptions = [
  ["", "All account states"],
  ["invited", "Invitation pending"],
  ["connected", "Active"],
  ["suspended", "Paused"],
  ["deprovisioned", "Account closed"],
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
    account?: string;
    space?: string;
    invitation?: string;
    page?: number;
    search?: string;
  },
) {
  const query = new URLSearchParams();
  if (values.search) query.set("search", values.search);
  if (values.account) query.set("account", values.account);
  if (values.invitation) query.set("invitation", values.invitation);
  if (values.space) query.set("space", values.space);
  if (values.page && values.page > 1) query.set("page", String(values.page));
  const suffix = query.toString();
  return `/org/${slug}/admin/members${suffix ? `?${suffix}` : ""}`;
}

function accessLabel(status: AccountStatus) {
  return getAccountStatusLabel(status);
}

function invitationLabel(
  accountStatus: AccountStatus,
  invitation?: Pick<MembershipInvitation, "deliveryError" | "status">,
) {
  if (accountStatus === "connected") return "Connected";
  if (!invitation) return "Not invited";
  if (invitation.deliveryError) return "Invitation failed";
  return `Invitation ${invitation.status}`;
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
    requireConnected: true,
    requireAdmin: true,
  });

  if (!viewer) return null;

  const search = singleQueryValue(query.search)?.trim() ?? "";
  const account = optionValue<AccountStatus>(
    singleQueryValue(query.account),
    accessOptions,
  );
  const invitation = optionValue<MemberWorkspaceInvitationStatus>(
    singleQueryValue(query.invitation),
    invitationOptions,
  );
  const requestedSpace = singleQueryValue(query.space)?.trim() || undefined;
  const requestedPage = positivePage(singleQueryValue(query.page));
  const spaces = await listSpacesForOrg(viewer.org.id);
  const assignableSpaces = spaces.filter((space) => space.lifecycle !== "archived");
  const mainSpace = spaces.find((space) => space.kind === "main");
  const selectedSpace = spaces.some((space) => space.id === requestedSpace)
    ? requestedSpace
    : undefined;
  const memberPage = await listMemberWorkspaceForOrg(viewer.org.id, {
    query: search,
    accountStatus: account,
    invitationStatus: invitation,
    spaceId: selectedSpace,
    page: requestedPage,
    pageSize: 25,
  });
  const invitationsEnabled = isClerkConfigured() || isE2ELocalAuthEnabled();
  const listValues = { search, account, invitation, space: selectedSpace };

  return (
    <AppShell currentPath={`/org/${slug}/admin/members`} viewer={viewer}>
      <div className="space-y-7">
        <MemberManagementNav active="members" slug={slug} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            description="Search, invite, and manage accounts, including access to Wavesparks Community and Events."
            eyebrow="Admin · Member management"
            level={1}
            title="Members"
          />
          <InvitePeopleDialog
            defaultDestinationSpaceId={mainSpace?.id}
            invitationsEnabled={invitationsEnabled}
            slug={slug}
            spaces={assignableSpaces.map(({ id, kind, lifecycle, name }) => ({
              id,
              kind,
              lifecycle,
              name,
            }))}
          />
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />

        {!invitationsEnabled ? (
          <div className="rounded-lg border border-amber-600/30 bg-amber-50 p-4 text-sm text-amber-900">
            Invitations are temporarily unavailable. You can still manage existing members and access.
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
              <Label htmlFor="member-access">Account status</Label>
              <Select defaultValue={account ?? ""} id="member-access" name="account">
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
              <Label htmlFor="member-space">Community or Event</Label>
              <Select defaultValue={selectedSpace ?? ""} id="member-space" name="space">
                <option value="">Wavesparks Community &amp; all Events</option>
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {adminSpaceName(space)}{space.lifecycle === "archived" ? " (archived)" : ""}
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
                Account connection and community or Event access are tracked separately.
              </p>
            </div>
            {memberPage.pageCount > 1 ? (
              <p className="text-sm text-[var(--ink-soft)]">
                Page {memberPage.page} of {memberPage.pageCount}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            {memberPage.records.map(({ invitation, spaces: memberSpaces, membership, profile, user }) => {
              const connected = membership.accountStatus === "connected";
              const invitationText = invitationLabel(membership.accountStatus, invitation);
              return (
                <Card className="space-y-4" key={membership.id}>
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_0.8fr_0.9fr] md:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[var(--ink)]">
                          {profile?.preferredName || user?.name || "Unnamed member"}
                        </h3>
                        {membership.role === "org_admin" ? <Badge variant="accent">Administrator</Badge> : null}
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
                      <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Account status</p>
                      <Badge className="mt-2" variant={membership.accountStatus === "connected" ? "accent" : "default"}>
                        {accessLabel(membership.accountStatus)}
                      </Badge>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">Invitation</p>
                      <Badge className="mt-2" variant={connected ? "accent" : invitation?.deliveryError ? "muted" : "default"}>
                        {invitationText}
                      </Badge>
                      {invitation?.deliveryError ? (
                        <p className="mt-2 break-words text-xs leading-5 text-red-700">
                          {adminInvitationIssue(invitation.deliveryError)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
                    <span className="mr-1 text-xs font-semibold uppercase text-[var(--ink-soft)]">Community &amp; Event access</span>
                    {memberSpaces.length ? memberSpaces.map(({ space, spaceMembership }) => (
                      <Link key={space.id} href={`/org/${slug}/admin/spaces/${space.id}`}>
                        <Badge variant={spaceMembership.accessStatus === "active" ? "accent" : "muted"}>
                          {adminSpaceName(space)} · {getSpaceAccessStatusLabel(spaceMembership.accessStatus)}
                        </Badge>
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
                      accountStatus: membership.accountStatus,
                      id: membership.id,
                      role: membership.role,
                      approvalNote: membership.approvalNote,
                    }}
                    invitation={invitation ? {
                      deliveryError: invitation.deliveryError,
                      sentAt: invitation.sentAt,
                      status: invitation.status,
                    } : undefined}
                    spaces={spaces.map((space) => ({
                      id: space.id,
                      kind: space.kind,
                      lifecycle: space.lifecycle,
                      name: space.name,
                      accessStatus: memberSpaces.find(
                        (record) => record.space.id === space.id,
                      )?.spaceMembership.accessStatus,
                    }))}
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

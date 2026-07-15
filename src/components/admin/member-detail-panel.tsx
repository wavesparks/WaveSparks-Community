"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import {
  resendMembershipInvitationAction,
  revokeMembershipInvitationAction,
  updateMemberSpaceAccessAction,
  updateMembershipAction,
} from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import type {
  AccountStatus,
  MembershipRole,
  SpaceAccessStatus,
} from "@/lib/domain";

export interface MemberDetailPanelProps {
  invitationsEnabled?: boolean;
  member: {
    email: string;
    headline?: string;
    name: string;
  };
  membership: {
    accountStatus: AccountStatus;
    approvalNote?: string;
    clerkInvitationError?: string;
    clerkInvitationStatus?: string;
    clerkMembershipId?: string;
    id: string;
    role: MembershipRole;
  };
  spaces: Array<{
    id: string;
    name: string;
    kind: "main" | "event";
    lifecycle: string;
    accessStatus?: SpaceAccessStatus;
  }>;
  slug: string;
}

function confirmationMessage(
  initialRole: MembershipRole,
  nextRole: MembershipRole,
  initialStatus: AccountStatus,
  nextStatus: AccountStatus,
) {
  const warnings: string[] = [];

  if (initialRole !== "org_admin" && nextRole === "org_admin") {
    warnings.push("grant this member administrator access");
  }
  if (initialStatus !== nextStatus && nextStatus === "suspended") {
    warnings.push("suspend this account across every Space");
  }
  if (initialStatus !== nextStatus && nextStatus === "deprovisioned") {
    warnings.push("deprovision this account across every Space");
  }

  if (!warnings.length) {
    return null;
  }

  return `This will ${warnings.join(" and ")}. Continue?`;
}

export function MemberDetailPanel({
  invitationsEnabled = true,
  member,
  membership,
  spaces,
  slug,
}: MemberDetailPanelProps) {
  const summaryId = useId();
  const [role, setRole] = useState<MembershipRole>(membership.role);
  const [status, setStatus] = useState<AccountStatus>(membership.accountStatus);
  const [selectedSpaceId, setSelectedSpaceId] = useState(spaces[0]?.id ?? "");
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId);
  const [selectedSpaceAccess, setSelectedSpaceAccess] = useState<SpaceAccessStatus>(
    spaces[0]?.accessStatus ?? "active",
  );
  const connected = Boolean(membership.clerkMembershipId);
  const invitationPending = membership.clerkInvitationStatus === "pending";
  const notificationFailed =
    connected && membership.clerkInvitationError?.startsWith("Invitation email failed:");

  function confirmUpdate(event: FormEvent<HTMLFormElement>) {
    const message = confirmationMessage(
      membership.role,
      role,
      membership.accountStatus,
      status,
    );
    if (message && !window.confirm(message)) {
      event.preventDefault();
    }
  }

  return (
    <details className="group rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--ink)] marker:content-none"
        id={summaryId}
      >
        <span>Manage member</span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-[var(--ink-soft)] transition-transform group-open:rotate-180"
        />
      </summary>
      <div aria-labelledby={summaryId} className="space-y-5 border-t border-[var(--line)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-[var(--ink)]">{member.name}</p>
            <p className="mt-1 break-words text-sm text-[var(--ink-soft)]">{member.email}</p>
            {member.headline ? (
              <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">{member.headline}</p>
            ) : null}
          </div>
          <Badge variant={connected ? "accent" : invitationPending ? "default" : "muted"}>
            {connected
              ? "Connected"
              : invitationPending
                ? "Invitation pending"
                : "Not connected"}
          </Badge>
        </div>

        <form
          action={updateMembershipAction.bind(null, slug, membership.id)}
          className="grid gap-4 md:grid-cols-2"
          onSubmit={confirmUpdate}
        >
          <div>
            <Label htmlFor={`${membership.id}-role`}>Role</Label>
            <Select
              id={`${membership.id}-role`}
              name="role"
              onChange={(event) => {
                const nextRole = event.target.value as MembershipRole;
                setRole(nextRole);
              }}
              value={role}
            >
              <option value="member">Member</option>
              <option value="org_admin">Org admin</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${membership.id}-status`}>Account status</Label>
            <Select
              id={`${membership.id}-status`}
              name="account_status"
              onChange={(event) => setStatus(event.target.value as AccountStatus)}
              value={status}
            >
              <option value="invited">Invited</option>
              <option disabled={!connected} value="connected">Connected</option>
              <option value="suspended">Suspended globally</option>
              <option value="deprovisioned">Deprovisioned</option>
            </Select>
            <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
              Suspension overrides access to every Space. It does not rewrite Space rosters.
            </p>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor={`${membership.id}-approval-note`}>Admin note</Label>
            <Input
              defaultValue={membership.approvalNote ?? ""}
              id={`${membership.id}-approval-note`}
              name="approval_note"
              placeholder="Visible to other administrators"
            />
          </div>
          <div className="md:col-span-2">
            <SubmitButton pendingLabel="Saving member">Save changes</SubmitButton>
          </div>
        </form>

        <div className="space-y-3 border-t border-[var(--line)] pt-4">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Space access</p>
            <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
              Main and every Event are independent. Changing one never changes another.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {spaces.filter((space) => space.accessStatus).map((space) => (
              <Badge key={space.id} variant={space.accessStatus === "active" ? "accent" : "muted"}>
                {space.name} · {space.accessStatus}
              </Badge>
            ))}
            {!spaces.some((space) => space.accessStatus) ? (
              <span className="text-xs text-[var(--ink-soft)]">No Space access assigned</span>
            ) : null}
          </div>
          {spaces.length ? (
            <form
              action={updateMemberSpaceAccessAction.bind(null, slug, membership.id)}
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                if (
                  (selectedSpaceAccess === "rejected" ||
                    selectedSpaceAccess === "suspended" ||
                    selectedSpaceAccess === "removed") &&
                  !window.confirm(
                    `Set ${selectedSpace?.name ?? "this Space"} access to ${selectedSpaceAccess}?`,
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
              <div>
                <Label htmlFor={`${membership.id}-space`}>Space</Label>
                <Select
                  id={`${membership.id}-space`}
                  name="space_id"
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const nextSpace = spaces.find((space) => space.id === nextId);
                    setSelectedSpaceId(nextId);
                    setSelectedSpaceAccess(nextSpace?.accessStatus ?? "active");
                  }}
                  value={selectedSpaceId}
                >
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name} · {space.kind === "main" ? "Main" : "Event"}
                      {space.lifecycle === "archived" ? " (archived)" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor={`${membership.id}-space-access`}>Access status</Label>
                <Select
                  id={`${membership.id}-space-access`}
                  name="access_status"
                  onChange={(event) =>
                    setSelectedSpaceAccess(event.target.value as SpaceAccessStatus)
                  }
                  value={selectedSpaceAccess}
                >
                  <option value="active">Active</option>
                  <option value="waitlist">Waitlist</option>
                  <option value="rejected">Rejected</option>
                  <option value="suspended">Suspended in this Space</option>
                  <option value="removed">Removed</option>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor={`${membership.id}-space-note`}>Decision note</Label>
                <Input
                  id={`${membership.id}-space-note`}
                  name="decision_note"
                  placeholder="Visible to other administrators"
                />
              </div>
              <div className="md:col-span-2">
                <SubmitButton pendingLabel="Saving access">Save Space access</SubmitButton>
              </div>
            </form>
          ) : null}
        </div>

        {!connected ? (
          <div className="space-y-3 border-t border-[var(--line)] pt-4">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Invitation</p>
              <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
                {membership.clerkInvitationError ||
                  "Invitation status is tracked separately from community access."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <form
                action={resendMembershipInvitationAction.bind(null, slug, membership.id)}
              >
                <SubmitButton
                  disabled={!invitationsEnabled}
                  pendingLabel="Creating invitation"
                  size="sm"
                  variant="secondary"
                >
                  {invitationPending ? "Resend invitation" : "Create invitation"}
                </SubmitButton>
              </form>
              {invitationPending ? (
                <form
                  action={revokeMembershipInvitationAction.bind(null, slug, membership.id)}
                  onSubmit={(event) => {
                    if (!window.confirm("Revoke this pending invitation?")) {
                      event.preventDefault();
                    }
                  }}
                >
                  <SubmitButton pendingLabel="Revoking invitation" size="sm" variant="ghost">
                    Revoke invitation
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </div>
        ) : null}

        {notificationFailed ? (
          <div className="space-y-3 border-t border-[var(--line)] pt-4">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Sign-in notification failed</p>
              <p className="mt-1 text-xs leading-5 text-red-700">
                {membership.clerkInvitationError}
              </p>
            </div>
            <form action={resendMembershipInvitationAction.bind(null, slug, membership.id)}>
              <SubmitButton
                disabled={!invitationsEnabled}
                pendingLabel="Retrying notification"
                size="sm"
                variant="secondary"
              >
                Retry notification
              </SubmitButton>
            </form>
          </div>
        ) : null}
      </div>
    </details>
  );
}

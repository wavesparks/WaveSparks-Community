"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import {
  resendMembershipInvitationAction,
  revokeMembershipInvitationAction,
  updateMembershipAction,
} from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { MembershipRole, MembershipStatus } from "@/lib/domain";

export interface MemberDetailPanelProps {
  invitationsEnabled?: boolean;
  member: {
    email: string;
    headline?: string;
    name: string;
  };
  membership: {
    approvalNote?: string;
    clerkInvitationError?: string;
    clerkInvitationStatus?: string;
    clerkMembershipId?: string;
    id: string;
    role: MembershipRole;
    status: MembershipStatus;
  };
  slug: string;
}

function confirmationMessage(
  initialRole: MembershipRole,
  nextRole: MembershipRole,
  initialStatus: MembershipStatus,
  nextStatus: MembershipStatus,
) {
  const warnings: string[] = [];

  if (initialRole !== "org_admin" && nextRole === "org_admin") {
    warnings.push("grant this member administrator access");
  }
  if (initialStatus !== nextStatus && nextStatus === "rejected") {
    warnings.push("reject this member's community access");
  }
  if (initialStatus !== nextStatus && nextStatus === "suspended") {
    warnings.push("suspend this member's community access");
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
  slug,
}: MemberDetailPanelProps) {
  const summaryId = useId();
  const [role, setRole] = useState<MembershipRole>(membership.role);
  const [status, setStatus] = useState<MembershipStatus>(
    membership.role === "org_admin" ? "approved" : membership.status,
  );
  const connected = Boolean(membership.clerkMembershipId);
  const invitationPending = membership.clerkInvitationStatus === "pending";
  const notificationFailed =
    connected && membership.clerkInvitationError?.startsWith("Invitation email failed:");

  function confirmUpdate(event: FormEvent<HTMLFormElement>) {
    const message = confirmationMessage(membership.role, role, membership.status, status);
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
                if (nextRole === "org_admin") {
                  setStatus("approved");
                }
              }}
              value={role}
            >
              <option value="member">Member</option>
              <option value="org_admin">Org admin</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${membership.id}-status`}>Community access</Label>
            <Select
              disabled={role === "org_admin"}
              id={`${membership.id}-status`}
              onChange={(event) => setStatus(event.target.value as MembershipStatus)}
              value={status}
            >
              <option value="pending">Pending review</option>
              <option value="waitlist">Waitlist</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="suspended">Suspended</option>
            </Select>
            <input name="status" type="hidden" value={role === "org_admin" ? "approved" : status} />
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

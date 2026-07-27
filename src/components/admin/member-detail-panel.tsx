"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import {
  resendMembershipInvitationAction,
  revokeMembershipInvitationAction,
  updateMemberSpaceAccessAction,
  updateMentorDesignationAction,
  updateMembershipAction,
} from "@/actions/admin";
import {
  adminInvitationIssue,
  adminSpaceName,
  adminSpaceOptionLabel,
} from "@/components/admin/admin-community-copy";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import type {
  AccountStatus,
  MentorStatus,
  MembershipRole,
  MembershipInvitationStatus,
  SpaceAccessStatus,
} from "@/lib/domain";
import {
  getMembershipRoleLabel,
  getSpaceAccessStatusLabel,
} from "@/lib/member-copy";

export interface MemberDetailPanelProps {
  invitationsEnabled?: boolean;
  invitation?: {
    deliveryError?: string;
    sentAt?: string;
    status: MembershipInvitationStatus;
  };
  member: {
    email: string;
    headline?: string;
    name: string;
  };
  membership: {
    accountStatus: AccountStatus;
    approvalNote?: string;
    id: string;
    mentorStatus: MentorStatus;
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
  initialMentorStatus: MentorStatus,
  nextMentorStatus: MentorStatus,
  initialStatus: AccountStatus,
  nextStatus: AccountStatus,
) {
  const warnings: string[] = [];

  if (initialRole !== "org_admin" && nextRole === "org_admin") {
    warnings.push("grant this member administrator access");
  }
  if (initialMentorStatus !== "approved" && nextMentorStatus === "approved") {
    warnings.push("grant this member the Approved Mentor designation");
  }
  if (initialMentorStatus === "approved" && nextMentorStatus !== "approved") {
    warnings.push("revoke this member’s Approved Mentor designation");
  }
  if (initialStatus !== nextStatus && nextStatus === "suspended") {
    warnings.push("block this account from Wavesparks Community and every Event");
  }
  if (initialStatus !== nextStatus && nextStatus === "deprovisioned") {
    warnings.push("remove this account from Wavesparks Community and every Event");
  }

  if (!warnings.length) {
    return null;
  }

  return `This will ${warnings.join(" and ")}. Continue?`;
}

export function MemberDetailPanel({
  invitationsEnabled = true,
  invitation,
  member,
  membership,
  spaces,
  slug,
}: MemberDetailPanelProps) {
  const summaryId = useId();
  const [role, setRole] = useState<MembershipRole>(membership.role);
  const [mentorStatus, setMentorStatus] = useState<MentorStatus>(
    membership.mentorStatus,
  );
  const [status, setStatus] = useState<AccountStatus>(membership.accountStatus);
  const [selectedSpaceId, setSelectedSpaceId] = useState(spaces[0]?.id ?? "");
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId);
  const [selectedSpaceAccess, setSelectedSpaceAccess] = useState<SpaceAccessStatus>(
    spaces[0]?.accessStatus ?? "active",
  );
  const connected = membership.accountStatus === "connected";
  const invitationPending = invitation?.status === "pending";
  const canInvite = membership.accountStatus === "invited";

  function confirmUpdate(event: FormEvent<HTMLFormElement>) {
    const message = confirmationMessage(
      membership.role,
      role,
      membership.mentorStatus,
      mentorStatus,
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
          <div className="flex flex-wrap justify-end gap-2">
            <Badge variant={connected ? "accent" : invitationPending ? "default" : "muted"}>
              {connected
                ? "Connected"
                : invitationPending
                  ? "Invitation pending"
                  : "Not connected"}
            </Badge>
            {membership.mentorStatus === "approved" ? (
              <Badge variant="accent">Approved mentor</Badge>
            ) : membership.mentorStatus === "needs_review" ? (
              <Badge variant="default">Mentor review</Badge>
            ) : null}
          </div>
        </div>

        <form
          action={updateMembershipAction.bind(null, slug, membership.id)}
          className="grid gap-4 md:grid-cols-2"
          onSubmit={confirmUpdate}
        >
          <div>
            <Label htmlFor={`${membership.id}-role`}>Account permissions</Label>
            <Select
              id={`${membership.id}-role`}
              name="role"
              onChange={(event) => {
                const nextRole = event.target.value as MembershipRole;
                setRole(nextRole);
              }}
              value={role}
            >
              <option value="member">{getMembershipRoleLabel("member")}</option>
              <option value="org_admin">{getMembershipRoleLabel("org_admin")}</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${membership.id}-mentor-status`}>Mentor designation</Label>
            <Select
              id={`${membership.id}-mentor-status`}
              name="mentor_status"
              onChange={(event) => setMentorStatus(event.target.value as MentorStatus)}
              value={mentorStatus}
            >
              <option value="not_mentor">Not a mentor</option>
              <option value="needs_review">Needs review</option>
              <option value="approved">Approved mentor</option>
            </Select>
            <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
              Approved mentors can offer mentoring only in communities or Events they can access.
              This does not grant administrator permissions.
            </p>
          </div>
          <div>
            <Label htmlFor={`${membership.id}-status`}>Account status</Label>
            <Select
              id={`${membership.id}-status`}
              name="account_status"
              onChange={(event) => setStatus(event.target.value as AccountStatus)}
              value={status}
            >
              <option value="invited">Invitation pending</option>
              <option disabled={!connected} value="connected">Active</option>
              <option value="suspended">Paused</option>
              <option value="deprovisioned">Account closed</option>
            </Select>
            <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
              Pausing the account blocks access to Wavesparks Community and every Event. Participant lists stay unchanged.
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

        {membership.mentorStatus === "needs_review" ? (
          <div className="space-y-3 border-t border-[var(--line)] pt-4">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Mentor review</p>
              <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
                Review this person’s mentor experience before enabling mentor profiles,
                matching, and mentoring requests.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <form
                action={updateMentorDesignationAction.bind(null, slug, membership.id)}
                onSubmit={(event) => {
                  if (!window.confirm("Approve this person as a mentor?")) {
                    event.preventDefault();
                  }
                }}
              >
                <input name="mentor_status" type="hidden" value="approved" />
                <SubmitButton pendingLabel="Approving mentor" size="sm">
                  Approve mentor
                </SubmitButton>
              </form>
              <form
                action={updateMentorDesignationAction.bind(null, slug, membership.id)}
                onSubmit={(event) => {
                  if (!window.confirm("Reject this mentor designation review?")) {
                    event.preventDefault();
                  }
                }}
              >
                <input name="mentor_status" type="hidden" value="not_mentor" />
                <SubmitButton pendingLabel="Rejecting review" size="sm" variant="ghost">
                  Reject
                </SubmitButton>
              </form>
            </div>
          </div>
        ) : null}

        <div className="space-y-3 border-t border-[var(--line)] pt-4">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Community &amp; Event access</p>
            <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
              Wavesparks Community and each Event are managed separately. Changing one does not affect the others.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {spaces.filter((space) => space.accessStatus).map((space) => (
              <Badge key={space.id} variant={space.accessStatus === "active" ? "accent" : "muted"}>
                {adminSpaceName(space)} · {getSpaceAccessStatusLabel(space.accessStatus!)}
              </Badge>
            ))}
            {!spaces.some((space) => space.accessStatus) ? (
              <span className="text-xs text-[var(--ink-soft)]">Not added to Wavesparks Community or any Event</span>
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
                    `Change ${selectedSpace ? adminSpaceName(selectedSpace) : "this community or Event"} access to ${getSpaceAccessStatusLabel(selectedSpaceAccess)}? This person may no longer be able to enter.`,
                  )
                ) {
                  event.preventDefault();
                }
              }}
            >
              <div>
                <Label htmlFor={`${membership.id}-space`}>Community or Event</Label>
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
                      {adminSpaceOptionLabel(space)}
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
                  <option value="waitlist">Awaiting approval</option>
                  <option value="rejected">Not approved</option>
                  <option value="suspended">Paused for this community or Event</option>
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
                <SubmitButton pendingLabel="Saving access">Save access</SubmitButton>
              </div>
            </form>
          ) : null}
        </div>

        {canInvite ? (
          <div className="space-y-3 border-t border-[var(--line)] pt-4">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Invitation</p>
              <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
                {invitation?.deliveryError
                  ? adminInvitationIssue(invitation.deliveryError)
                  : invitation?.sentAt
                    ? "A private, expiring invitation link has been sent."
                    : "Create a private, expiring invitation link for this member."}
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

      </div>
    </details>
  );
}

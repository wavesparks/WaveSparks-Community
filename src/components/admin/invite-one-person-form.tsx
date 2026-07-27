"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { createManagedAccountAction } from "@/actions/admin";
import { adminSpaceOptionLabel } from "@/components/admin/admin-community-copy";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { MembershipRole, MentorStatus } from "@/lib/domain";
import type { MemberImportAccessStatus } from "@/lib/member-import";

export interface InviteOnePersonFormProps {
  spaces: Array<{
    id: string;
    name: string;
    kind: "main" | "event";
    lifecycle: string;
  }>;
  defaultAccessStatus: MemberImportAccessStatus;
  defaultDestinationSpaceId?: string;
  invitationsEnabled?: boolean;
  returnToSpaceId?: string;
  slug: string;
}

export function InviteOnePersonForm({
  spaces,
  defaultAccessStatus,
  defaultDestinationSpaceId,
  invitationsEnabled = true,
  returnToSpaceId,
  slug,
}: InviteOnePersonFormProps) {
  const [role, setRole] = useState<MembershipRole>("member");
  const [mentorStatus, setMentorStatus] = useState<
    Extract<MentorStatus, "not_mentor" | "approved">
  >("not_mentor");
  const [accessStatus, setAccessStatus] = useState(defaultAccessStatus);
  const [destinationSpaceId, setDestinationSpaceId] = useState(
    defaultDestinationSpaceId ?? spaces[0]?.id ?? "",
  );
  const isAdmin = role === "org_admin";

  return (
    <form
      action={createManagedAccountAction.bind(null, slug)}
      className="grid gap-4 sm:grid-cols-2"
    >
      {returnToSpaceId ? (
        <input name="return_to_space_id" type="hidden" value={returnToSpaceId} />
      ) : null}
      <div>
        <Label htmlFor="invite-person-name">Name</Label>
        <Input
          autoComplete="name"
          id="invite-person-name"
          name="name"
          placeholder="Member name"
        />
      </div>
      <div>
        <Label htmlFor="invite-person-email">Email</Label>
        <Input
          autoComplete="email"
          id="invite-person-email"
          name="email"
          placeholder="member@company.com"
          required
          type="email"
        />
      </div>
      <div>
        <Label htmlFor="invite-person-role">Account permissions</Label>
        <Select
          id="invite-person-role"
          name="role"
          onChange={(event) => {
            const nextRole = event.target.value as MembershipRole;
            setRole(nextRole);
            if (nextRole === "org_admin") {
              setDestinationSpaceId("");
            } else if (!destinationSpaceId) {
              setDestinationSpaceId(defaultDestinationSpaceId ?? spaces[0]?.id ?? "");
            }
          }}
          value={role}
        >
          <option value="member">Member</option>
          <option value="org_admin">Administrator</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="invite-person-mentor-status">Mentor designation</Label>
        <Select
          id="invite-person-mentor-status"
          name="mentor_status"
          onChange={(event) =>
            setMentorStatus(
              event.target.value as Extract<MentorStatus, "not_mentor" | "approved">,
            )
          }
          value={mentorStatus}
        >
          <option value="not_mentor">Not a mentor</option>
          <option value="approved">Approved mentor</option>
        </Select>
        <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
          Mentor designation is independent from account permissions and community or Event access.
          Existing accounts keep their current designation; change it from member details.
        </p>
      </div>
      <div>
        <Label htmlFor="invite-person-status">When can they join?</Label>
        <Select
          id="invite-person-status"
          onChange={(event) =>
            setAccessStatus(event.target.value as MemberImportAccessStatus)
          }
          value={accessStatus}
        >
          <option value="waitlist">After approval</option>
          <option value="active">Immediately</option>
        </Select>
        <input name="space_access_status" type="hidden" value={accessStatus} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="invite-person-space">Add to</Label>
        <Select
          id="invite-person-space"
          name="destination_space_id"
          onChange={(event) => setDestinationSpaceId(event.target.value)}
          required={!isAdmin}
          value={destinationSpaceId}
        >
          <option value="">
            {isAdmin
              ? "Do not add to a community or Event"
              : "Choose Wavesparks Community or an Event"}
          </option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {adminSpaceOptionLabel(space)}
            </option>
          ))}
        </Select>
        <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
          {isAdmin
            ? "Admin permissions do not make this person a community or Event participant. Choose where to add them only if they should join conversations and matching."
            : "The invitation connects their account and gives them access to the community or Event you choose."}
        </p>
      </div>

      {isAdmin ? (
        <div className="rounded-lg border border-amber-600/30 bg-amber-50 p-4 sm:col-span-2">
          <div className="flex gap-3">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Administrator access</p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                This person can manage all members, Wavesparks Community, and every Event.
                They will only appear as a participant or in matching if you also add them above.
              </p>
              <label className="mt-3 flex items-start gap-2 text-sm font-medium text-[var(--ink)]">
                <input
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                  name="confirm_admin_access"
                  required
                  type="checkbox"
                />
                I understand this grants administrator permissions.
              </label>
            </div>
          </div>
        </div>
      ) : null}

      {mentorStatus === "approved" ? (
        <div className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-4 sm:col-span-2">
          <p className="text-sm font-semibold text-[var(--ink)]">Approved mentor</p>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
            This person can publish mentor details, offer mentor matching, and receive mentoring
            requests after they also have active access to the relevant community or Event.
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4 sm:col-span-2">
        <p className="text-xs leading-5 text-[var(--ink-soft)]">
          We’ll create the invitation now. You can check its status from the member list.
        </p>
        <SubmitButton
          disabled={!invitationsEnabled}
          pendingLabel="Inviting"
        >
          Invite person
        </SubmitButton>
      </div>
    </form>
  );
}

"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { createManagedAccountAction } from "@/actions/admin";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { MembershipRole } from "@/lib/domain";
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
        <Label htmlFor="invite-person-role">Role</Label>
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
          <option value="org_admin">Org admin</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="invite-person-status">Space access</Label>
        <Select
          id="invite-person-status"
          onChange={(event) =>
            setAccessStatus(event.target.value as MemberImportAccessStatus)
          }
          value={accessStatus}
        >
          <option value="waitlist">Waitlist</option>
          <option value="active">Active access</option>
        </Select>
        <input name="space_access_status" type="hidden" value={accessStatus} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="invite-person-space">Destination Space</Label>
        <Select
          id="invite-person-space"
          name="destination_space_id"
          onChange={(event) => setDestinationSpaceId(event.target.value)}
          required={!isAdmin}
          value={destinationSpaceId}
        >
          <option value="">
            {isAdmin ? "No Space access" : "Choose a Space"}
          </option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name} · {space.kind === "main" ? "Main Community" : "Event"}
            </option>
          ))}
        </Select>
        <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
          {isAdmin
            ? "Global admin access does not add this person to Main or any Event. Choose a Space only if they should participate socially."
            : "Account connection and access to this Space are created independently."}
        </p>
      </div>

      {isAdmin ? (
        <div className="rounded-lg border border-amber-600/30 bg-amber-50 p-4 sm:col-span-2">
          <div className="flex gap-3">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Administrator access</p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                This person can manage accounts and every Space. They will not appear in a
                participant roster or matching pool unless a destination Space is selected.
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

      <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4 sm:col-span-2">
        <p className="text-xs leading-5 text-[var(--ink-soft)]">
          Creating an invitation does not guarantee email delivery.
        </p>
        <SubmitButton
          disabled={!invitationsEnabled}
          pendingLabel="Creating invitation"
        >
          Create invitation
        </SubmitButton>
      </div>
    </form>
  );
}

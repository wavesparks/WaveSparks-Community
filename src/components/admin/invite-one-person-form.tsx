"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { createManagedAccountAction } from "@/actions/admin";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { MembershipRole, MembershipStatus } from "@/lib/domain";

export interface InviteOnePersonFormProps {
  cohorts: Array<{ id: string; name: string }>;
  defaultAccessStatus: Extract<MembershipStatus, "pending" | "waitlist" | "approved">;
  defaultCohortId?: string;
  invitationsEnabled?: boolean;
  returnToCohortId?: string;
  slug: string;
}

export function InviteOnePersonForm({
  cohorts,
  defaultAccessStatus,
  defaultCohortId,
  invitationsEnabled = true,
  returnToCohortId,
  slug,
}: InviteOnePersonFormProps) {
  const [role, setRole] = useState<MembershipRole>("member");
  const [accessStatus, setAccessStatus] = useState(defaultAccessStatus);
  const isAdmin = role === "org_admin";

  return (
    <form
      action={createManagedAccountAction.bind(null, slug)}
      className="grid gap-4 sm:grid-cols-2"
    >
      {returnToCohortId ? (
        <input name="return_to_cohort_id" type="hidden" value={returnToCohortId} />
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
              setAccessStatus("approved");
            }
          }}
          value={role}
        >
          <option value="member">Member</option>
          <option value="org_admin">Org admin</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="invite-person-status">Community access</Label>
        <Select
          disabled={isAdmin}
          id="invite-person-status"
          onChange={(event) =>
            setAccessStatus(
              event.target.value as Extract<
                MembershipStatus,
                "pending" | "waitlist" | "approved"
              >,
            )
          }
          value={accessStatus}
        >
          <option value="pending">Pending review</option>
          <option value="waitlist">Waitlist</option>
          <option value="approved">Approved</option>
        </Select>
        <input name="status" type="hidden" value={isAdmin ? "approved" : accessStatus} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="invite-person-cohort">Cohort (optional)</Label>
        <Select defaultValue={defaultCohortId ?? ""} id="invite-person-cohort" name="cohort_id">
          <option value="">No cohort</option>
          {cohorts.map((cohort) => (
            <option key={cohort.id} value={cohort.id}>
              {cohort.name}
            </option>
          ))}
        </Select>
      </div>

      {isAdmin ? (
        <div className="rounded-lg border border-amber-600/30 bg-amber-50 p-4 sm:col-span-2">
          <div className="flex gap-3">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Administrator access</p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                This person will be approved immediately and can manage members, settings, and
                community content.
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

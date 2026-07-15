"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { promoteCohortMembersAction } from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import type { MembershipStatus } from "@/lib/domain";

export interface CohortApprovalMember {
  email: string;
  invitationLabel: string;
  membershipId: string;
  name: string;
  status: MembershipStatus;
}

export interface CohortApprovalFormProps {
  cohortId: string;
  disabled?: boolean;
  members: CohortApprovalMember[];
  slug: string;
}

const accessStatusLabels: Record<MembershipStatus, string> = {
  approved: "Approved",
  pending: "Pending review",
  rejected: "Rejected",
  suspended: "Suspended",
  waitlist: "Waitlist",
};

export function CohortApprovalForm({
  cohortId,
  disabled = false,
  members,
  slug,
}: CohortApprovalFormProps) {
  const fieldId = useId();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<MembershipStatus | "all">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const normalizedQuery = query.trim().toLowerCase();
  const visibleMembers = members.filter((member) => {
    const matchesQuery =
      !normalizedQuery ||
      member.name.toLowerCase().includes(normalizedQuery) ||
      member.email.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (statusFilter === "all" || member.status === statusFilter);
  });
  const visibleEligibleMembers = disabled
    ? []
    : visibleMembers.filter(
        (member) => member.status === "pending" || member.status === "waitlist",
      );
  const allVisibleEligibleSelected =
    visibleEligibleMembers.length > 0 &&
    visibleEligibleMembers.every((member) => selectedIds.has(member.membershipId));
  const someVisibleEligibleSelected = visibleEligibleMembers.some((member) =>
    selectedIds.has(member.membershipId),
  );
  const selectedMembers = disabled
    ? []
    : members.filter(
        (member) =>
          (member.status === "pending" || member.status === "waitlist") &&
          selectedIds.has(member.membershipId),
      );

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        someVisibleEligibleSelected && !allVisibleEligibleSelected;
    }
  }, [allVisibleEligibleSelected, someVisibleEligibleSelected]);

  function toggleMember(membershipId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(membershipId);
      } else {
        next.delete(membershipId);
      }
      return next;
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const member of visibleEligibleMembers) {
        if (checked) {
          next.add(member.membershipId);
        } else {
          next.delete(member.membershipId);
        }
      }
      return next;
    });
  }

  function confirmApproval(event: FormEvent<HTMLFormElement>) {
    if (!selectedMembers.length) {
      event.preventDefault();
      return;
    }

    if (!window.confirm(`Approve ${selectedMembers.length} for community access?`)) {
      event.preventDefault();
    }
  }

  return (
    <form
      action={promoteCohortMembersAction.bind(null, slug, cohortId)}
      className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]"
      onSubmit={confirmApproval}
    >
      {selectedMembers.map((member) => (
        <input
          key={member.membershipId}
          name="membership_id"
          type="hidden"
          value={member.membershipId}
        />
      ))}

      <div className="grid gap-4 border-b border-[var(--line)] bg-[var(--surface-muted)] p-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <Label htmlFor={`${fieldId}-search`}>Search members</Label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-soft)]"
            />
            <Input
              className="pl-9"
              id={`${fieldId}-search`}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or email"
              type="search"
              value={query}
            />
          </div>
        </div>
        <div>
          <Label htmlFor={`${fieldId}-status`}>Community status</Label>
          <Select
            id={`${fieldId}-status`}
            onChange={(event) =>
              setStatusFilter(event.target.value as MembershipStatus | "all")
            }
            value={statusFilter}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending review</option>
            <option value="waitlist">Waitlist</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="suspended">Suspended</option>
          </Select>
        </div>
      </div>

      <div className="border-b border-[var(--line)] px-4 py-3">
        <label className="flex w-fit items-center gap-2 text-sm font-semibold text-[var(--ink)]">
          <input
            checked={allVisibleEligibleSelected}
            className="size-4 accent-[var(--accent)]"
            disabled={!visibleEligibleMembers.length}
            onChange={(event) => toggleAllVisible(event.target.checked)}
            ref={selectAllRef}
            type="checkbox"
          />
          Select all visible eligible ({visibleEligibleMembers.length})
        </label>
        {selectedMembers.length ? (
          <p aria-live="polite" className="mt-1 text-xs text-[var(--ink-soft)]">
            {selectedMembers.length} selected across all filters
          </p>
        ) : null}
      </div>

      <div className="hidden grid-cols-[44px_minmax(0,1.35fr)_minmax(140px,0.65fr)_minmax(150px,0.75fr)] gap-3 bg-[var(--surface-muted)] px-4 py-3 text-xs font-semibold uppercase text-[var(--ink-soft)] md:grid">
        <span aria-hidden />
        <span>Member</span>
        <span>Community</span>
        <span>Invitation</span>
      </div>
      <div className="divide-y divide-[var(--line)]">
        {visibleMembers.map((member) => {
          const eligible =
            !disabled && (member.status === "pending" || member.status === "waitlist");
          return (
            <label
              className="grid cursor-pointer gap-3 px-4 py-4 transition-colors hover:bg-[var(--surface-muted)] md:grid-cols-[44px_minmax(0,1.35fr)_minmax(140px,0.65fr)_minmax(150px,0.75fr)] md:items-center"
              key={member.membershipId}
            >
              <span className="flex items-center gap-2 md:block">
                <input
                  checked={eligible && selectedIds.has(member.membershipId)}
                  className="size-4 accent-[var(--accent)]"
                  disabled={!eligible}
                  onChange={(event) =>
                    toggleMember(member.membershipId, event.target.checked)
                  }
                  type="checkbox"
                />
                <span className="text-xs font-semibold uppercase text-[var(--ink-soft)] md:hidden">
                  {disabled
                    ? "Archived"
                    : eligible
                      ? "Select"
                      : member.status === "approved"
                        ? "Already approved"
                        : "Manage in Members"}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-[var(--ink)]">{member.name}</span>
                <span className="mt-1 block break-words text-sm text-[var(--ink-soft)]">
                  {member.email}
                </span>
              </span>
              <span className="flex items-center justify-between gap-3 md:block">
                <span className="text-xs font-semibold uppercase text-[var(--ink-soft)] md:hidden">
                  Community
                </span>
                <Badge variant={member.status === "approved" ? "accent" : "muted"}>
                  {accessStatusLabels[member.status]}
                </Badge>
              </span>
              <span className="flex items-start justify-between gap-3 text-sm text-[var(--ink-soft)] md:block">
                <span className="text-xs font-semibold uppercase text-[var(--ink-soft)] md:hidden">
                  Invitation
                </span>
                <span className="text-right md:text-left">{member.invitationLabel}</span>
              </span>
            </label>
          );
        })}
        {!visibleMembers.length ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-semibold text-[var(--ink)]">No matching members</p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Adjust the search or community status filter.
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 border-t border-[var(--line)] bg-[var(--surface-muted)] p-4 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${fieldId}-approval-note`}>Approval note</Label>
          <Input
            disabled={disabled}
            id={`${fieldId}-approval-note`}
            name="approval_note"
            placeholder="Approved from cohort review."
          />
        </div>
        <SubmitButton
          disabled={disabled || !selectedMembers.length}
          pendingLabel={`Approving ${selectedMembers.length}`}
        >
          Approve {selectedMembers.length} for community
        </SubmitButton>
      </div>
    </form>
  );
}

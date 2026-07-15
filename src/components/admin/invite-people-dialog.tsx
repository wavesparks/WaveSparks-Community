"use client";

import { UserPlus } from "lucide-react";
import { useId, useState } from "react";

import { InviteOnePersonForm } from "@/components/admin/invite-one-person-form";
import { MemberImportWorkflow } from "@/components/admin/member-import-workflow";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { MemberImportAccessStatus } from "@/lib/member-import";
import { cn } from "@/lib/utils";

export interface InvitePeopleDialogProps {
  spaces?: Array<{
    id: string;
    name: string;
    kind: "main" | "event";
    lifecycle: string;
  }>;
  /** @deprecated Use `spaces`. */
  cohorts?: Array<{ id: string; name: string }>;
  defaultAccessStatus?: MemberImportAccessStatus;
  defaultDestinationSpaceId?: string;
  /** @deprecated Use `defaultDestinationSpaceId`. */
  defaultCohortId?: string;
  invitationsEnabled?: boolean;
  slug: string;
  triggerLabel?: string;
}

type InviteTab = "one" | "list";

export function InvitePeopleDialog({
  spaces,
  cohorts,
  defaultAccessStatus = "active",
  defaultDestinationSpaceId,
  defaultCohortId,
  invitationsEnabled = true,
  slug,
  triggerLabel = "Invite people",
}: InvitePeopleDialogProps) {
  const availableSpaces = spaces ?? (cohorts ?? []).map((cohort) => ({
    ...cohort,
    kind: "event" as const,
    lifecycle: "active",
  }));
  const destinationSpaceId = defaultDestinationSpaceId ?? defaultCohortId;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<InviteTab>("one");
  const tabsId = useId();

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button">
        <UserPlus aria-hidden className="size-4" />
        {triggerLabel}
      </Button>
      <Dialog
        description="Invite one person or review a CSV or Excel list before creating invitations."
        onOpenChange={setOpen}
        open={open}
        title="Invite people"
      >
        {open ? (
          <div className="space-y-5">
            <div
              aria-label="Invitation method"
              className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--surface-muted)] p-1"
              role="tablist"
            >
              {([
                ["one", "One person"],
                ["list", "Upload list"],
              ] as const).map(([value, label]) => {
                const selected = tab === value;
                return (
                  <button
                    aria-controls={`${tabsId}-${value}-panel`}
                    aria-selected={selected}
                    className={cn(
                      "min-h-10 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                      selected
                        ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
                        : "text-[var(--ink-soft)] hover:text-[var(--ink)]",
                    )}
                    id={`${tabsId}-${value}-tab`}
                    key={value}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                        return;
                      }
                      event.preventDefault();
                      const nextTab: InviteTab = value === "one" ? "list" : "one";
                      setTab(nextTab);
                      document.getElementById(`${tabsId}-${nextTab}-tab`)?.focus();
                    }}
                    onClick={() => setTab(value)}
                    role="tab"
                    tabIndex={selected ? 0 : -1}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div
              aria-labelledby={`${tabsId}-one-tab`}
              hidden={tab !== "one"}
              id={`${tabsId}-one-panel`}
              role="tabpanel"
              tabIndex={0}
            >
              <InviteOnePersonForm
                spaces={availableSpaces}
                defaultAccessStatus={defaultAccessStatus}
                defaultDestinationSpaceId={destinationSpaceId}
                invitationsEnabled={invitationsEnabled}
                returnToSpaceId={destinationSpaceId}
                slug={slug}
              />
            </div>
            <div
              aria-labelledby={`${tabsId}-list-tab`}
              hidden={tab !== "list"}
              id={`${tabsId}-list-panel`}
              role="tabpanel"
              tabIndex={0}
            >
              <MemberImportWorkflow
                spaces={availableSpaces}
                defaultAccessStatus={defaultAccessStatus}
                defaultDestinationSpaceId={destinationSpaceId}
                invitationsEnabled={invitationsEnabled}
                slug={slug}
              />
            </div>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

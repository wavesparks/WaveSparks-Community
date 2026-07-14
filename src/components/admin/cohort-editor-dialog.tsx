"use client";

import { Archive, Pencil, Plus } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import {
  archiveCohortAction,
  createCohortAction,
  updateCohortAction,
} from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

export interface CohortEditorDialogProps {
  cohort?: {
    description: string;
    eventLabel: string;
    id: string;
    name: string;
  };
  slug: string;
}

export function CohortEditorDialog({ cohort, slug }: CohortEditorDialogProps) {
  const [open, setOpen] = useState(false);
  const fieldId = useId();
  const editing = Boolean(cohort);
  const action = cohort
    ? updateCohortAction.bind(null, slug, cohort.id)
    : createCohortAction.bind(null, slug);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size={editing ? "sm" : "md"}
        type="button"
        variant={editing ? "secondary" : "primary"}
      >
        {editing ? (
          <Pencil aria-hidden className="size-4" />
        ) : (
          <Plus aria-hidden className="size-4" />
        )}
        {editing ? "Edit cohort" : "New cohort"}
      </Button>
      <Dialog
        description={
          editing
            ? "Update this group’s label and internal context. Member access is managed separately."
            : "Create an optional group for invitations and focused member review."
        }
        onOpenChange={setOpen}
        open={open}
        title={editing ? "Edit cohort" : "New cohort"}
      >
        {open ? (
          <form action={action} className="space-y-4">
            <div>
              <Label htmlFor={`${fieldId}-name`}>Name</Label>
              <Input
                autoFocus
                defaultValue={cohort?.name ?? ""}
                id={`${fieldId}-name`}
                name="name"
                placeholder="YFS Demo Day July"
                required
              />
            </div>
            <div>
              <Label htmlFor={`${fieldId}-event-label`}>Event label</Label>
              <Input
                defaultValue={cohort?.eventLabel ?? ""}
                id={`${fieldId}-event-label`}
                name="event_label"
                placeholder="July 2026"
              />
            </div>
            <div>
              <Label htmlFor={`${fieldId}-description`}>Notes</Label>
              <Textarea
                defaultValue={cohort?.description ?? ""}
                id={`${fieldId}-description`}
                name="description"
                placeholder="Source, event context, or selection notes"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
              <Button onClick={() => setOpen(false)} type="button" variant="ghost">
                Cancel
              </Button>
              <SubmitButton pendingLabel={editing ? "Saving cohort" : "Creating cohort"}>
                {editing ? "Save changes" : "Create cohort"}
              </SubmitButton>
            </div>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}

export interface ArchiveCohortButtonProps {
  cohortId: string;
  slug: string;
}

export function ArchiveCohortButton({ cohortId, slug }: ArchiveCohortButtonProps) {
  function confirmArchive(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        "Archive this cohort? Members will keep their community access, but this cohort will no longer accept changes.",
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={archiveCohortAction.bind(null, slug, cohortId)} onSubmit={confirmArchive}>
      <SubmitButton pendingLabel="Archiving cohort" size="sm" variant="destructive">
        <Archive aria-hidden className="size-4" />
        Archive cohort
      </SubmitButton>
    </form>
  );
}

"use client";

import { CalendarPlus, Pencil } from "lucide-react";
import { useState } from "react";

import {
  createEventSpaceAction,
  updateEventSpaceAction,
} from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";

interface EditableEventSpace {
  id: string;
  name: string;
  description: string;
  eventLabel: string;
  startsAt?: string;
  endsAt?: string;
  lifecycle: "draft" | "upcoming" | "active" | "ended" | "archived";
  matchingEnabled: boolean;
}

export function EventSpaceEditorDialog({
  slug,
  space,
}: {
  slug: string;
  space?: EditableEventSpace;
}) {
  const [open, setOpen] = useState(false);
  const editing = Boolean(space);
  const action = space
    ? updateEventSpaceAction.bind(null, slug, space.id)
    : createEventSpaceAction.bind(null, slug);

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button" variant={editing ? "secondary" : "primary"}>
        {editing ? <Pencil aria-hidden className="size-4" /> : <CalendarPlus aria-hidden className="size-4" />}
        {editing ? "Edit Event" : "New Event"}
      </Button>
      <Dialog
        description="Event access, content, interactions, and matching stay isolated from Main and every other Event."
        onOpenChange={setOpen}
        open={open}
        title={editing ? "Edit Event" : "Create Event"}
      >
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="event-space-name">Event name</Label>
            <Input
              defaultValue={space?.name}
              id="event-space-name"
              name="name"
              placeholder="Founder Lab · Singapore"
              required
            />
          </div>
          <div>
            <Label htmlFor="event-space-label">Short label</Label>
            <Input
              defaultValue={space?.eventLabel}
              id="event-space-label"
              name="event_label"
              placeholder="August 2026"
            />
          </div>
          <div>
            <Label htmlFor="event-space-lifecycle">Lifecycle</Label>
            <Select
              defaultValue={space?.lifecycle === "archived" ? "ended" : space?.lifecycle ?? "draft"}
              id="event-space-lifecycle"
              name="lifecycle"
            >
              {!space || space.lifecycle === "draft" ? (
                <option value="draft">Draft · admin only</option>
              ) : null}
              <option value="upcoming">Upcoming · participants can enter</option>
              <option value="active">Active</option>
              <option value="ended">Ended · interaction stays open</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="event-space-start">Start date</Label>
            <Input
              defaultValue={space?.startsAt?.slice(0, 10)}
              id="event-space-start"
              name="starts_at"
              type="date"
            />
          </div>
          <div>
            <Label htmlFor="event-space-end">End date</Label>
            <Input
              defaultValue={space?.endsAt?.slice(0, 10)}
              id="event-space-end"
              name="ends_at"
              type="date"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="event-space-description">Description</Label>
            <Textarea
              defaultValue={space?.description}
              id="event-space-description"
              name="description"
              placeholder="What this Event is for and who participates."
            />
          </div>
          <label className="flex items-start gap-3 rounded-lg border border-[var(--line)] p-4 sm:col-span-2">
            <input
              className="mt-0.5 size-4 accent-[var(--accent)]"
              defaultChecked={space?.matchingEnabled ?? true}
              name="matching_enabled"
              type="checkbox"
            />
            <span>
              <span className="block text-sm font-semibold text-[var(--ink)]">Enable AI matching</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--ink-soft)]">
                Matching uses only eligible participants and intent from this Event. Ended Events continue matching; archived Events stop.
              </span>
            </span>
          </label>
          <div className="flex justify-end border-t border-[var(--line)] pt-4 sm:col-span-2">
            <SubmitButton pendingLabel={editing ? "Saving Event" : "Creating Event"}>
              {editing ? "Save Event" : "Create Event"}
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}

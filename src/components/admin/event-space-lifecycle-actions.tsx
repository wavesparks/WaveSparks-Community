"use client";

import {
  archiveEventSpaceAction,
  restoreEventSpaceAction,
} from "@/actions/admin";
import { SubmitButton } from "@/components/ui/submit-button";

export function EventSpaceLifecycleActions({
  archived,
  slug,
  spaceId,
}: {
  archived: boolean;
  slug: string;
  spaceId: string;
}) {
  if (archived) {
    return (
      <form action={restoreEventSpaceAction.bind(null, slug, spaceId)}>
        <SubmitButton pendingLabel="Restoring Event" variant="secondary">
          Restore Event
        </SubmitButton>
      </form>
    );
  }

  return (
    <form
      action={archiveEventSpaceAction.bind(null, slug, spaceId)}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Archive this Event? Participants will lose access and matching will stop. Posts, conversations, and participant history will be kept.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton pendingLabel="Archiving Event" variant="ghost">
        Archive Event
      </SubmitButton>
    </form>
  );
}

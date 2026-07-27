"use client";

import { useActionState, useState } from "react";

import {
  MentionTextarea,
  type MentionValue,
} from "@/components/community/mention-textarea";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";

export interface CommentActionState {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
}

export type CommentComposerAction = (
  previousState: CommentActionState,
  formData: FormData,
) => Promise<CommentActionState>;

const INITIAL_ACTION_STATE: CommentActionState = {};

export function CommentComposer({
  action,
  candidateEndpoint,
}: {
  action: CommentComposerAction;
  candidateEndpoint: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ACTION_STATE);
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<MentionValue[]>([]);
  const error = state.error || state.message || state.fieldErrors?.body?.[0];

  return (
    <form
      action={formAction}
      className="space-y-3"
      onSubmit={(event) => {
        if (pending || !body.trim()) event.preventDefault();
      }}
    >
      <input name="mentions" type="hidden" value={JSON.stringify(mentions)} />
      <Label htmlFor="space-comment-body">Comment</Label>
      <MentionTextarea
        candidateEndpoint={candidateEndpoint}
        describedBy={error ? "space-comment-help space-comment-error" : "space-comment-help"}
        id="space-comment-body"
        invalid={Boolean(error)}
        maxLength={2_000}
        mentions={mentions}
        name="body"
        onChange={setBody}
        onMentionsChange={setMentions}
        placeholder="Add your response, or type @ to mention someone"
        required
        rows={4}
        submitDisabled={pending || !body.trim()}
        value={body}
      />
      <div className="flex items-start justify-between gap-3 text-xs text-[var(--ink-soft)]">
        <p id="space-comment-help">Links are clickable after publishing. Selected mentions receive an in-app notification.</p>
        <span aria-label={`${body.length} of 2000 characters`}>{body.length}/2,000</span>
      </div>
      {error ? (
        <p
          aria-live="polite"
          className="text-xs text-red-700"
          id="space-comment-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <SubmitButton disabled={pending || !body.trim()} pendingLabel="Adding comment">
        Add comment
      </SubmitButton>
    </form>
  );
}

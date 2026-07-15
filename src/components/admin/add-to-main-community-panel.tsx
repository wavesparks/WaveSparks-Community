"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, UsersRound } from "lucide-react";
import { useState } from "react";

import { addMembersToMainCommunityAction } from "@/actions/admin";
import { adminFriendlyMessage } from "@/components/admin/admin-community-copy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ParticipantOption {
  membershipId: string;
  name: string;
  email: string;
}

type Result = Awaited<ReturnType<typeof addMembersToMainCommunityAction>>;

const resultLabels: Record<Result["rows"][number]["status"], string> = {
  added: "Added",
  already_in_main: "Already in Wavesparks Community",
  account_conflict: "Account conflict",
  failed: "Failed",
};

export function AddToMainCommunityPanel({
  participants,
  slug,
  sourceSpaceId,
}: {
  participants: ParticipantOption[];
  slug: string;
  sourceSpaceId: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [decisionNote, setDecisionNote] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allSelected = participants.length > 0 && selected.length === participants.length;

  async function addSelected() {
    if (!selected.length || !window.confirm(
      `Add ${selected.length} ${selected.length === 1 ? "person" : "people"} to Wavesparks Community? They will keep access to this Event and all of its activity.`,
    )) return;

    setBusy(true);
    setError(null);
    try {
      const next = await addMembersToMainCommunityAction(
        slug,
        sourceSpaceId,
        selected,
        decisionNote,
      );
      setResult(next);
      setSelected([]);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? adminFriendlyMessage(actionError.message)
          : "We couldn’t add these people to Wavesparks Community. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[var(--ink)]">Add to Wavesparks Community</p>
          <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
            Give the selected participants access to Wavesparks Community. Their Event posts, follows, matches, feedback, and introductions stay in this Event.
          </p>
        </div>
        <Button
          disabled={!participants.length}
          onClick={() => setSelected(allSelected ? [] : participants.map((person) => person.membershipId))}
          size="sm"
          type="button"
          variant="ghost"
        >
          {allSelected ? "Clear selection" : "Select all"}
        </Button>
      </div>

      <div className="max-h-72 divide-y divide-[var(--line)] overflow-y-auto rounded-lg border border-[var(--line)]">
        {participants.map((person) => (
          <label className="flex cursor-pointer items-start gap-3 p-3" key={person.membershipId}>
            <input
              checked={selected.includes(person.membershipId)}
              className="mt-1 size-4 accent-[var(--accent)]"
              onChange={(event) => setSelected((current) => event.target.checked
                ? [...current, person.membershipId]
                : current.filter((id) => id !== person.membershipId))}
              type="checkbox"
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[var(--ink)]">{person.name}</span>
              <span className="mt-0.5 block truncate text-xs text-[var(--ink-soft)]">{person.email}</span>
            </span>
          </label>
        ))}
        {!participants.length ? (
          <p className="p-4 text-sm text-[var(--ink-soft)]">There are no active participants to add right now.</p>
        ) : null}
      </div>

      <div>
        <Label htmlFor={`main-add-note-${sourceSpaceId}`}>Note (optional)</Label>
        <Input
          id={`main-add-note-${sourceSpaceId}`}
          onChange={(event) => setDecisionNote(event.target.value)}
          placeholder="Why these participants are being added"
          value={decisionNote}
        />
      </div>

      {error ? (
        <div className="flex gap-2 rounded-lg border border-red-600/25 bg-red-50 p-3 text-sm text-red-900" role="alert">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <Button disabled={busy || !selected.length} onClick={() => void addSelected()} type="button">
        {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <UsersRound aria-hidden className="size-4" />}
        Add {selected.length || "selected"} to Wavesparks Community
      </Button>

      {result ? (
        <div className="space-y-3 border-t border-[var(--line)] pt-4">
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 ${
              result.summary.failed
                ? "border-red-600/25 bg-red-50"
                : result.summary.accountConflict
                  ? "border-amber-600/30 bg-amber-50"
                  : "border-emerald-600/25 bg-emerald-50"
            }`}
            role={result.summary.failed ? "alert" : "status"}
          >
            {result.summary.failed || result.summary.accountConflict ? (
              <AlertCircle aria-hidden className={`mt-0.5 size-4 shrink-0 ${
                result.summary.failed ? "text-red-700" : "text-amber-700"
              }`} />
            ) : (
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-700" />
            )}
            <p className="text-sm text-[var(--ink)]">
              Added {result.summary.added}; already in Wavesparks Community {result.summary.alreadyInMain}; needs review {result.summary.accountConflict}; failed {result.summary.failed}.
            </p>
          </div>
          <div className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
            {result.rows.map((row) => (
              <div className="grid gap-2 p-3 sm:grid-cols-[1fr_auto]" key={row.membershipId}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{row.name}</p>
                  <p className="truncate text-xs text-[var(--ink-soft)]">{row.email}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
                    {adminFriendlyMessage(row.message)}
                  </p>
                </div>
                <Badge
                  className={row.status === "failed"
                    ? "bg-red-50 text-red-800"
                    : row.status === "account_conflict"
                      ? "bg-amber-50 text-amber-800"
                      : undefined}
                  variant={row.status === "added" ? "accent" : row.status === "already_in_main" ? "muted" : "default"}
                >
                  {resultLabels[row.status]}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

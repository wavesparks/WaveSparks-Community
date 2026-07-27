"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { normalizeMentionDisplayName } from "@/lib/post-content";

export interface MentionCandidate {
  displayName: string;
  headline?: string;
  isFollowing: boolean;
  membershipId: string;
  photo?: string;
}

export interface MentionValue {
  end: number;
  label: string;
  membershipId: string;
  start: number;
}

interface MentionTrigger {
  end: number;
  query: string;
  start: number;
}

interface MentionTextareaProps {
  candidateEndpoint: string;
  describedBy?: string;
  id: string;
  invalid?: boolean;
  maxLength: number;
  mentions: MentionValue[];
  name: string;
  onChange: (value: string) => void;
  onMentionsChange: (mentions: MentionValue[]) => void;
  placeholder?: string;
  required?: boolean;
  rows?: number;
  submitDisabled?: boolean;
  value: string;
}

function remapMentions(previous: string, next: string, mentions: MentionValue[]) {
  let prefixLength = 0;
  while (
    prefixLength < previous.length &&
    prefixLength < next.length &&
    previous[prefixLength] === next[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < previous.length - prefixLength &&
    suffixLength < next.length - prefixLength &&
    previous[previous.length - suffixLength - 1] ===
      next[next.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const previousEditEnd = previous.length - suffixLength;
  const nextEditEnd = next.length - suffixLength;
  const delta = nextEditEnd - previousEditEnd;

  return mentions.flatMap((mention) => {
    let updated = mention;
    if (mention.end <= prefixLength) {
      updated = mention;
    } else if (mention.start >= previousEditEnd) {
      updated = {
        ...mention,
        end: mention.end + delta,
        start: mention.start + delta,
      };
    } else {
      return [];
    }

    return next.slice(updated.start, updated.end) === updated.label ? [updated] : [];
  });
}

function findMentionTrigger(
  value: string,
  cursor: number,
  mentions: MentionValue[],
): MentionTrigger | null {
  const beforeCursor = value.slice(0, cursor);
  const start = beforeCursor.lastIndexOf("@");
  if (start < 0) return null;
  if (start > 0 && !/\s/u.test(value[start - 1] ?? "")) return null;
  if (mentions.some((mention) => mention.start === start)) return null;

  const query = value.slice(start + 1, cursor);
  if (
    query.length > 60 ||
    /[\n\r@<>]/u.test(query) ||
    /[.!?,;:]\s/u.test(query)
  ) {
    return null;
  }

  return { end: cursor, query: query.trimStart(), start };
}

function focusTextarea(id: string, cursor: number) {
  requestAnimationFrame(() => {
    const textarea = document.getElementById(id);
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
}

export function MentionTextarea({
  candidateEndpoint,
  describedBy,
  id,
  invalid,
  maxLength,
  mentions,
  name,
  onChange,
  onMentionsChange,
  placeholder,
  required,
  rows,
  submitDisabled,
  value,
}: MentionTextareaProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
  const listId = `${id}-mention-candidates`;
  const uniqueMentionIds = new Set(mentions.map((mention) => mention.membershipId));
  const visibleCandidates = candidates.filter(
    (candidate) => uniqueMentionIds.size < 10 || uniqueMentionIds.has(candidate.membershipId),
  );

  useEffect(() => {
    if (!trigger) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setRequestError(null);
      try {
        const separator = candidateEndpoint.includes("?") ? "&" : "?";
        const response = await fetch(
          `${candidateEndpoint}${separator}q=${encodeURIComponent(trigger.query)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          candidates?: MentionCandidate[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Could not load members.");
        setCandidates((payload.candidates ?? []).slice(0, 8));
        setActiveIndex(0);
      } catch (error) {
        if (controller.signal.aborted) return;
        setCandidates([]);
        setRequestError(error instanceof Error ? error.message : "Could not load members.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 150);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [candidateEndpoint, mentions.length, trigger]);

  function updateTrigger(nextValue: string, cursor: number, nextMentions: MentionValue[]) {
    const nextTrigger =
      nextMentions.length >= 20
        ? null
        : findMentionTrigger(nextValue, cursor, nextMentions);
    if (!nextTrigger) {
      setCandidates([]);
      setIsLoading(false);
    }
    setTrigger(nextTrigger);
  }

  function selectCandidate(candidate: MentionCandidate) {
    if (!trigger || mentions.length >= 20) return;
    const displayName = normalizeMentionDisplayName(candidate.displayName);
    if (!displayName) return;
    const label = `@${displayName}`;
    const nextValue = `${value.slice(0, trigger.start)}${label} ${value.slice(trigger.end)}`;
    const remapped = remapMentions(value, nextValue, mentions).filter(
      (mention) => mention.start !== trigger.start,
    );
    const nextMentions = [
      ...remapped,
      {
        end: trigger.start + label.length,
        label,
        membershipId: candidate.membershipId,
        start: trigger.start,
      },
    ].sort((left, right) => left.start - right.start);
    const cursor = trigger.start + label.length + 1;

    onChange(nextValue);
    onMentionsChange(nextMentions);
    setCandidates([]);
    setTrigger(null);
    focusTextarea(id, cursor);
  }

  return (
    <div className="relative">
      <Textarea
        aria-activedescendant={
          trigger && visibleCandidates.length
            ? `${listId}-${visibleCandidates[activeIndex]?.membershipId}`
            : undefined
        }
        aria-autocomplete="list"
        aria-controls={trigger ? listId : undefined}
        aria-describedby={describedBy}
        aria-expanded={Boolean(trigger)}
        aria-haspopup="listbox"
        aria-invalid={invalid}
        id={id}
        maxLength={maxLength}
        name={name}
        onBlur={() => {
          setTrigger(null);
          setCandidates([]);
        }}
        onChange={(event) => {
          const nextValue = event.target.value;
          const nextMentions = remapMentions(value, nextValue, mentions);
          onChange(nextValue);
          onMentionsChange(nextMentions);
          if (
            typeof InputEvent !== "undefined" &&
            event.nativeEvent instanceof InputEvent &&
            event.nativeEvent.isComposing
          ) {
            setTrigger(null);
            setCandidates([]);
            return;
          }
          updateTrigger(nextValue, event.target.selectionStart, nextMentions);
        }}
        onClick={(event) => {
          updateTrigger(value, event.currentTarget.selectionStart, mentions);
        }}
        onCompositionEnd={(event) => {
          const nextValue = event.currentTarget.value;
          const nextMentions = remapMentions(value, nextValue, mentions);
          updateTrigger(nextValue, event.currentTarget.selectionStart, nextMentions);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            if (!submitDisabled) event.currentTarget.form?.requestSubmit();
            return;
          }
          if (!trigger) return;
          if (event.key === "Escape") {
            event.preventDefault();
            setTrigger(null);
            setCandidates([]);
            return;
          }
          if (event.key === "ArrowDown" && visibleCandidates.length) {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % visibleCandidates.length);
            return;
          }
          if (event.key === "ArrowUp" && visibleCandidates.length) {
            event.preventDefault();
            setActiveIndex(
              (current) => (current - 1 + visibleCandidates.length) % visibleCandidates.length,
            );
            return;
          }
          if (
            (event.key === "Enter" || event.key === "Tab") &&
            visibleCandidates[activeIndex]
          ) {
            event.preventDefault();
            selectCandidate(visibleCandidates[activeIndex]);
          }
        }}
        onKeyUp={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(event.key)) {
            return;
          }
          updateTrigger(value, event.currentTarget.selectionStart, mentions);
        }}
        placeholder={placeholder}
        required={required}
        role="combobox"
        rows={rows}
        value={value}
      />

      <span aria-live="polite" className="sr-only">
        {isLoading
          ? "Loading mention candidates."
          : trigger && visibleCandidates.length
            ? `${visibleCandidates.length} mention candidates available.`
            : trigger
              ? requestError || "No matching members."
              : ""}
      </span>

      {trigger ? (
        <div
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] shadow-[0_18px_45px_rgba(34,27,68,0.2)]"
          id={listId}
          role="listbox"
        >
          {isLoading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--ink-soft)]">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Loading members…
            </div>
          ) : visibleCandidates.length ? (
            visibleCandidates.map((candidate, index) => (
              <button
                aria-selected={index === activeIndex}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--accent-soft)] aria-selected:bg-[var(--accent-soft)]"
                id={`${listId}-${candidate.membershipId}`}
                key={candidate.membershipId}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectCandidate(candidate)}
                role="option"
                type="button"
              >
                <Avatar
                  className="size-8"
                  name={candidate.displayName}
                  src={candidate.photo}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                    {candidate.displayName}
                  </span>
                  {candidate.headline ? (
                    <span className="block truncate text-xs text-[var(--ink-soft)]">
                      {candidate.headline}
                    </span>
                  ) : null}
                </span>
                {candidate.isFollowing ? (
                  <span className="text-xs font-semibold text-[var(--accent)]">Following</span>
                ) : null}
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-sm text-[var(--ink-soft)]">
              {mentions.length >= 20
                ? "You can add up to 20 mentions."
                : requestError || "No matching members."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

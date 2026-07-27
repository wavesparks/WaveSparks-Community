import type { ReactNode } from "react";

import {
  tokenizePostContent,
  validateMentionRanges,
} from "@/lib/post-content";
import type { RichTextMention } from "@/lib/domain";
import { cn } from "@/lib/utils";

export type { RichTextMention } from "@/lib/domain";

interface RichTextBodyProps {
  body: string;
  mentions?: readonly RichTextMention[];
  memberHref?: (membershipId: string) => string | undefined;
  className?: string;
}

const externalLinkRel = "noopener noreferrer nofollow ugc";

function isSafeInternalHref(value: string | undefined): value is string {
  return Boolean(
    value &&
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !/[\u0000-\u001f\u007f]/u.test(value),
  );
}

function validMentionsForRendering(
  body: string,
  mentions: readonly RichTextMention[],
) {
  const candidates = mentions
    .slice(0, 20)
    .filter((mention) => {
      const result = validateMentionRanges(body, [
        {
          membershipId: mention.membershipId,
          label: mention.label,
          start: mention.start,
          end: mention.end,
        },
      ]);
      return result.success;
    })
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const accepted: RichTextMention[] = [];
  let previousEnd = -1;
  for (const mention of candidates) {
    if (mention.start < previousEnd) continue;
    accepted.push(mention);
    previousEnd = mention.end;
  }
  return accepted;
}

function renderLinkifiedText(
  text: string,
  absoluteOffset: number,
  keyPrefix: string,
): ReactNode[] {
  return tokenizePostContent(text).map((token) => {
    const key = `${keyPrefix}-${absoluteOffset + token.start}-${absoluteOffset + token.end}`;
    if (token.kind === "text") return <span key={key}>{token.text}</span>;

    return (
      <a
        className="font-medium text-[var(--accent)] underline decoration-[color-mix(in_srgb,var(--accent)_38%,transparent)] underline-offset-2 hover:decoration-current"
        href={token.href}
        key={key}
        rel={externalLinkRel}
        target="_blank"
      >
        {token.text}
      </a>
    );
  });
}

export function RichTextBody({
  body,
  mentions = [],
  memberHref,
  className,
}: RichTextBodyProps) {
  const nodes: ReactNode[] = [];
  const validMentions = validMentionsForRendering(body, mentions);
  let cursor = 0;

  for (const mention of validMentions) {
    if (mention.start > cursor) {
      nodes.push(
        ...renderLinkifiedText(
          body.slice(cursor, mention.start),
          cursor,
          "text",
        ),
      );
    }

    let resolvedHref = mention.href;
    if (!resolvedHref && memberHref) {
      try {
        resolvedHref = memberHref(mention.membershipId);
      } catch {
        resolvedHref = undefined;
      }
    }

    if (isSafeInternalHref(resolvedHref)) {
      nodes.push(
        <a
          className="font-semibold text-[var(--accent)] hover:underline"
          href={resolvedHref}
          key={`mention-${mention.membershipId}-${mention.start}-${mention.end}`}
        >
          {mention.label}
        </a>,
      );
    } else {
      nodes.push(
        <span key={`mention-text-${mention.membershipId}-${mention.start}-${mention.end}`}>
          {mention.label}
        </span>,
      );
    }

    cursor = mention.end;
  }

  if (cursor < body.length || nodes.length === 0) {
    nodes.push(...renderLinkifiedText(body.slice(cursor), cursor, "tail"));
  }

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {nodes}
    </span>
  );
}

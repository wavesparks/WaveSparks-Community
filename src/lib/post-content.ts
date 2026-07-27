import { z } from "zod";

export const POST_TITLE_MAX_LENGTH = 160;
export const POST_BODY_MAX_LENGTH = 10_000;
export const COMMENT_BODY_MAX_LENGTH = 2_000;
export const POST_IMAGE_MAX_COUNT = 4;
export const POST_IMAGE_ALT_MAX_LENGTH = 300;
export const MENTION_MAX_UNIQUE_MEMBERS = 10;
export const MENTION_MAX_RANGE_COUNT = 20;
const MENTION_DISPLAY_NAME_MAX_LENGTH = POST_TITLE_MAX_LENGTH - 1;

const postTypes = [
  "general_update",
  "ask",
  "opportunity",
  "looking_for_cofounder",
  "looking_for_mentor",
  "resource",
  "announcement",
] as const;

export const postTypeSchema = z.enum(postTypes);

export const mentionRangeSchema = z
  .object({
    membershipId: z.string().trim().min(1).max(128),
    label: z.string().min(1).max(POST_TITLE_MAX_LENGTH),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  })
  .strict();

export type MentionRange = z.infer<typeof mentionRangeSchema>;

export function normalizeMentionDisplayName(value: string) {
  const normalized = value.trim().replace(/\s+/gu, " ");
  let truncated = normalized.slice(0, MENTION_DISPLAY_NAME_MAX_LENGTH);
  const finalCodeUnit = truncated.charCodeAt(truncated.length - 1);
  if (finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff) {
    truncated = truncated.slice(0, -1);
  }
  return truncated;
}

export function mentionDisplayNameForProfile(profile: {
  displayNamePreference: string;
  fullName: string;
  preferredName: string;
}) {
  if (profile.displayNamePreference === "first_name_last_initial") {
    const [firstName = "", lastName] = profile.fullName.trim().split(/\s+/u);
    const lastInitial = lastName ? Array.from(lastName)[0] : undefined;
    return normalizeMentionDisplayName(
      lastInitial ? `${firstName} ${lastInitial}.` : firstName,
    );
  }
  return normalizeMentionDisplayName(profile.preferredName || profile.fullName);
}

export function mentionLabelForProfile(profile: {
  displayNamePreference: string;
  fullName: string;
  preferredName: string;
}) {
  const displayName = mentionDisplayNameForProfile(profile);
  return displayName ? `@${displayName}` : "";
}

export const postImageAltSchema = z.string().max(POST_IMAGE_ALT_MAX_LENGTH);
const resourceIdSchema = z.string().trim().min(1).max(128);

export const postImageReferenceSchema = z
  .object({
    id: resourceIdSchema,
    alt: postImageAltSchema.default(""),
    position: z.number().int().min(0).max(POST_IMAGE_MAX_COUNT - 1),
  })
  .strict();

export type PostImageReference = z.infer<typeof postImageReferenceSchema>;

interface MentionRangeIssue {
  index?: number;
  message: string;
}

function isUtf16Boundary(text: string, index: number) {
  if (index <= 0 || index >= text.length) return true;

  const previous = text.charCodeAt(index - 1);
  const current = text.charCodeAt(index);
  const splitsSurrogatePair =
    previous >= 0xd800 &&
    previous <= 0xdbff &&
    current >= 0xdc00 &&
    current <= 0xdfff;

  return !splitsSurrogatePair;
}

function collectMentionRangeIssues(
  text: string,
  mentions: MentionRange[],
): MentionRangeIssue[] {
  const issues: MentionRangeIssue[] = [];
  const uniqueMembershipIds = new Set(
    mentions.map((mention) => mention.membershipId),
  );

  if (uniqueMembershipIds.size > MENTION_MAX_UNIQUE_MEMBERS) {
    issues.push({
      message: `Mention no more than ${MENTION_MAX_UNIQUE_MEMBERS} different members.`,
    });
  }

  const sortedMentions = mentions
    .map((mention, index) => ({ mention, index }))
    .sort(
      (left, right) =>
        left.mention.start - right.mention.start ||
        left.mention.end - right.mention.end,
    );

  let previousEnd = -1;
  for (const { mention, index } of sortedMentions) {
    if (mention.end <= mention.start) {
      issues.push({ index, message: "Mention ranges must have a positive length." });
      continue;
    }

    if (mention.end > text.length) {
      issues.push({ index, message: "Mention range is outside the submitted text." });
      continue;
    }

    if (
      !isUtf16Boundary(text, mention.start) ||
      !isUtf16Boundary(text, mention.end)
    ) {
      issues.push({ index, message: "Mention range splits a Unicode character." });
      continue;
    }

    if (!mention.label.startsWith("@")) {
      issues.push({ index, message: "Mention labels must start with @." });
    }

    if (text.slice(mention.start, mention.end) !== mention.label) {
      issues.push({ index, message: "Mention label does not match the submitted text." });
    }

    if (mention.start < previousEnd) {
      issues.push({ index, message: "Mention ranges cannot overlap." });
    }
    previousEnd = Math.max(previousEnd, mention.end);
  }

  return issues;
}

function addMentionRangeIssues(
  text: string,
  mentions: MentionRange[],
  context: z.RefinementCtx,
) {
  for (const issue of collectMentionRangeIssues(text, mentions)) {
    context.addIssue({
      code: "custom",
      message: issue.message,
      path: issue.index === undefined ? ["mentions"] : ["mentions", issue.index],
    });
  }
}

export const postSubmissionSchema = z
  .object({
    type: postTypeSchema,
    title: z.string().max(POST_TITLE_MAX_LENGTH).default(""),
    body: z.string().max(POST_BODY_MAX_LENGTH).default(""),
    imageIds: z.array(resourceIdSchema).max(POST_IMAGE_MAX_COUNT).default([]),
    images: z.array(postImageReferenceSchema).max(POST_IMAGE_MAX_COUNT).default([]),
    linkPreviewId: resourceIdSchema.nullish(),
    mentions: z.array(mentionRangeSchema).max(MENTION_MAX_RANGE_COUNT).default([]),
  })
  .superRefine((value, context) => {
    const attachedImageIds = [
      ...value.imageIds,
      ...value.images.map((image) => image.id),
    ];
    if (value.type !== "general_update" && !value.title.trim()) {
      context.addIssue({
        code: "custom",
        message: "Add a title for this type of post.",
        path: ["title"],
      });
    }

    if (!value.body.trim() && attachedImageIds.length === 0 && !value.linkPreviewId) {
      context.addIssue({
        code: "custom",
        message: "Add some text, a link, or an image before posting.",
        path: ["body"],
      });
    }

    if (attachedImageIds.length > POST_IMAGE_MAX_COUNT) {
      context.addIssue({
        code: "custom",
        message: `Attach no more than ${POST_IMAGE_MAX_COUNT} images.`,
        path: ["images"],
      });
    }

    if (new Set(attachedImageIds).size !== attachedImageIds.length) {
      context.addIssue({
        code: "custom",
        message: "The same image cannot be attached more than once.",
        path: ["imageIds"],
      });
    }

    if (new Set(value.images.map((image) => image.position)).size !== value.images.length) {
      context.addIssue({
        code: "custom",
        message: "Each image must have a unique position.",
        path: ["images"],
      });
    }

    addMentionRangeIssues(value.body, value.mentions, context);
  });

export type PostSubmission = z.infer<typeof postSubmissionSchema>;

export const commentSubmissionSchema = z
  .object({
    body: z.string().max(COMMENT_BODY_MAX_LENGTH),
    mentions: z.array(mentionRangeSchema).max(MENTION_MAX_RANGE_COUNT).default([]),
  })
  .superRefine((value, context) => {
    if (!value.body.trim()) {
      context.addIssue({
        code: "custom",
        message: "Write a comment before posting.",
        path: ["body"],
      });
    }

    addMentionRangeIssues(value.body, value.mentions, context);
  });

export type CommentSubmission = z.infer<typeof commentSubmissionSchema>;

export type MentionRangeValidationResult =
  | { success: true; mentions: MentionRange[] }
  | { success: false; issues: string[] };

export function validateMentionRanges(
  text: string,
  input: unknown,
): MentionRangeValidationResult {
  const parsed = z
    .array(mentionRangeSchema)
    .max(MENTION_MAX_RANGE_COUNT)
    .safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => issue.message),
    };
  }

  const issues = collectMentionRangeIssues(text, parsed.data);
  if (issues.length > 0) {
    return { success: false, issues: issues.map((issue) => issue.message) };
  }

  return {
    success: true,
    mentions: [...parsed.data].sort(
      (left, right) => left.start - right.start || left.end - right.end,
    ),
  };
}

export interface SafeHttpUrlMatch {
  text: string;
  href: string;
  start: number;
  end: number;
}

export type PostContentToken =
  | { kind: "text"; text: string; start: number; end: number }
  | ({ kind: "link" } & SafeHttpUrlMatch);

const linkCandidatePattern = /\b(?:https?:\/\/|www\.)[^\s<>\u0000-\u001f]+/giu;
const trailingPunctuation = new Set([".", ",", "!", "?", ";", ":", "'", '"']);
const closingPairs = {
  ")": "(",
  "]": "[",
  "}": "{",
} as const;

function countCharacter(value: string, character: string) {
  let count = 0;
  for (const candidate of value) {
    if (candidate === character) count += 1;
  }
  return count;
}

function trimTrailingUrlPunctuation(value: string) {
  let trimmed = value;

  while (trimmed) {
    const last = trimmed.at(-1)!;
    if (trailingPunctuation.has(last)) {
      trimmed = trimmed.slice(0, -1);
      continue;
    }

    if (last in closingPairs) {
      const opening = closingPairs[last as keyof typeof closingPairs];
      if (countCharacter(trimmed, last) > countCharacter(trimmed, opening)) {
        trimmed = trimmed.slice(0, -1);
        continue;
      }
    }

    break;
  }

  return trimmed;
}

export function normalizeSafeHttpUrl(value: string) {
  const candidate = trimTrailingUrlPunctuation(value.trim());
  if (!candidate) return undefined;

  const withProtocol = /^www\./iu.test(candidate)
    ? `https://${candidate}`
    : candidate;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (!url.hostname || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function findSafeHttpUrls(text: string): SafeHttpUrlMatch[] {
  const matches: SafeHttpUrlMatch[] = [];

  for (const match of text.matchAll(linkCandidatePattern)) {
    const rawText = match[0];
    const linkedText = trimTrailingUrlPunctuation(rawText);
    const start = match.index;
    const href = normalizeSafeHttpUrl(linkedText);
    if (!href || !linkedText) continue;

    matches.push({
      text: linkedText,
      href,
      start,
      end: start + linkedText.length,
    });
  }

  return matches;
}

export function extractFirstSafeHttpUrl(text: string) {
  return findSafeHttpUrls(text)[0];
}

export function extractFirstExternalSafeHttpUrl(text: string, appUrl: string) {
  let appOrigin: string | undefined;
  try {
    appOrigin = new URL(appUrl).origin;
  } catch {
    appOrigin = undefined;
  }
  return findSafeHttpUrls(text).find((match) => {
    try {
      return !appOrigin || new URL(match.href).origin !== appOrigin;
    } catch {
      return false;
    }
  });
}

export function tokenizePostContent(text: string): PostContentToken[] {
  const tokens: PostContentToken[] = [];
  let cursor = 0;

  for (const match of findSafeHttpUrls(text)) {
    if (match.start > cursor) {
      tokens.push({
        kind: "text",
        text: text.slice(cursor, match.start),
        start: cursor,
        end: match.start,
      });
    }

    tokens.push({ kind: "link", ...match });
    cursor = match.end;
  }

  if (cursor < text.length || tokens.length === 0) {
    tokens.push({
      kind: "text",
      text: text.slice(cursor),
      start: cursor,
      end: text.length,
    });
  }

  return tokens;
}

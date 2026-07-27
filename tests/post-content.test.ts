import { describe, expect, it } from "vitest";

import {
  COMMENT_BODY_MAX_LENGTH,
  MENTION_MAX_UNIQUE_MEMBERS,
  POST_BODY_MAX_LENGTH,
  POST_IMAGE_MAX_COUNT,
  POST_IMAGE_ALT_MAX_LENGTH,
  POST_TITLE_MAX_LENGTH,
  commentSubmissionSchema,
  extractFirstSafeHttpUrl,
  findSafeHttpUrls,
  mentionLabelForProfile,
  normalizeMentionDisplayName,
  normalizeSafeHttpUrl,
  postSubmissionSchema,
  tokenizePostContent,
  validateMentionRanges,
} from "@/lib/post-content";

describe("post and comment submission validation", () => {
  it("allows an untitled General Update while requiring titles for other post types", () => {
    expect(
      postSubmissionSchema.safeParse({
        type: "general_update",
        title: "",
        body: "A lightweight update",
      }).success,
    ).toBe(true);
    expect(
      postSubmissionSchema.safeParse({
        type: "ask",
        title: "   ",
        body: "Could someone help?",
      }).success,
    ).toBe(false);
  });

  it("requires post content but accepts an image-only post", () => {
    expect(
      postSubmissionSchema.safeParse({
        type: "general_update",
        body: " \n ",
      }).success,
    ).toBe(false);
    expect(
      postSubmissionSchema.safeParse({
        type: "general_update",
        body: "",
        imageIds: ["pimg_1"],
      }).success,
    ).toBe(true);
  });

  it("enforces text and attachment limits", () => {
    expect(
      postSubmissionSchema.safeParse({
        type: "general_update",
        title: "x".repeat(POST_TITLE_MAX_LENGTH + 1),
        body: "body",
      }).success,
    ).toBe(false);
    expect(
      postSubmissionSchema.safeParse({
        type: "general_update",
        body: "x".repeat(POST_BODY_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      postSubmissionSchema.safeParse({
        type: "general_update",
        body: "body",
        imageIds: Array.from(
          { length: POST_IMAGE_MAX_COUNT + 1 },
          (_, index) => `pimg_${index}`,
        ),
      }).success,
    ).toBe(false);
    expect(
      commentSubmissionSchema.safeParse({
        body: "x".repeat(COMMENT_BODY_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      postSubmissionSchema.safeParse({
        type: "general_update",
        body: "",
        images: [
          {
            id: "pimg_1",
            alt: "x".repeat(POST_IMAGE_ALT_MAX_LENGTH + 1),
            position: 0,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty comment", () => {
    expect(commentSubmissionSchema.safeParse({ body: " \n " }).success).toBe(false);
  });
});

describe("safe URL detection", () => {
  it("links only HTTP(S) and www URLs while preserving punctuation", () => {
    const body =
      "Docs: https://example.com/a_(b). Then www.wavesparks.co/help! Not javascript:alert(1).";
    const urls = findSafeHttpUrls(body);

    expect(urls).toHaveLength(2);
    expect(urls[0]).toMatchObject({
      text: "https://example.com/a_(b)",
      href: "https://example.com/a_(b)",
    });
    expect(urls[1]).toMatchObject({
      text: "www.wavesparks.co/help",
      href: "https://www.wavesparks.co/help",
    });
    expect(extractFirstSafeHttpUrl(body)).toEqual(urls[0]);
  });

  it("rejects dangerous protocols and credential-bearing URLs", () => {
    expect(normalizeSafeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeSafeHttpUrl("ftp://example.com/file")).toBeUndefined();
    expect(normalizeSafeHttpUrl("https://user:secret@example.com")).toBeUndefined();
    expect(findSafeHttpUrls("javascript:alert(1) ftp://example.com")).toEqual([]);
  });

  it("keeps newlines and non-link text as ordinary tokens", () => {
    const body = "First line\nhttps://example.com\nLast line";
    const tokens = tokenizePostContent(body);

    expect(tokens.map((token) => token.kind)).toEqual(["text", "link", "text"]);
    expect(tokens.map((token) => token.text).join("")).toBe(body);
  });
});

describe("UTF-16 mention ranges", () => {
  it("builds the server-authoritative label without splitting UTF-16 characters", () => {
    expect(
      mentionLabelForProfile({
        displayNamePreference: "full_name",
        fullName: "Fallback",
        preferredName: `  ${"a".repeat(158)}😀 trailing  `,
      }),
    ).toBe(`@${"a".repeat(158)}`);
    expect(normalizeMentionDisplayName("  Rhea   Santos  ")).toBe("Rhea Santos");
    expect(
      mentionLabelForProfile({
        displayNamePreference: "first_name_last_initial",
        fullName: "Kai 😀son",
        preferredName: "Kai",
      }),
    ).toBe("@Kai 😀.");
  });

  it("accepts selected mention labels using JavaScript UTF-16 positions", () => {
    const body = "👋 @Zoë, welcome";
    const start = body.indexOf("@Zoë");
    const result = validateMentionRanges(body, [
      { membershipId: "mem_zoe", label: "@Zoë", start, end: start + 4 },
    ]);

    expect(start).toBe(3);
    expect(result).toEqual({
      success: true,
      mentions: [
        { membershipId: "mem_zoe", label: "@Zoë", start: 3, end: 7 },
      ],
    });
  });

  it("rejects stale labels and overlapping ranges", () => {
    const body = "@Alice and @Bob";
    const result = validateMentionRanges(body, [
      { membershipId: "mem_a", label: "@Alice", start: 0, end: 6 },
      { membershipId: "mem_b", label: "@Bob", start: 5, end: 9 },
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toContain("Mention ranges cannot overlap.");
    }
  });

  it("allows repeat mentions but caps unique mentioned members", () => {
    const labels = Array.from(
      { length: MENTION_MAX_UNIQUE_MEMBERS + 1 },
      (_, index) => `@Member${index}`,
    );
    const body = labels.join(" ");
    let cursor = 0;
    const mentions = labels.map((label, index) => {
      const mention = {
        membershipId: `mem_${index}`,
        label,
        start: cursor,
        end: cursor + label.length,
      };
      cursor += label.length + 1;
      return mention;
    });

    expect(validateMentionRanges(body, mentions).success).toBe(false);
    expect(
      validateMentionRanges("@Alice and @Alice", [
        { membershipId: "mem_a", label: "@Alice", start: 0, end: 6 },
        { membershipId: "mem_a", label: "@Alice", start: 11, end: 17 },
      ]).success,
    ).toBe(true);
  });
});

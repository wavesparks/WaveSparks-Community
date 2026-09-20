import { beforeEach, describe, expect, it } from "vitest";

import { seedOrganization } from "@/data/seed-data";
import type { Notification, PostImage, PostLinkPreview, Space } from "@/lib/domain";
import {
  addNotification,
  createEventSpace,
  createRichCommentInSpace,
  createRichPostInSpace,
  createStagedPostImage,
  createStagedPostLinkPreview,
  getPostById,
  getPostLinkPreviewById,
  getStore,
  grantSpaceMembership,
  listCommentMentionsForCommentIds,
  listNotificationsForMembershipInSpace,
  listNotificationsForMembershipWithSpaceAccess,
  listPostImagesForPostIds,
  listPostLinkPreviewsForPostIds,
  listPostMentionsForPostIds,
  resetStore,
  setSpaceMembershipAccessStatus,
  updateCommentStatus,
  updatePostImageModeration,
  updatePostImageUpload,
  updatePostLinkPreviewModeration,
  updatePostContent,
  updatePostModeration,
} from "@/server/store";

const AUTHOR_ID = "mem_jules";
const TARGET_ID = "mem_rhea";
const OTHER_ID = "mem_kai";

function now() {
  return new Date().toISOString();
}

async function createActiveSpace(name: string) {
  const space = await createEventSpace({
    orgId: seedOrganization.id,
    name,
    lifecycle: "active",
  });
  await grant(space, AUTHOR_ID);
  return space;
}

async function grant(space: Space, membershipId: string) {
  await grantSpaceMembership({
    orgId: seedOrganization.id,
    spaceId: space.id,
    membershipId,
    joinedVia: "direct",
  });
}

async function stageReadyImage(input: {
  id: string;
  space: Space;
  uploaderMembershipId?: string;
  position?: number;
}) {
  const timestamp = now();
  const image: PostImage = {
    id: input.id,
    orgId: seedOrganization.id,
    spaceId: input.space.id,
    uploaderMembershipId: input.uploaderMembershipId ?? AUTHOR_ID,
    blobPathname: `post-images/${input.space.id}/${input.id}.webp`,
    contentType: "image/webp",
    sizeBytes: 512,
    position: input.position ?? 0,
    uploadStatus: "staged",
    moderationStatus: "visible",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await createStagedPostImage(image);
  const ready = await updatePostImageUpload(image.id, {
    uploadStatus: "ready",
    width: 640,
    height: 480,
  });
  if (!ready) throw new Error("Test image failed to become ready.");
  return ready;
}

async function stageReadyPreview(input: {
  id: string;
  space: Space;
  uploaderMembershipId?: string;
}) {
  const timestamp = now();
  const preview: PostLinkPreview = {
    id: input.id,
    orgId: seedOrganization.id,
    spaceId: input.space.id,
    uploaderMembershipId: input.uploaderMembershipId ?? AUTHOR_ID,
    originalUrl: "https://example.com/story",
    title: "Example story",
    siteName: "Example",
    fetchStatus: "ready",
    moderationStatus: "visible",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return createStagedPostLinkPreview(preview);
}

function postInput(space: Space, body = "A post body") {
  return {
    orgId: seedOrganization.id,
    spaceId: space.id,
    authorMembershipId: AUTHOR_ID,
    type: "general_update" as const,
    title: "",
    body,
    tags: [],
    relatedStartupName: "",
    relatedRolesNeeded: [],
    status: "active" as const,
    featured: false,
    hidden: false,
    commentsLocked: false,
  };
}

function mentionNotification(input: {
  id: string;
  postId: string;
  space: Space;
  commentId?: string;
}): Notification {
  return {
    id: input.id,
    orgId: seedOrganization.id,
    spaceId: input.space.id,
    membershipId: TARGET_ID,
    type: input.commentId ? "comment_mentioned" : "post_mentioned",
    title: "You were mentioned",
    body: "Open the conversation.",
    link: `/org/${seedOrganization.slug}/s/${input.space.slug}/posts/${input.postId}${
      input.commentId ? `#comment-${input.commentId}` : ""
    }`,
    sourcePostId: input.postId,
    sourceCommentId: input.commentId,
    createdAt: now(),
  };
}

describe("rich content store integrity", () => {
  beforeEach(() => {
    resetStore();
  });

  it("rejects cross-owner attachment claims without partially creating a post", async () => {
    const space = await createActiveSpace("Attachment ownership");
    await Promise.all([grant(space, TARGET_ID), grant(space, OTHER_ID)]);
    const validImage = await stageReadyImage({ id: "img_valid_owner", space });
    const foreignImage = await stageReadyImage({
      id: "img_foreign_owner",
      space,
      uploaderMembershipId: OTHER_ID,
      position: 1,
    });
    const preview = await stageReadyPreview({ id: "preview_valid_owner", space });
    const body = "Hello @Rhea";
    const before = getStore();
    const postCount = before.posts.length;
    const mentionCount = before.postMentions.length;

    await expect(
      createRichPostInSpace(postInput(space, body), {
        images: [
          { id: validImage.id, alt: "Valid", position: 0 },
          { id: foreignImage.id, alt: "Foreign", position: 1 },
        ],
        linkPreviewId: preview.id,
        mentions: [{ membershipId: TARGET_ID, label: "@Rhea", start: 6, end: 11 }],
      }),
    ).rejects.toThrow("attached images are unavailable");

    expect(getStore().posts).toHaveLength(postCount);
    expect(getStore().postMentions).toHaveLength(mentionCount);
    expect(validImage.postId).toBeUndefined();
    expect(foreignImage.postId).toBeUndefined();
    expect(preview.postId).toBeUndefined();
  });

  it("rejects cross-Space claims and keeps every staged resource unclaimed", async () => {
    const sourceSpace = await createActiveSpace("Source attachments");
    const destinationSpace = await createActiveSpace("Destination post");
    const image = await stageReadyImage({ id: "img_wrong_space", space: sourceSpace });
    const preview = await stageReadyPreview({ id: "preview_wrong_space", space: sourceSpace });
    const postCount = getStore().posts.length;

    await expect(
      createRichPostInSpace(postInput(destinationSpace), {
        images: [{ id: image.id, position: 0 }],
        linkPreviewId: preview.id,
        mentions: [],
      }),
    ).rejects.toThrow("attached images are unavailable");

    expect(getStore().posts).toHaveLength(postCount);
    expect(image.postId).toBeUndefined();
    expect(preview.postId).toBeUndefined();
  });

  it("rejects a link preview staged by another member without creating a post", async () => {
    const space = await createActiveSpace("Preview ownership");
    await grant(space, OTHER_ID);
    const preview = await stageReadyPreview({
      id: "preview_foreign_owner",
      space,
      uploaderMembershipId: OTHER_ID,
    });
    const postCount = getStore().posts.length;

    await expect(
      createRichPostInSpace(postInput(space, "https://example.com/story"), {
        images: [],
        linkPreviewId: preview.id,
        mentions: [],
      }),
    ).rejects.toThrow("link preview is unavailable");
    expect(getStore().posts).toHaveLength(postCount);
    expect(preview.postId).toBeUndefined();
  });

  it("claims images, preview, and mention ranges together on success", async () => {
    const space = await createActiveSpace("Atomic rich post");
    await grant(space, TARGET_ID);
    const secondImage = await stageReadyImage({
      id: "img_second",
      space,
      position: 1,
    });
    const firstImage = await stageReadyImage({ id: "img_first", space });
    const preview = await stageReadyPreview({ id: "preview_claimed", space });
    const body = "👋 @Rhea see https://example.com/story";

    const post = await createRichPostInSpace(postInput(space, body), {
      images: [
        { id: firstImage.id, alt: " First image ", position: 0 },
        { id: secondImage.id, alt: "Second image", position: 1 },
      ],
      linkPreviewId: preview.id,
      mentions: [{ membershipId: TARGET_ID, label: "@Rhea", start: 3, end: 8 }],
    });

    await expect(listPostImagesForPostIds([post.id])).resolves.toMatchObject([
      { id: firstImage.id, postId: post.id, alt: "First image", position: 0 },
      { id: secondImage.id, postId: post.id, alt: "Second image", position: 1 },
    ]);
    await expect(listPostLinkPreviewsForPostIds([post.id])).resolves.toMatchObject([
      { id: preview.id, postId: post.id },
    ]);
    await expect(listPostMentionsForPostIds([post.id])).resolves.toMatchObject([
      {
        postId: post.id,
        mentionedMembershipId: TARGET_ID,
        label: "@Rhea",
        start: 3,
        end: 8,
      },
    ]);
  });

  it("rolls back a rich comment when a mention target lacks Space access", async () => {
    const space = await createActiveSpace("Atomic rich comment");
    const post = await createRichPostInSpace(postInput(space), {
      images: [],
      mentions: [],
    });
    const commentCount = getStore().comments.length;
    const mentionCount = getStore().commentMentions.length;

    await expect(
      createRichCommentInSpace(
        space.id,
        { postId: post.id, authorMembershipId: AUTHOR_ID, body: "Hi @Rhea" },
        [{ membershipId: TARGET_ID, label: "@Rhea", start: 3, end: 8 }],
      ),
    ).rejects.toThrow("active access");
    expect(getStore().comments).toHaveLength(commentCount);
    expect(getStore().commentMentions).toHaveLength(mentionCount);

    await grant(space, TARGET_ID);
    const comment = await createRichCommentInSpace(
      space.id,
      { postId: post.id, authorMembershipId: AUTHOR_ID, body: "Hi @Rhea" },
      [{ membershipId: TARGET_ID, label: "@Rhea", start: 3, end: 8 }],
    );
    await expect(listCommentMentionsForCommentIds([comment.id])).resolves.toMatchObject([
      {
        postId: post.id,
        commentId: comment.id,
        mentionedMembershipId: TARGET_ID,
      },
    ]);
  });

  it("requires mention targets to retain a completed profile", async () => {
    const space = await createActiveSpace("Completed mention profile");
    await grant(space, TARGET_ID);
    const targetProfile = getStore().profiles.find(
      (profile) => profile.membershipId === TARGET_ID,
    );
    if (!targetProfile) throw new Error("Missing target profile fixture.");
    targetProfile.onboardingComplete = false;
    const postCount = getStore().posts.length;

    await expect(
      createRichPostInSpace(postInput(space, "Hello @Rhea"), {
        images: [],
        mentions: [{ membershipId: TARGET_ID, label: "@Rhea", start: 6, end: 11 }],
      }),
    ).rejects.toThrow(/mention|profile/i);
    expect(getStore().posts).toHaveLength(postCount);
  });

  it("rejects a forged label that does not match the selected member", async () => {
    const space = await createActiveSpace("Mention label integrity");
    await grant(space, TARGET_ID);
    const body = "Hello @SomeoneElse";
    const postCount = getStore().posts.length;

    await expect(
      createRichPostInSpace(postInput(space, body), {
        images: [],
        mentions: [
          {
            membershipId: TARGET_ID,
            label: "@SomeoneElse",
            start: 6,
            end: body.length,
          },
        ],
      }),
    ).rejects.toThrow("do not match the selected member");
    expect(getStore().posts).toHaveLength(postCount);
  });

  it("hides an image-only post after its last visible image is removed and never auto-restores it", async () => {
    const space = await createActiveSpace("Image moderation");
    const first = await stageReadyImage({ id: "img_moderate_first", space });
    const second = await stageReadyImage({
      id: "img_moderate_second",
      space,
      position: 1,
    });
    const post = await createRichPostInSpace(postInput(space, ""), {
      images: [
        { id: first.id, position: 0 },
        { id: second.id, position: 1 },
      ],
      mentions: [],
    });

    await expect(
      updatePostImageModeration(first.id, "removed", "mem_avery"),
    ).resolves.toMatchObject({ postHidden: false });
    expect((await getPostById(post.id))?.hidden).toBe(false);
    await expect(listPostImagesForPostIds([post.id])).resolves.toMatchObject([
      { id: second.id },
    ]);

    await expect(
      updatePostImageModeration(second.id, "removed", "mem_avery"),
    ).resolves.toMatchObject({ postHidden: true });
    expect((await getPostById(post.id))?.hidden).toBe(true);
    await expect(listPostImagesForPostIds([post.id])).resolves.toEqual([]);
    await expect(
      listPostImagesForPostIds([post.id], { includeRemoved: true }),
    ).resolves.toHaveLength(2);

    await expect(
      updatePostImageModeration(second.id, "visible", "mem_avery"),
    ).resolves.toMatchObject({ postHidden: false });
    expect((await getPostById(post.id))?.hidden).toBe(true);
  });

  it("removes and restores only the link-preview card while preserving the post body", async () => {
    const space = await createActiveSpace("Preview moderation");
    const preview = await stageReadyPreview({ id: "preview_moderated", space });
    const body = "Read https://example.com/story";
    const post = await createRichPostInSpace(postInput(space, body), {
      images: [],
      linkPreviewId: preview.id,
      mentions: [],
    });

    await updatePostLinkPreviewModeration(preview.id, "removed", "mem_avery");
    await expect(listPostLinkPreviewsForPostIds([post.id])).resolves.toEqual([]);
    expect((await getPostById(post.id))?.body).toBe(body);
    expect((await getPostById(post.id))?.hidden).toBe(false);

    await updatePostLinkPreviewModeration(preview.id, "visible", "mem_avery");
    await expect(listPostLinkPreviewsForPostIds([post.id])).resolves.toMatchObject([
      { id: preview.id, moderationStatus: "visible" },
    ]);
  });

  it("atomically edits content while preserving attachments and governance", async () => {
    const space = await createActiveSpace("Admin content integrity");
    await grant(space, TARGET_ID);
    const image = await stageReadyImage({ id: "img_admin_edit", space });
    const preview = await stageReadyPreview({ id: "preview_admin_edit", space });
    const originalBody = "Hello @Rhea https://example.com/story";
    const post = await createRichPostInSpace(
      {
        ...postInput(space, originalBody),
        status: "archived",
        featured: true,
        commentsLocked: true,
      },
      {
        images: [{ id: image.id, alt: "Original alt", position: 0 }],
        linkPreviewId: preview.id,
        mentions: [
          { membershipId: TARGET_ID, label: "@Rhea", start: 6, end: 11 },
        ],
      },
    );
    const comment = await createRichCommentInSpace(
      space.id,
      { postId: post.id, authorMembershipId: AUTHOR_ID, body: "Again @Rhea" },
      [{ membershipId: TARGET_ID, label: "@Rhea", start: 6, end: 11 }],
    );
    const postMention = mentionNotification({
      id: "ntf_admin_edit_post",
      postId: post.id,
      space,
    });
    const commentMention = mentionNotification({
      id: "ntf_admin_edit_comment",
      postId: post.id,
      commentId: comment.id,
      space,
    });
    await addNotification(postMention);
    await addNotification(commentMention);

    post.updatedAt = "2000-01-01T00:00:00.000Z";
    const originalPost = structuredClone(post);
    const originalImages = structuredClone(
      await listPostImagesForPostIds([post.id], { includeRemoved: true }),
    );
    const originalPreview = structuredClone(
      await getPostLinkPreviewById(preview.id),
    );
    const updated = await updatePostContent(
      { orgId: seedOrganization.id, spaceId: space.id, postId: post.id },
      {
        type: "opportunity",
        opportunitySource: "mentor",
        title: "Edited opportunity",
        body: "Updated copy with https://example.com/story",
        tags: ["climate", "hardware"],
        relatedStartupName: "New venture",
        relatedRolesNeeded: ["Engineer", "Designer"],
      },
    );

    expect(updated).toMatchObject({
      type: "opportunity",
      opportunitySource: "mentor",
      title: "Edited opportunity",
      body: "Updated copy with https://example.com/story",
      tags: ["climate", "hardware"],
      relatedStartupName: "New venture",
      relatedRolesNeeded: ["Engineer", "Designer"],
    });
    expect(updated).toMatchObject({
      id: originalPost.id,
      orgId: originalPost.orgId,
      spaceId: originalPost.spaceId,
      authorMembershipId: originalPost.authorMembershipId,
      visibility: originalPost.visibility,
      status: originalPost.status,
      featured: originalPost.featured,
      hidden: originalPost.hidden,
      commentsLocked: originalPost.commentsLocked,
      createdAt: originalPost.createdAt,
    });
    expect(updated?.updatedAt).not.toBe(originalPost.updatedAt);
    await expect(
      listPostImagesForPostIds([post.id], { includeRemoved: true }),
    ).resolves.toEqual(originalImages);
    await expect(getPostLinkPreviewById(preview.id)).resolves.toEqual(
      originalPreview,
    );
    await expect(listPostMentionsForPostIds([post.id])).resolves.toEqual([]);
    await expect(listCommentMentionsForCommentIds([comment.id])).resolves.toHaveLength(1);
    await expect(
      listNotificationsForMembershipInSpace(space.id, TARGET_ID),
    ).resolves.toMatchObject([{ id: commentMention.id }]);
  });

  it("keeps previews on non-body edits and deletes them when the first external URL changes", async () => {
    const space = await createActiveSpace("Admin preview edit");
    await grant(space, TARGET_ID);
    const preview = await stageReadyPreview({ id: "preview_admin_mismatch", space });
    const historicalBody = "Hello @Rhea https://different.example/page";
    const post = await createRichPostInSpace(postInput(space, historicalBody), {
      images: [],
      linkPreviewId: preview.id,
      mentions: [
        { membershipId: TARGET_ID, label: "@Rhea", start: 6, end: 11 },
      ],
    });

    await updatePostContent(
      { orgId: seedOrganization.id, spaceId: space.id, postId: post.id },
      {
        type: post.type,
        opportunitySource: post.opportunitySource,
        title: "Title-only edit",
        body: historicalBody,
        tags: post.tags,
        relatedStartupName: post.relatedStartupName,
        relatedRolesNeeded: post.relatedRolesNeeded,
      },
    );
    await expect(getPostLinkPreviewById(preview.id)).resolves.toMatchObject({
      postId: post.id,
    });
    await expect(listPostMentionsForPostIds([post.id])).resolves.toHaveLength(1);

    await updatePostContent(
      { orgId: seedOrganization.id, spaceId: space.id, postId: post.id },
      {
        type: post.type,
        opportunitySource: post.opportunitySource,
        title: post.title,
        body: "Now read https://new.example/story before https://example.com/story",
        tags: post.tags,
        relatedStartupName: post.relatedStartupName,
        relatedRolesNeeded: post.relatedRolesNeeded,
      },
    );
    await expect(getPostLinkPreviewById(preview.id)).resolves.toBeUndefined();
    await expect(listPostLinkPreviewsForPostIds([post.id])).resolves.toEqual([]);
    await expect(listPostMentionsForPostIds([post.id])).resolves.toEqual([]);
  });

  it("uses only server-owned visible images for empty-body edits and rejects wrong scopes", async () => {
    const space = await createActiveSpace("Admin image-only edit");
    const image = await stageReadyImage({ id: "img_admin_image_only", space });
    const post = await createRichPostInSpace(postInput(space, ""), {
      images: [{ id: image.id, position: 0 }],
      mentions: [],
    });
    const scope = {
      orgId: seedOrganization.id,
      spaceId: space.id,
      postId: post.id,
    };

    await expect(
      updatePostContent(scope, {
        type: "general_update",
        opportunitySource: undefined,
        title: "",
        body: "",
        tags: ["image-only"],
        relatedStartupName: "",
        relatedRolesNeeded: [],
      }),
    ).resolves.toMatchObject({ tags: ["image-only"], body: "" });

    const beforeWrongScope = structuredClone(await getPostById(post.id));
    await expect(
      updatePostContent(
        { ...scope, orgId: "org_other" },
        {
          type: "announcement",
          opportunitySource: undefined,
          title: "Forbidden",
          body: "Forbidden",
          tags: [],
          relatedStartupName: "",
          relatedRolesNeeded: [],
        },
      ),
    ).resolves.toBeNull();
    await expect(
      updatePostContent(
        { ...scope, spaceId: "spc_other" },
        {
          type: "announcement",
          opportunitySource: undefined,
          title: "Wrong Space",
          body: "Wrong Space",
          tags: [],
          relatedStartupName: "",
          relatedRolesNeeded: [],
        },
      ),
    ).resolves.toBeNull();
    await expect(getPostById(post.id)).resolves.toEqual(beforeWrongScope);

    await updatePostImageModeration(image.id, "removed", "mem_avery");
    const beforeRejectedEdit = structuredClone(await getPostById(post.id));
    await expect(
      updatePostContent(scope, {
        type: "general_update",
        opportunitySource: undefined,
        title: "Should not persist",
        body: "",
        tags: [],
        relatedStartupName: "",
        relatedRolesNeeded: [],
      }),
    ).rejects.toThrow("visible image");
    await expect(getPostById(post.id)).resolves.toEqual(beforeRejectedEdit);
  });
});

describe("mention notification integrity and visibility", () => {
  beforeEach(() => {
    resetStore();
  });

  it("rejects notifications whose recipient is not present in the stored mention ranges", async () => {
    const space = await createActiveSpace("Forged mention notification");
    await grant(space, TARGET_ID);
    const post = await createRichPostInSpace(postInput(space), {
      images: [],
      mentions: [],
    });

    await expect(
      addNotification(
        mentionNotification({ id: "ntf_forged_post_mention", postId: post.id, space }),
      ),
    ).rejects.toThrow(/mention/i);
  });

  it("rejects forged comment recipients and author self-mentions", async () => {
    const space = await createActiveSpace("Invalid mention recipients");
    await grant(space, TARGET_ID);
    const post = await createRichPostInSpace(postInput(space), {
      images: [],
      mentions: [],
    });
    const comment = await createRichCommentInSpace(
      space.id,
      { postId: post.id, authorMembershipId: AUTHOR_ID, body: "No mention here" },
      [],
    );

    await expect(
      addNotification(
        mentionNotification({
          id: "ntf_forged_comment_mention",
          postId: post.id,
          commentId: comment.id,
          space,
        }),
      ),
    ).rejects.toThrow(/mention/i);

    await expect(
      createRichPostInSpace(postInput(space, "Hello @Jules"), {
        images: [],
        mentions: [{ membershipId: AUTHOR_ID, label: "@Jules", start: 6, end: 12 }],
      }),
    ).rejects.toThrow("cannot mention yourself");
  });

  it("deduplicates each legitimate source and filters hidden or removed source content", async () => {
    const space = await createActiveSpace("Mention visibility");
    await grant(space, TARGET_ID);
    const post = await createRichPostInSpace(postInput(space, "Hello @Rhea"), {
      images: [],
      mentions: [{ membershipId: TARGET_ID, label: "@Rhea", start: 6, end: 11 }],
    });
    const comment = await createRichCommentInSpace(
      space.id,
      { postId: post.id, authorMembershipId: AUTHOR_ID, body: "Again @Rhea" },
      [{ membershipId: TARGET_ID, label: "@Rhea", start: 6, end: 11 }],
    );
    const postNotification = mentionNotification({
      id: "ntf_post_mention_one",
      postId: post.id,
      space,
    });
    const commentNotification = mentionNotification({
      id: "ntf_comment_mention_one",
      postId: post.id,
      commentId: comment.id,
      space,
    });

    await addNotification(postNotification);
    await addNotification({ ...postNotification, id: "ntf_post_mention_duplicate" });
    await addNotification(commentNotification);
    await addNotification({
      ...commentNotification,
      id: "ntf_comment_mention_duplicate",
    });
    await expect(
      listNotificationsForMembershipInSpace(space.id, TARGET_ID),
    ).resolves.toHaveLength(2);

    await updateCommentStatus(comment.id, "removed");
    await expect(
      listNotificationsForMembershipInSpace(space.id, TARGET_ID),
    ).resolves.toMatchObject([{ id: postNotification.id }]);

    await updatePostModeration(post.id, { hidden: true });
    await expect(
      listNotificationsForMembershipInSpace(space.id, TARGET_ID),
    ).resolves.toEqual([]);

    await updatePostModeration(post.id, { hidden: false });
    await updateCommentStatus(comment.id, "visible");
    await expect(
      listNotificationsForMembershipInSpace(space.id, TARGET_ID),
    ).resolves.toHaveLength(2);
  });

  it("stops exposing existing mention notifications after Space access is revoked", async () => {
    const space = await createActiveSpace("Mention access revocation");
    await grant(space, TARGET_ID);
    const post = await createRichPostInSpace(postInput(space, "Hello @Rhea"), {
      images: [],
      mentions: [{ membershipId: TARGET_ID, label: "@Rhea", start: 6, end: 11 }],
    });
    const notification = mentionNotification({
      id: "ntf_revoked_mention",
      postId: post.id,
      space,
    });
    await addNotification(notification);
    expect(
      (await listNotificationsForMembershipWithSpaceAccess(TARGET_ID, [space.id])).some(
        (candidate) => candidate.id === notification.id,
      ),
    ).toBe(true);

    await setSpaceMembershipAccessStatus({
      orgId: seedOrganization.id,
      spaceId: space.id,
      membershipId: TARGET_ID,
      accessStatus: "removed",
    });
    expect(
      (await listNotificationsForMembershipWithSpaceAccess(TARGET_ID, [space.id])).some(
        (candidate) => candidate.id === notification.id,
      ),
    ).toBe(false);
  });
});

import type { HandleUploadBody } from "@vercel/blob/client";
import { handleUpload } from "@vercel/blob/client";
import { after } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { requireSpaceAccessForAction } from "@/lib/space-auth";
import {
  expectedPostImagePathPrefix,
  POST_IMAGE_CONTENT_TYPES,
  POST_IMAGE_MAX_BYTES,
  processPostImage,
  processedPostImagePath,
  readStreamWithLimit,
} from "@/server/post-image-processing";
import {
  deletePrivateMedia,
  getPrivateMedia,
  isMemoryPostMediaStorage,
  isPostMediaStorageConfigured,
  putPrivateMedia,
} from "@/server/post-media-storage";
import {
  createStagedPostImage,
  deleteStagedPostImageRecord,
  getPostImageById,
  updatePostImageUpload,
} from "@/server/store";

export const runtime = "nodejs";

const uploadPayloadSchema = z.object({
  imageId: z.string().regex(/^pimg_[a-zA-Z0-9_-]{8,80}$/u),
  sizeBytes: z.number().int().min(1).max(POST_IMAGE_MAX_BYTES),
  contentType: z.enum(POST_IMAGE_CONTENT_TYPES),
  fileName: z.string().min(1).max(180),
});

function privateJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Cookie");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(body, { ...init, headers });
}

function statusPayload(slug: string, image: NonNullable<Awaited<ReturnType<typeof getPostImageById>>>) {
  return {
    image: {
      id: image.id,
      status: image.uploadStatus,
      error: image.uploadError,
      width: image.width,
      height: image.height,
      sizeBytes: image.sizeBytes,
      readUrl:
        image.uploadStatus === "ready"
          ? `/api/post-images/${encodeURIComponent(image.id)}`
          : undefined,
      orgSlug: slug,
    },
  };
}

async function requireOwner(slug: string, spaceId: string, imageId: string) {
  const access = await requireSpaceAccessForAction({
    slug,
    spaceId,
    requireProfile: true,
  });
  const image = await getPostImageById(imageId);
  if (
    !image ||
    image.orgId !== access.viewer.org.id ||
    image.spaceId !== spaceId ||
    image.uploaderMembershipId !== access.viewer.membership.id
  ) {
    throw new Error("Image not found.");
  }
  return { access, image };
}

async function finishUpload(input: {
  imageId: string;
  orgId: string;
  spaceId: string;
  membershipId: string;
  rawPathname: string;
}) {
  const image = await getPostImageById(input.imageId);
  if (
    !image ||
    image.postId ||
    image.orgId !== input.orgId ||
    image.spaceId !== input.spaceId ||
    image.uploaderMembershipId !== input.membershipId ||
    image.blobPathname !== input.rawPathname
  ) {
    return;
  }

  if (image.uploadStatus === "ready" || image.uploadStatus === "processing") {
    return;
  }
  const claimed = await updatePostImageUpload(
    image.id,
    {
      uploadStatus: "processing",
      uploadError: undefined,
    },
    {
      blobPathname: input.rawPathname,
      uploadStatus: "staged",
    },
  );
  if (!claimed) return;

  const processedPathname = processedPostImagePath(input);
  let storedProcessedImage = false;
  try {
    const raw = await getPrivateMedia(input.rawPathname);
    if (!raw) throw new Error("The uploaded image could not be read.");
    const bytes = await readStreamWithLimit(raw.stream, POST_IMAGE_MAX_BYTES);
    const processed = await processPostImage(bytes);
    await putPrivateMedia({
      pathname: processedPathname,
      bytes: processed.bytes,
      contentType: processed.contentType,
    });
    storedProcessedImage = true;
    const updated = await updatePostImageUpload(
      image.id,
      {
        blobPathname: processedPathname,
        contentType: processed.contentType,
        sizeBytes: processed.bytes.byteLength,
        width: processed.width,
        height: processed.height,
        uploadStatus: "ready",
        uploadError: undefined,
      },
      {
        blobPathname: input.rawPathname,
        uploadStatus: "processing",
      },
    );
    if (!updated) {
      await deletePrivateMedia(processedPathname);
      return;
    }
    await deletePrivateMedia(input.rawPathname);
  } catch (error) {
    await deletePrivateMedia(input.rawPathname).catch(() => undefined);
    if (storedProcessedImage) {
      await deletePrivateMedia(processedPathname).catch(() => undefined);
    }
    await updatePostImageUpload(
      image.id,
      {
        uploadStatus: "failed",
        uploadError:
          error instanceof Error ? error.message.slice(0, 500) : "Image processing failed.",
      },
      {
        blobPathname: input.rawPathname,
        uploadStatus: "processing",
      },
    );
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; spaceId: string }> },
) {
  const { slug, spaceId } = await context.params;
  const imageId = new URL(request.url).searchParams.get("imageId") ?? "";
  try {
    const { image } = await requireOwner(slug, spaceId, imageId);
    return privateJson(statusPayload(slug, image));
  } catch {
    return privateJson({ error: "Image not found." }, { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ slug: string; spaceId: string }> },
) {
  const { slug, spaceId } = await context.params;
  const imageId = new URL(request.url).searchParams.get("imageId") ?? "";
  try {
    const { image } = await requireOwner(slug, spaceId, imageId);
    if (image.postId) {
      return privateJson({ error: "Published images cannot be deleted." }, { status: 409 });
    }
    await deletePrivateMedia(image.blobPathname).catch(() => undefined);
    await deletePrivateMedia(
      processedPostImagePath({
        imageId: image.id,
        membershipId: image.uploaderMembershipId,
        spaceId: image.spaceId,
      }),
    ).catch(() => undefined);
    await deleteStagedPostImageRecord(image.id);
    return privateJson({ ok: true });
  } catch {
    return privateJson({ error: "Image not found." }, { status: 404 });
  }
}

async function memoryUpload(
  request: Request,
  slug: string,
  spaceId: string,
) {
  const access = await requireSpaceAccessForAction({ slug, spaceId, requireProfile: true });
  const formData = await request.formData();
  const file = formData.get("file");
  const parsed = uploadPayloadSchema.safeParse({
    imageId: formData.get("imageId"),
    sizeBytes: file instanceof File ? file.size : 0,
    contentType: file instanceof File ? file.type : "",
    fileName: file instanceof File ? file.name : "",
  });
  if (!(file instanceof File) || !parsed.success) {
    return privateJson({ error: "Choose a JPG, PNG, or WebP image up to 5 MB." }, { status: 400 });
  }
  const now = new Date().toISOString();
  const rawPathname = `${expectedPostImagePathPrefix({
    imageId: parsed.data.imageId,
    membershipId: access.viewer.membership.id,
    spaceId,
  })}raw-upload`;
  await createStagedPostImage({
    id: parsed.data.imageId,
    orgId: access.viewer.org.id,
    spaceId,
    uploaderMembershipId: access.viewer.membership.id,
    blobPathname: rawPathname,
    contentType: parsed.data.contentType,
    sizeBytes: parsed.data.sizeBytes,
    position: 0,
    uploadStatus: "staged",
    moderationStatus: "visible",
    createdAt: now,
    updatedAt: now,
  });
  await putPrivateMedia({
    pathname: rawPathname,
    bytes: new Uint8Array(await file.arrayBuffer()),
    contentType: parsed.data.contentType,
  });
  await finishUpload({
    imageId: parsed.data.imageId,
    orgId: access.viewer.org.id,
    spaceId,
    membershipId: access.viewer.membership.id,
    rawPathname,
  });
  const image = await getPostImageById(parsed.data.imageId);
  return image
    ? privateJson(statusPayload(slug, image))
    : privateJson({ error: "Image processing failed." }, { status: 500 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; spaceId: string }> },
) {
  const { slug, spaceId } = await context.params;
  if (!isPostMediaStorageConfigured()) {
    return privateJson({ error: "Image uploads are unavailable." }, { status: 503 });
  }
  if (isMemoryPostMediaStorage() && request.headers.get("content-type")?.includes("multipart/form-data")) {
    try {
      return await memoryUpload(request, slug, spaceId);
    } catch (error) {
      console.error("[wavesparks] in-memory image upload failed", error);
      return privateJson({ error: "Image upload failed." }, { status: 400 });
    }
  }
  if (!env.postMediaReadWriteToken) {
    return privateJson({ error: "Image uploads are unavailable." }, { status: 503 });
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      token: env.postMediaReadWriteToken,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const access = await requireSpaceAccessForAction({
          slug,
          spaceId,
          requireProfile: true,
        });
        const parsed = uploadPayloadSchema.safeParse(
          clientPayload ? JSON.parse(clientPayload) : null,
        );
        if (!parsed.success) throw new Error("Invalid image upload metadata.");
        const prefix = expectedPostImagePathPrefix({
          imageId: parsed.data.imageId,
          membershipId: access.viewer.membership.id,
          spaceId,
        });
        const fileName = pathname.slice(prefix.length);
        if (
          !pathname.startsWith(prefix) ||
          !fileName ||
          fileName.includes("/") ||
          fileName === "__wavesparks_processed__.webp" ||
          fileName.length > 120
        ) {
          throw new Error("Invalid image upload path.");
        }
        const now = new Date().toISOString();
        await createStagedPostImage({
          id: parsed.data.imageId,
          orgId: access.viewer.org.id,
          spaceId,
          uploaderMembershipId: access.viewer.membership.id,
          blobPathname: pathname,
          contentType: parsed.data.contentType,
          sizeBytes: parsed.data.sizeBytes,
          position: 0,
          uploadStatus: "staged",
          moderationStatus: "visible",
          createdAt: now,
          updatedAt: now,
        });
        return {
          allowedContentTypes: [...POST_IMAGE_CONTENT_TYPES],
          maximumSizeInBytes: POST_IMAGE_MAX_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          callbackUrl: request.url,
          tokenPayload: JSON.stringify({
            imageId: parsed.data.imageId,
            membershipId: access.viewer.membership.id,
            orgId: access.viewer.org.id,
            rawPathname: pathname,
            spaceId,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = z
          .object({
            imageId: z.string(),
            membershipId: z.string(),
            orgId: z.string(),
            rawPathname: z.string(),
            spaceId: z.string(),
          })
          .parse(JSON.parse(tokenPayload ?? "null"));
        if (blob.pathname !== payload.rawPathname) {
          throw new Error("The completed upload path does not match its token.");
        }
        after(async () => {
          console.info("[wavesparks] post image processing started", {
            imageId: payload.imageId,
            spaceId: payload.spaceId,
          });
          try {
            await finishUpload(payload);
            console.info("[wavesparks] post image processing completed", {
              imageId: payload.imageId,
              spaceId: payload.spaceId,
            });
          } catch (error) {
            console.error("[wavesparks] post image processing failed", {
              error,
              imageId: payload.imageId,
              spaceId: payload.spaceId,
            });
          }
        });
      },
    });
    return privateJson(result);
  } catch (error) {
    console.error("[wavesparks] post image upload route failed", error);
    return privateJson({ error: "Image upload failed." }, { status: 400 });
  }
}

import { nanoid } from "nanoid";
import { z } from "zod";

import { requireSpaceAccessForAction } from "@/lib/space-auth";
import { resolveLinkPreview } from "@/server/link-preview";
import {
  deletePrivateMedia,
  isPostMediaStorageConfigured,
  putPrivateMedia,
} from "@/server/post-media-storage";
import {
  createStagedPostLinkPreview,
  deleteStagedPostLinkPreviewRecord,
  getPostLinkPreviewById,
} from "@/server/store";

export const runtime = "nodejs";

const requestSchema = z.object({ url: z.string().trim().min(1).max(2_048) }).strict();

function privateJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Cookie");
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(body, { ...init, headers });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; spaceId: string }> },
) {
  const { slug, spaceId } = await context.params;
  let access: Awaited<ReturnType<typeof requireSpaceAccessForAction>>;
  try {
    access = await requireSpaceAccessForAction({ slug, spaceId, requireProfile: true });
  } catch {
    return privateJson({ error: "You do not have access to this Space." }, { status: 403 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return privateJson({ error: "Enter a valid link." }, { status: 400 });
  }

  const previewId = `plp_${nanoid(12)}`;
  try {
    const resolved = await resolveLinkPreview(parsed.data.url);
    let thumbnailBlobPathname: string | undefined;
    if (resolved.image && isPostMediaStorageConfigured()) {
      thumbnailBlobPathname = `post-link-previews/${spaceId}/${access.viewer.membership.id}/${previewId}/thumbnail.webp`;
      await putPrivateMedia({
        pathname: thumbnailBlobPathname,
        bytes: resolved.image.bytes,
        contentType: resolved.image.contentType,
      });
    }
    const now = new Date().toISOString();
    try {
      const preview = await createStagedPostLinkPreview({
        id: previewId,
        orgId: access.viewer.org.id,
        spaceId,
        uploaderMembershipId: access.viewer.membership.id,
        originalUrl: resolved.originalUrl,
        title: resolved.title,
        description: resolved.description,
        siteName: resolved.siteName,
        thumbnailBlobPathname,
        thumbnailContentType: resolved.image && thumbnailBlobPathname
          ? resolved.image.contentType
          : undefined,
        thumbnailSizeBytes: resolved.image && thumbnailBlobPathname
          ? resolved.image.bytes.byteLength
          : undefined,
        thumbnailWidth: resolved.image && thumbnailBlobPathname
          ? resolved.image.width
          : undefined,
        thumbnailHeight: resolved.image && thumbnailBlobPathname
          ? resolved.image.height
          : undefined,
        fetchStatus: "ready",
        moderationStatus: "visible",
        createdAt: now,
        updatedAt: now,
      });
      return privateJson({
        preview: {
          id: preview.id,
          url: preview.originalUrl,
          title: preview.title,
          description: preview.description,
          siteName: preview.siteName,
          thumbnailUrl: preview.thumbnailBlobPathname
            ? `/api/post-link-previews/${encodeURIComponent(preview.id)}/thumbnail`
            : undefined,
          thumbnailWidth: preview.thumbnailWidth,
          thumbnailHeight: preview.thumbnailHeight,
        },
      });
    } catch (error) {
      if (thumbnailBlobPathname) {
        await deletePrivateMedia(thumbnailBlobPathname).catch(() => undefined);
      }
      throw error;
    }
  } catch (error) {
    console.info("[wavesparks] link preview unavailable", error);
    return privateJson(
      { error: "Preview unavailable. The link will still be clickable." },
      { status: 422 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ slug: string; spaceId: string }> },
) {
  const { slug, spaceId } = await context.params;
  const previewId = new URL(request.url).searchParams.get("previewId") ?? "";
  try {
    const access = await requireSpaceAccessForAction({
      slug,
      spaceId,
      requireProfile: true,
    });
    const preview = await getPostLinkPreviewById(previewId);
    if (
      !preview ||
      preview.postId ||
      preview.orgId !== access.viewer.org.id ||
      preview.spaceId !== spaceId ||
      preview.uploaderMembershipId !== access.viewer.membership.id
    ) {
      return privateJson({ error: "Preview not found." }, { status: 404 });
    }
    if (preview.thumbnailBlobPathname) {
      await deletePrivateMedia(preview.thumbnailBlobPathname).catch(() => undefined);
    }
    await deleteStagedPostLinkPreviewRecord(preview.id);
    return privateJson({ ok: true });
  } catch {
    return privateJson({ error: "Preview not found." }, { status: 404 });
  }
}

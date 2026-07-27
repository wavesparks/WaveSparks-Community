import { env } from "@/lib/env";
import { processedPostImagePath } from "@/server/post-image-paths";
import {
  deletePrivateMedia,
  listPrivateMedia,
} from "@/server/post-media-storage";
import {
  deleteStagedPostImageRecord,
  deleteStagedPostLinkPreviewRecord,
  listOrphanedPostMedia,
  listTrackedPostMediaPathnames,
} from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authorized =
    Boolean(env.cronSecret) &&
    request.headers.get("authorization") === `Bearer ${env.cronSecret}`;
  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
  const orphaned = await listOrphanedPostMedia(cutoff);
  let deletedImages = 0;
  let deletedPreviews = 0;
  for (const image of orphaned.images) {
    try {
      const possiblePaths = new Set([
        image.blobPathname,
        processedPostImagePath({
          imageId: image.id,
          membershipId: image.uploaderMembershipId,
          spaceId: image.spaceId,
        }),
      ]);
      await Promise.all(
        [...possiblePaths].map((pathname) => deletePrivateMedia(pathname)),
      );
      if (await deleteStagedPostImageRecord(image.id)) deletedImages += 1;
    } catch (error) {
      console.error("[wavesparks] orphaned post image cleanup failed", image.id, error);
    }
  }
  for (const preview of orphaned.previews) {
    try {
      if (preview.thumbnailBlobPathname) {
        await deletePrivateMedia(preview.thumbnailBlobPathname);
      }
      if (await deleteStagedPostLinkPreviewRecord(preview.id)) deletedPreviews += 1;
    } catch (error) {
      console.error("[wavesparks] orphaned link preview cleanup failed", preview.id, error);
    }
  }

  const trackedPathnames = new Set(await listTrackedPostMediaPathnames());
  const storedMedia = (
    await Promise.all([
      listPrivateMedia("post-images/"),
      listPrivateMedia("post-link-previews/"),
    ])
  ).flat();
  let deletedUntrackedBlobs = 0;
  for (const media of storedMedia) {
    if (media.uploadedAt >= new Date(cutoff) || trackedPathnames.has(media.pathname)) {
      continue;
    }
    try {
      await deletePrivateMedia(media.pathname);
      deletedUntrackedBlobs += 1;
    } catch (error) {
      console.error("[wavesparks] untracked post media cleanup failed", media.pathname, error);
    }
  }
  return Response.json({
    ok: true,
    cutoff,
    deletedImages,
    deletedPreviews,
    deletedUntrackedBlobs,
  });
}

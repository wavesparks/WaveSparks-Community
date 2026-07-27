import { getViewerContextForAction } from "@/lib/auth";
import { requireSpaceAccessForAction } from "@/lib/space-auth";
import { getPrivateMedia } from "@/server/post-media-storage";
import {
  getOrganizationById,
  getPostByIdInSpace,
  getPostLinkPreviewById,
} from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFoundResponse() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store",
      "Cross-Origin-Resource-Policy": "same-origin",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ previewId: string }> },
) {
  const { previewId } = await context.params;
  const preview = await getPostLinkPreviewById(previewId);
  if (
    !preview ||
    preview.fetchStatus !== "ready" ||
    !preview.thumbnailBlobPathname ||
    !preview.thumbnailContentType
  ) {
    return notFoundResponse();
  }
  const org = await getOrganizationById(preview.orgId);
  if (!org) return notFoundResponse();
  const viewer = await getViewerContextForAction(org.slug);
  if (!viewer || viewer.org.id !== preview.orgId || viewer.membership.accountStatus !== "connected") {
    return notFoundResponse();
  }

  const isAdmin = viewer.canAdmin;
  if (!isAdmin) {
    try {
      await requireSpaceAccessForAction({ slug: org.slug, spaceId: preview.spaceId });
    } catch {
      return notFoundResponse();
    }
    if (preview.moderationStatus !== "visible") return notFoundResponse();
  }
  if (preview.postId) {
    const post = await getPostByIdInSpace(preview.spaceId, preview.postId);
    if (!post || post.orgId !== preview.orgId || (!isAdmin && post.hidden)) {
      return notFoundResponse();
    }
  } else if (preview.uploaderMembershipId !== viewer.membership.id) {
    return notFoundResponse();
  }

  const media = await getPrivateMedia(preview.thumbnailBlobPathname);
  if (!media) return notFoundResponse();
  return new Response(media.stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(media.size),
      "Content-Type": preview.thumbnailContentType,
      "Cross-Origin-Resource-Policy": "same-origin",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

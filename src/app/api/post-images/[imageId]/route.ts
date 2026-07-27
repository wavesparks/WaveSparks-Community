import { getViewerContextForAction } from "@/lib/auth";
import { requireSpaceAccessForAction } from "@/lib/space-auth";
import { getPrivateMedia } from "@/server/post-media-storage";
import {
  getOrganizationById,
  getPostByIdInSpace,
  getPostImageById,
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
  context: { params: Promise<{ imageId: string }> },
) {
  const { imageId } = await context.params;
  const image = await getPostImageById(imageId);
  if (!image || image.uploadStatus !== "ready") return notFoundResponse();
  const org = await getOrganizationById(image.orgId);
  if (!org) return notFoundResponse();
  const viewer = await getViewerContextForAction(org.slug);
  if (!viewer || viewer.org.id !== image.orgId || viewer.membership.accountStatus !== "connected") {
    return notFoundResponse();
  }

  const isAdmin = viewer.canAdmin;
  if (!isAdmin) {
    try {
      await requireSpaceAccessForAction({ slug: org.slug, spaceId: image.spaceId });
    } catch {
      return notFoundResponse();
    }
    if (image.moderationStatus !== "visible") return notFoundResponse();
  }
  if (image.postId) {
    const post = await getPostByIdInSpace(image.spaceId, image.postId);
    if (!post || post.orgId !== image.orgId || (!isAdmin && post.hidden)) {
      return notFoundResponse();
    }
  } else if (image.uploaderMembershipId !== viewer.membership.id) {
    return notFoundResponse();
  }

  const media = await getPrivateMedia(image.blobPathname);
  if (!media) return notFoundResponse();
  return new Response(media.stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(media.size),
      "Content-Type": image.contentType,
      "Cross-Origin-Resource-Policy": "same-origin",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

import type { ViewerContext } from "@/lib/domain";
import { canAccessFeed } from "@/server/permissions";

export function mainCommunityRedirectForViewer(
  slug: string,
  viewer?: ViewerContext | null,
) {
  if (!viewer || canAccessFeed(viewer.membership, viewer.profile)) {
    return undefined;
  }

  return viewer.membership.status === "approved"
    ? `/org/${slug}/onboarding`
    : `/org/${slug}/pending`;
}

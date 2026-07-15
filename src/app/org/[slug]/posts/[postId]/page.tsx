import { notFound, redirect } from "next/navigation";

import { pathWithQuery } from "@/lib/feed-filters";
import { getViewerContext } from "@/lib/auth";
import { getSpaceViewerContext } from "@/lib/space-auth";
import { getPostById, getSpaceById } from "@/server/store";

export default async function LegacyPostDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; postId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug, postId }, query] = await Promise.all([params, searchParams]);
  const viewer = await getViewerContext(slug, { requireAuth: true });
  if (!viewer) notFound();

  const post = await getPostById(postId);
  if (!post || post.orgId !== viewer.org.id || !post.spaceId) notFound();

  const space = await getSpaceById(post.spaceId);
  if (!space || space.orgId !== post.orgId) notFound();

  // Re-authorize the exact owning Space before disclosing where the legacy link points.
  const context = await getSpaceViewerContext(slug, space.slug, {
    requireAccess: true,
    requireAuth: true,
  });
  if (context.viewer.org.id !== post.orgId) notFound();

  redirect(
    pathWithQuery(
      `/org/${slug}/s/${space.slug}/posts/${encodeURIComponent(post.id)}`,
      query,
    ),
  );
}

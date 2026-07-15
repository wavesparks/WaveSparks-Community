import type { PostType } from "@/lib/domain";
import { isOpportunityPostType } from "@/lib/opportunities";

export function getPostListPathForType(slug: string, type: PostType) {
  return isOpportunityPostType(type)
    ? `/org/${slug}/opportunities`
    : `/org/${slug}/feed`;
}

export function getPostListRevalidationPaths(slug: string, type: PostType) {
  const paths = [`/org/${slug}/feed`];

  if (isOpportunityPostType(type)) {
    paths.push(`/org/${slug}/opportunities`);
  }

  return paths;
}

export function getPostCommentRevalidationPaths(
  slug: string,
  postId: string,
  type: PostType,
) {
  return [
    `/org/${slug}/posts/${postId}`,
    ...getPostListRevalidationPaths(slug, type),
  ];
}

export function getSpacePostCommentRevalidationPaths(
  slug: string,
  spaceSlug: string,
  postId: string,
  type: PostType,
) {
  const legacyRoot = `/org/${slug}`;
  const spaceRoot = `${legacyRoot}/s/${spaceSlug}`;
  return [
    `${spaceRoot}/posts/${postId}`,
    ...getPostListRevalidationPaths(slug, type).map((path) =>
      path.replace(legacyRoot, spaceRoot),
    ),
    `${spaceRoot}/knowledge`,
  ];
}

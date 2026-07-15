import { redirect } from "next/navigation";

/**
 * Kept only so previously cached internal rewrite URLs fail closed during the
 * Space rollout. Community content is never rendered from an anonymous route.
 */
export default async function RetiredAnonymousFeedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/org/${slug}/signin`);
}

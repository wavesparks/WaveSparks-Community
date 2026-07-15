import { redirect } from "next/navigation";

export default async function SpaceHome({
  params,
}: {
  params: Promise<{ slug: string; spaceSlug: string }>;
}) {
  const { slug, spaceSlug } = await params;
  redirect(`/org/${slug}/s/${spaceSlug}/feed`);
}

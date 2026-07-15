import { redirect } from "next/navigation";

export default async function LegacyAdminCohortsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/org/${slug}/admin/spaces`);
}

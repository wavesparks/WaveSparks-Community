import { redirect } from "next/navigation";

export default async function LegacyAdminCohortDetailPage({
  params,
}: {
  params: Promise<{ slug: string; cohortId: string }>;
}) {
  const { slug, cohortId } = await params;
  redirect(`/org/${slug}/admin/spaces/${cohortId}`);
}

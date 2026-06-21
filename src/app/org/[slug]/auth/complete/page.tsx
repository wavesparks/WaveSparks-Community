import { redirect } from "next/navigation";

import { getViewerContext } from "@/lib/auth";
import { canAccessFeed } from "@/server/permissions";

export default async function AuthCompletePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug, { requireAuth: true });

  if (!viewer) {
    return null;
  }

  if (canAccessFeed(viewer.membership, viewer.profile)) {
    redirect(`/org/${slug}/feed`);
  }

  if (viewer.membership.status === "approved") {
    redirect(`/org/${slug}/onboarding`);
  }

  redirect(`/org/${slug}/pending`);
}

import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { authOptions } from "@/lib/auth-options";
import { canAdminOrganization, canAccessFeed } from "@/server/permissions";
import {
  ensureMembership,
  getOrganizationBySlug,
  getProfileByMembershipId,
  upsertSessionUser,
} from "@/server/store";
import type { ViewerContext } from "@/lib/domain";

interface ViewerOptions {
  requireAuth?: boolean;
  requireApproved?: boolean;
  requireCompleteProfile?: boolean;
  requireAdmin?: boolean;
}

export async function getViewerContext(
  slug: string,
  options: ViewerOptions = {},
): Promise<ViewerContext | null> {
  const org = await getOrganizationBySlug(slug);
  if (!org) {
    notFound();
  }

  const session = await getServerSession(authOptions);

  if (!session?.user?.email || !session.user.name) {
    if (options.requireAuth) {
      redirect(`/org/${slug}/signin`);
    }
    return null;
  }

  const user = await upsertSessionUser({
    email: session.user.email,
    name: session.user.name,
    imageUrl: session.user.image ?? undefined,
  });

  const membership = await ensureMembership(user.id, org.id);
  const profile = await getProfileByMembershipId(membership.id);
  const canAdmin = canAdminOrganization(user, membership);

  if (options.requireAdmin && !canAdmin) {
    redirect(`/org/${slug}/feed`);
  }

  if (
    options.requireApproved &&
    membership.status !== "approved"
  ) {
    redirect(`/org/${slug}/pending`);
  }

  if (
    options.requireCompleteProfile &&
    membership.status === "approved" &&
    !canAccessFeed(membership, profile)
  ) {
    redirect(`/org/${slug}/onboarding`);
  }

  return {
    org,
    user,
    membership,
    profile,
    canAdmin,
    scopes: canAdmin ? ["org:admin", "org:member"] : ["org:member"],
  };
}

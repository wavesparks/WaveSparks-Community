import { notFound, redirect } from "next/navigation";

import { getCurrentAuthIdentity, type AuthIdentity } from "@/lib/auth-identity";
import { canAdminOrganization, canAccessFeed } from "@/server/permissions";
import {
  ensureMembership,
  getOrganizationBySlug,
  getProfileByMembershipId,
  getViewerRecordByEmailAndOrgId,
  getViewerRecordByEmailAndSlug,
  linkOrganizationToClerkOrg,
  upsertSessionUser,
} from "@/server/store";
import type { Membership, Organization, Profile, User, ViewerContext } from "@/lib/domain";
import { isBootstrapAdminEmail } from "@/lib/env";

interface ViewerOptions {
  requireAuth?: boolean;
  requireApproved?: boolean;
  requireCompleteProfile?: boolean;
  requireAdmin?: boolean;
}

interface ViewerRecord {
  user?: User;
  membership?: Membership;
  profile?: Profile;
}

async function buildViewerContextForOrg(
  org: Organization,
  identity: AuthIdentity,
  viewerRecord: ViewerRecord,
) {
  let user = viewerRecord.user;
  let membership = viewerRecord.membership;
  let profile = viewerRecord.profile;

  if (!user || !membership) {
    user = await upsertSessionUser({
      clerkUserId: identity.clerkUserId,
      email: identity.email,
      name: identity.name,
      imageUrl: identity.imageUrl,
    });
    membership = await ensureMembership(user.id, org.id, {
      clerkRole: identity.clerkOrgRole,
      existingUser: user,
    });
    profile = await getProfileByMembershipId(membership.id);
  } else if (
    isBootstrapAdminEmail(user.email) &&
    (membership.role !== "org_admin" || membership.status !== "approved")
  ) {
    membership = await ensureMembership(user.id, org.id, {
      clerkRole: identity.clerkOrgRole,
      existingUser: user,
      existingMembership: membership,
    });
    profile = await getProfileByMembershipId(membership.id);
  } else if (
    user.clerkUserId !== identity.clerkUserId ||
    membership.clerkRole !== identity.clerkOrgRole
  ) {
    user = await upsertSessionUser({
      clerkUserId: identity.clerkUserId,
      email: identity.email,
      name: identity.name,
      imageUrl: identity.imageUrl,
    });
    membership = await ensureMembership(user.id, org.id, {
      clerkRole: identity.clerkOrgRole,
      existingUser: user,
      existingMembership: membership,
    });
  }

  if (identity.clerkOrgId && org.clerkOrgId !== identity.clerkOrgId) {
    await linkOrganizationToClerkOrg(org.id, identity.clerkOrgId);
    org.clerkOrgId = identity.clerkOrgId;
  }

  const canAdmin =
    identity.canManageOrgMemberships || canAdminOrganization(user, membership);

  return {
    org,
    user,
    membership,
    profile,
    canAdmin,
    scopes: canAdmin ? ["org:admin", "org:member"] : ["org:member"],
  } satisfies ViewerContext;
}

async function resolveViewerContext(
  slug: string,
  options: { allowClerkLookupWithoutCookie?: boolean } = {},
) {
  const identity = await getCurrentAuthIdentity({
    allowClerkLookupWithoutCookie: options.allowClerkLookupWithoutCookie,
  });
  const viewerRecord = identity?.email
    ? await getViewerRecordByEmailAndSlug(slug, identity.email)
    : {
        org: await getOrganizationBySlug(slug),
        user: undefined,
        membership: undefined,
        profile: undefined,
      };
  const org = viewerRecord.org;

  if (!org) {
    return { org: undefined, viewer: null, authenticated: Boolean(identity) };
  }

  if (!identity) {
    return { org, viewer: null, authenticated: false };
  }

  if (identity.clerkOrgSlug && identity.clerkOrgSlug !== org.slug) {
    return { org, viewer: null, authenticated: true };
  }

  return {
    org,
    authenticated: true,
    viewer: await buildViewerContextForOrg(org, identity, viewerRecord),
  };
}

async function resolveOrganizationViewerContext(slug: string) {
  const [identity, org] = await Promise.all([
    getCurrentAuthIdentity(),
    getOrganizationBySlug(slug),
  ]);

  if (!org) {
    return { org: undefined, viewer: null, authenticated: Boolean(identity) };
  }

  if (!identity) {
    return { org, viewer: null, authenticated: false };
  }

  if (identity.clerkOrgSlug && identity.clerkOrgSlug !== org.slug) {
    return { org, viewer: null, authenticated: true };
  }

  const viewerRecord = await getViewerRecordByEmailAndOrgId(org.id, identity.email);

  return {
    org,
    authenticated: true,
    viewer: await buildViewerContextForOrg(org, identity, viewerRecord),
  };
}

export async function getViewerContext(
  slug: string,
  options: ViewerOptions = {},
): Promise<ViewerContext | null> {
  const { org, viewer, authenticated } = await resolveViewerContext(slug, {
    allowClerkLookupWithoutCookie: options.requireAuth,
  });

  if (!org) {
    notFound();
  }

  if (!authenticated || !viewer) {
    if (options.requireAuth) {
      redirect(`/org/${slug}/signin`);
    }
    return null;
  }

  if (options.requireAdmin && !viewer.canAdmin) {
    redirect(`/org/${slug}/feed`);
  }

  if (
    options.requireApproved &&
    viewer.membership.status !== "approved"
  ) {
    redirect(`/org/${slug}/pending`);
  }

  if (
    options.requireCompleteProfile &&
    viewer.membership.status === "approved" &&
    !canAccessFeed(viewer.membership, viewer.profile)
  ) {
    redirect(`/org/${slug}/onboarding`);
  }

  return viewer;
}

export async function getViewerContextForAction(slug: string) {
  const { org, viewer } = await resolveViewerContext(slug);

  if (!org || !viewer) {
    return null;
  }

  return viewer;
}

export async function getOrganizationViewerContext(slug: string) {
  const { org, viewer } = await resolveOrganizationViewerContext(slug);

  if (!org) {
    notFound();
  }

  return { org, viewer };
}

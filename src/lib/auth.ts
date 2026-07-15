import { notFound, redirect } from "next/navigation";

import { getCurrentAuthIdentity, type AuthIdentity } from "@/lib/auth-identity";
import { canAdminOrganization } from "@/server/permissions";
import {
  getOrganizationBySlug,
  getViewerRecordByClerkUserIdAndOrgId,
  getViewerRecordByEmailAndOrgId,
  upsertSessionUser,
} from "@/server/store";
import type { Membership, Organization, Profile, User, ViewerContext } from "@/lib/domain";
import { syncViewerClerkOrganization } from "@/server/clerk-sync";

interface ViewerOptions {
  requireAuth?: boolean;
  requireConnected?: boolean;
  requireCompleteProfile?: boolean;
  requireAdmin?: boolean;
}

interface AuthLookupOptions {
  allowClerkLookupWithoutCookie?: boolean;
  clerkSessionToken?: string;
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
  if (!viewerRecord.user || !viewerRecord.membership) {
    return null;
  }
  const membership = viewerRecord.membership;
  const profile = viewerRecord.profile;
  const user = await upsertSessionUser(
    {
      clerkUserId: identity.clerkUserId,
      email: identity.email,
      name: identity.name,
      imageUrl: identity.imageUrl,
    },
    {
      existingUser: viewerRecord.user,
    },
  );

  const canAdmin = canAdminOrganization(user, membership);

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
  options: AuthLookupOptions = {},
) {
  const [identity, org] = await Promise.all([
    getCurrentAuthIdentity({
      allowClerkLookupWithoutCookie: options.allowClerkLookupWithoutCookie,
      clerkSessionToken: options.clerkSessionToken,
    }),
    getOrganizationBySlug(slug),
  ]);

  if (!org) {
    return { org: undefined, viewer: null, authenticated: Boolean(identity) };
  }

  if (!identity) {
    return { org, viewer: null, authenticated: false };
  }

  const clerkRecord = await getViewerRecordByClerkUserIdAndOrgId(
    org.id,
    identity.clerkUserId,
  );
  const viewerRecord = clerkRecord.membership
    ? clerkRecord
    : await getViewerRecordByEmailAndOrgId(org.id, identity.email);
  const viewer = await buildViewerContextForOrg(org, identity, viewerRecord);

  return {
    org,
    authenticated: true,
    activeClerkOrgMismatch: Boolean(
      identity.clerkOrgId && org.clerkOrgId && identity.clerkOrgId !== org.clerkOrgId,
    ),
    viewer,
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

  const clerkRecord = await getViewerRecordByClerkUserIdAndOrgId(
    org.id,
    identity.clerkUserId,
  );
  const viewerRecord = clerkRecord.membership
    ? clerkRecord
    : await getViewerRecordByEmailAndOrgId(org.id, identity.email);

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
  const { org, viewer, authenticated, activeClerkOrgMismatch } = await resolveViewerContext(slug, {
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

  if (options.requireAuth && activeClerkOrgMismatch) {
    redirect(`/org/${slug}/auth/complete`);
  }

  if (options.requireAdmin && !viewer.canAdmin) {
    redirect(`/org/${slug}`);
  }

  if (
    options.requireConnected &&
    viewer.membership.accountStatus !== "connected"
  ) {
    redirect(`/org/${slug}/pending`);
  }

  if (
    options.requireCompleteProfile &&
    viewer.membership.accountStatus === "connected" &&
    !viewer.profile?.onboardingComplete
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

export async function getAuthCompletionViewerContext(
  slug: string,
  options: { clerkSessionToken?: string } = {},
) {
  const { org, viewer, authenticated } = await resolveViewerContext(slug, {
    allowClerkLookupWithoutCookie: true,
    clerkSessionToken: options.clerkSessionToken,
  });

  if (!org) {
    return { status: "not_found" as const, viewer: null };
  }

  if (!authenticated) {
    return { status: "unauthenticated" as const, viewer: null };
  }
  if (!viewer) {
    return { status: "forbidden" as const, viewer: null };
  }

  if (
    viewer.membership.accountStatus === "suspended" ||
    viewer.membership.accountStatus === "deprovisioned"
  ) {
    return {
      status: "authenticated" as const,
      state: "inactive" as const,
      viewer,
    };
  }

  const syncResult = await syncViewerClerkOrganization({
    clerkUserId: viewer.user.clerkUserId,
    membership: viewer.membership,
    org: viewer.org,
    user: viewer.user,
  });

  return {
    clerkOrgId: syncResult?.clerkOrgId ?? viewer.org.clerkOrgId,
    state: viewer.membership.accountStatus === "connected"
      ? ("ready" as const)
      : ("pending" as const),
    status: "authenticated" as const,
    viewer: syncResult
      ? {
          ...viewer,
          membership: syncResult.localMembership,
          user: syncResult.user,
        }
      : viewer,
  };
}

export async function getOrganizationViewerContext(slug: string) {
  const { org, viewer } = await resolveOrganizationViewerContext(slug);

  if (!org) {
    notFound();
  }

  return { org, viewer };
}

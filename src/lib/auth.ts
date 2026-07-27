import { notFound, redirect } from "next/navigation";

import {
  getCurrentAuthIdentity,
  type AuthIdentity,
  type ClerkUserIdentity,
  type KnownClerkIdentity,
} from "@/lib/auth-identity";
import type { Membership, Organization, Profile, User, ViewerContext } from "@/lib/domain";
import {
  canAdminOrganization,
  canUseMentorFeatures,
  isApprovedMentor,
} from "@/server/permissions";
import {
  getOrganizationBySlug,
  getViewerRecordByClerkUserIdAndOrgId,
  getViewerRecordByEmailAndOrgId,
  upsertSessionUser,
} from "@/server/store";

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

async function resolveIdentityForOrg(
  org: Organization,
  options: AuthLookupOptions = {},
) {
  let knownViewerRecord: ViewerRecord | undefined;
  const resolveKnownClerkIdentity = async (
    clerkIdentity: ClerkUserIdentity,
  ): Promise<KnownClerkIdentity | null> => {
    const viewerRecord = await getViewerRecordByClerkUserIdAndOrgId(
      org.id,
      clerkIdentity.clerkUserId,
    );
    if (!viewerRecord.user) {
      return null;
    }

    knownViewerRecord = viewerRecord;
    return {
      email: viewerRecord.user.email,
      imageUrl: viewerRecord.user.imageUrl,
      name: viewerRecord.user.name,
    };
  };
  const identity = await getCurrentAuthIdentity({
    allowClerkLookupWithoutCookie: options.allowClerkLookupWithoutCookie,
    clerkSessionToken: options.clerkSessionToken,
    resolveKnownClerkIdentity,
  });

  return { identity, knownViewerRecord };
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
      clerkUserId:
        identity.provider === "clerk"
          ? identity.clerkUserId
          : viewerRecord.user.clerkUserId,
      email: identity.email,
      name: identity.name,
      imageUrl: identity.imageUrl,
    },
    {
      existingUser: viewerRecord.user,
    },
  );

  const canAdmin = canAdminOrganization(user, membership);
  const approvedMentor = isApprovedMentor(membership);
  const canMentor = canUseMentorFeatures(membership);

  return {
    org,
    user,
    membership,
    profile,
    canAdmin,
    isApprovedMentor: approvedMentor,
    canMentor,
    scopes: canAdmin ? ["org:admin", "org:member"] : ["org:member"],
  } satisfies ViewerContext;
}

async function viewerRecordForIdentity(
  org: Organization,
  identity: AuthIdentity,
  knownViewerRecord?: ViewerRecord,
) {
  // The signed E2E cookie deliberately targets seed accounts that do not have a
  // Clerk user ID. Production Clerk sessions must never connect accounts by email;
  // account linking is only allowed by the invitation acceptance transaction.
  if (identity.provider === "e2e") {
    return getViewerRecordByEmailAndOrgId(org.id, identity.email);
  }

  return (
    knownViewerRecord ??
    getViewerRecordByClerkUserIdAndOrgId(org.id, identity.clerkUserId)
  );
}

async function resolveViewerContext(
  slug: string,
  options: AuthLookupOptions = {},
) {
  const org = await getOrganizationBySlug(slug);

  if (!org) {
    const identity = await getCurrentAuthIdentity({
      allowClerkLookupWithoutCookie: options.allowClerkLookupWithoutCookie,
      clerkSessionToken: options.clerkSessionToken,
    });
    return { org: undefined, viewer: null, authenticated: Boolean(identity) };
  }

  const { identity, knownViewerRecord } = await resolveIdentityForOrg(org, options);

  if (!identity) {
    return { org, viewer: null, authenticated: false };
  }

  const viewerRecord = await viewerRecordForIdentity(
    org,
    identity,
    knownViewerRecord,
  );
  const viewer = await buildViewerContextForOrg(org, identity, viewerRecord);

  return {
    org,
    authenticated: true,
    viewer,
  };
}

async function resolveOrganizationViewerContext(slug: string) {
  const org = await getOrganizationBySlug(slug);

  if (!org) {
    const identity = await getCurrentAuthIdentity();
    return { org: undefined, viewer: null, authenticated: Boolean(identity) };
  }

  const { identity, knownViewerRecord } = await resolveIdentityForOrg(org);

  if (!identity) {
    return { org, viewer: null, authenticated: false };
  }

  const viewerRecord = await viewerRecordForIdentity(
    org,
    identity,
    knownViewerRecord,
  );

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

  return {
    state: viewer.membership.accountStatus === "connected"
      ? ("ready" as const)
      : ("pending" as const),
    status: "authenticated" as const,
    viewer,
  };
}

export async function getOrganizationViewerContext(slug: string) {
  const { org, viewer } = await resolveOrganizationViewerContext(slug);

  if (!org) {
    notFound();
  }

  return { org, viewer };
}

import { notFound, redirect } from "next/navigation";

import { getViewerContext, getViewerContextForAction } from "@/lib/auth";
import { assertSpaceScopedReadsEnabled } from "@/lib/env";
import type {
  Space,
  SpaceIntent,
  SpaceMembership,
  ViewerContext,
} from "@/lib/domain";
import {
  canInteractInSpace,
  canMatchInSpace,
  hasEffectiveSpaceAccess,
} from "@/server/space-permissions";
import {
  getSpaceById,
  getSpaceBySlug,
  getSpaceIntent,
  getSpaceMembership,
  listSpacesForOrg,
  listVisibleSpacesForMembership,
} from "@/server/store";

export interface SpaceAccessRecord {
  space: Space;
  spaceMembership: SpaceMembership;
}

export interface SpaceContext {
  viewer: ViewerContext;
  space: Space;
  spaceMembership?: SpaceMembership;
  intent?: SpaceIntent;
  accessibleSpaces: SpaceAccessRecord[];
  canAccess: boolean;
  canInteract: boolean;
  canMatch: boolean;
  matchingReady: boolean;
}

function effectiveAccessRecords(
  viewer: ViewerContext,
  records: SpaceAccessRecord[],
) {
  return records.filter(({ spaceMembership, space }) =>
    hasEffectiveSpaceAccess(viewer.membership, space, spaceMembership),
  );
}

export async function getMySpacesContext(slug: string) {
  assertSpaceScopedReadsEnabled();
  const viewer = await getViewerContext(slug, { requireAuth: true });
  if (!viewer) {
    throw new Error("Authenticated viewer context is required.");
  }
  if (viewer.membership.accountStatus !== "connected") {
    redirect(`/org/${slug}/pending`);
  }

  const [allSpaces, visibleSpaces] = await Promise.all([
    listSpacesForOrg(viewer.org.id),
    listVisibleSpacesForMembership(viewer.membership.id),
  ]);
  const mainSpace = allSpaces.find((space) => space.kind === "main");
  if (!mainSpace) {
    throw new Error("Wavesparks Community is not configured.");
  }

  return {
    viewer,
    org: viewer.org,
    mainSpace,
    spaces: effectiveAccessRecords(viewer, visibleSpaces),
  };
}

/**
 * Resolve an old organization-level community URL without guessing a Space.
 * Legacy routes are only unambiguous when the viewer currently has exactly one
 * effective Space. Viewers with zero or multiple Spaces return to My Spaces.
 */
export async function getLegacySpaceDestination(
  slug: string,
  route: string,
) {
  assertSpaceScopedReadsEnabled();
  const viewer = await getViewerContext(slug, { requireAuth: true });
  if (!viewer) {
    throw new Error("Authenticated viewer context is required.");
  }

  const accessibleSpaces = effectiveAccessRecords(
    viewer,
    await listVisibleSpacesForMembership(viewer.membership.id),
  );
  if (accessibleSpaces.length !== 1) {
    return `/org/${slug}`;
  }

  const normalizedRoute = route.replace(/^\/+|\/+$/g, "");
  const root = `/org/${slug}/s/${accessibleSpaces[0].space.slug}`;
  return normalizedRoute ? `${root}/${normalizedRoute}` : root;
}

export async function getSpaceViewerContext(
  slug: string,
  spaceSlug: string,
  options: {
    requireAccess?: boolean;
    requireAdmin?: boolean;
    requireAuth?: boolean;
    requireIntent?: boolean;
    requireProfile?: boolean;
  } = {},
): Promise<SpaceContext> {
  assertSpaceScopedReadsEnabled();
  const viewer = await getViewerContext(slug, {
    requireAuth: options.requireAuth ?? true,
  });
  if (!viewer) {
    redirect(`/org/${slug}/signin`);
  }

  const space = await getSpaceBySlug(viewer.org.id, spaceSlug);
  if (!space) notFound();

  if (options.requireAdmin && !viewer.canAdmin) {
    redirect(`/org/${slug}`);
  }

  const [spaceMembership, intent, visibleSpaces] = await Promise.all([
    getSpaceMembership(space.id, viewer.membership.id),
    getSpaceIntent(space.id, viewer.membership.id),
    listVisibleSpacesForMembership(viewer.membership.id),
  ]);
  const canAccess = hasEffectiveSpaceAccess(
    viewer.membership,
    space,
    spaceMembership,
  );
  const canInteract = canInteractInSpace(
    viewer.membership,
    viewer.profile,
    space,
    spaceMembership,
  );
  const canMatch = canMatchInSpace(
    viewer.membership,
    viewer.profile,
    space,
    spaceMembership,
    intent,
  );

  if (options.requireAccess && !canAccess) {
    redirect(`/org/${slug}${space.kind === "main" ? "?locked=main" : ""}`);
  }
  if (options.requireProfile && !canInteract) {
    redirect(`/org/${slug}/onboarding?space=${encodeURIComponent(space.slug)}`);
  }
  if (options.requireIntent && !canMatch) {
    redirect(`/org/${slug}/s/${space.slug}/matches?setup=intent`);
  }

  return {
    viewer,
    space,
    spaceMembership,
    intent,
    accessibleSpaces: effectiveAccessRecords(viewer, visibleSpaces),
    canAccess,
    canInteract,
    canMatch,
    matchingReady: canMatch,
  };
}

export async function requireSpaceAccessForAction(input: {
  slug: string;
  spaceId: string;
  membershipId?: string;
  requireIntent?: boolean;
  requireProfile?: boolean;
}) {
  assertSpaceScopedReadsEnabled();
  const viewer = await getViewerContextForAction(input.slug);
  if (!viewer || viewer.membership.accountStatus !== "connected") {
    throw new Error("Authentication required.");
  }
  if (input.membershipId && viewer.membership.id !== input.membershipId) {
    throw new Error("Forbidden.");
  }

  const space = await getSpaceById(input.spaceId);
  if (!space || space.orgId !== viewer.org.id) {
    throw new Error("The selected community or event could not be found.");
  }
  const [spaceMembership, intent] = await Promise.all([
    getSpaceMembership(space.id, viewer.membership.id),
    getSpaceIntent(space.id, viewer.membership.id),
  ]);
  if (!hasEffectiveSpaceAccess(viewer.membership, space, spaceMembership)) {
    throw new Error("You do not have access to this community or event.");
  }
  if (
    input.requireProfile &&
    !canInteractInSpace(viewer.membership, viewer.profile, space, spaceMembership)
  ) {
    throw new Error("Complete your profile before posting or connecting with members.");
  }
  if (
    input.requireIntent &&
    !canMatchInSpace(
      viewer.membership,
      viewer.profile,
      space,
      spaceMembership,
      intent,
    )
  ) {
    throw new Error("Add your goals and matching preferences here before viewing matches.");
  }

  return { viewer, space, spaceMembership: spaceMembership!, intent };
}

export async function requireSpaceAdminForAction(slug: string, spaceId: string) {
  assertSpaceScopedReadsEnabled();
  const viewer = await getViewerContextForAction(slug);
  if (
    !viewer ||
    !viewer.canAdmin ||
    viewer.membership.accountStatus !== "connected"
  ) {
    throw new Error("Administrator access required.");
  }
  const space = await getSpaceById(spaceId);
  if (!space || space.orgId !== viewer.org.id) {
    throw new Error("The selected community or event could not be found.");
  }
  return { viewer, space };
}

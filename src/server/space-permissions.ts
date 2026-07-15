import type {
  Membership,
  Profile,
  Space,
  SpaceIntent,
  SpaceMembership,
} from "@/lib/domain";

const memberAccessibleLifecycles = new Set<Space["lifecycle"]>([
  "upcoming",
  "active",
  "ended",
]);

export function spaceLifecycleAllowsMemberAccess(space: Space) {
  return memberAccessibleLifecycles.has(space.lifecycle);
}

export function hasEffectiveSpaceAccess(
  membership: Membership,
  space: Space,
  spaceMembership?: SpaceMembership,
) {
  return (
    membership.orgId === space.orgId &&
    membership.accountStatus === "connected" &&
    spaceMembership?.orgId === membership.orgId &&
    spaceMembership.spaceId === space.id &&
    spaceMembership.membershipId === membership.id &&
    spaceMembership.accessStatus === "active" &&
    spaceLifecycleAllowsMemberAccess(space)
  );
}

export function canInteractInSpace(
  membership: Membership,
  profile: Profile | undefined,
  space: Space,
  spaceMembership?: SpaceMembership,
) {
  return (
    hasEffectiveSpaceAccess(membership, space, spaceMembership) &&
    Boolean(profile?.onboardingComplete)
  );
}

export function isSpaceIntentComplete(intent?: SpaceIntent) {
  if (!intent?.intentComplete) return false;

  return Boolean(
    intent.currentGoal.trim() || intent.lookingFor.length || intent.offers.length,
  );
}

export function canMatchInSpace(
  membership: Membership,
  profile: Profile | undefined,
  space: Space,
  spaceMembership?: SpaceMembership,
  intent?: SpaceIntent,
) {
  return (
    canInteractInSpace(membership, profile, space, spaceMembership) &&
    space.matchingEnabled &&
    Boolean(intent?.matchingOptIn) &&
    isSpaceIntentComplete(intent)
  );
}

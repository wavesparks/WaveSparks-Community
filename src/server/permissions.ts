import type { FullAdminProfile, Membership, Profile, User } from "@/lib/domain";

export function canAdminOrganization(user: User, membership: Membership) {
  return (
    user.platformRole === "platform_owner" ||
    membership.role === "org_admin"
  );
}

export function isApprovedMentor(membership: Membership) {
  return membership.mentorStatus === "approved";
}

export function canUseMentorFeatures(membership: Membership) {
  return (
    isApprovedMentor(membership) &&
    membership.accountStatus === "connected"
  );
}

export function canViewAdminRoute(user: User, membership: Membership) {
  return canAdminOrganization(user, membership) && membership.accountStatus === "connected";
}

export function canViewContactDetails(
  viewerMembershipId: string,
  introRequest: {
    requesterMembershipId: string;
    receiverMembershipId: string;
    status: string;
  },
) {
  const involved =
    introRequest.requesterMembershipId === viewerMembershipId ||
    introRequest.receiverMembershipId === viewerMembershipId;

  return involved && introRequest.status === "accepted";
}

export function canAccessFeed(membership: Membership, profile?: Profile) {
  return (
    membership.accountStatus === "connected" &&
    membership.status === "approved" &&
    Boolean(profile?.onboardingComplete)
  );
}

export function getProfileVisibilityForMember(profile: Profile, membership: Membership) {
  return {
    emailForIntro: "",
    whatsappNumber: "",
    profileCompletionPercent: profile.profileCompletionPercent,
    status: membership.status,
  } satisfies Pick<
    FullAdminProfile,
    "emailForIntro" | "whatsappNumber" | "profileCompletionPercent" | "status"
  >;
}

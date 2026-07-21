import {
  hashMembershipInvitationToken,
  isValidMembershipInvitationToken,
  parseMembershipInvitationCookie,
} from "@/lib/membership-invitation-token";
import {
  getMembershipInvitationByTokenHash,
  getOrganizationBySlug,
} from "@/server/store";

export async function getActiveMembershipInvitationSession(input: {
  cookieValue?: string;
  orgSlug: string;
}) {
  const invitationCookie = parseMembershipInvitationCookie(input.cookieValue);
  if (
    invitationCookie?.orgSlug !== input.orgSlug ||
    !isValidMembershipInvitationToken(invitationCookie.token)
  ) {
    return null;
  }

  const [org, invitation] = await Promise.all([
    getOrganizationBySlug(input.orgSlug),
    getMembershipInvitationByTokenHash(
      hashMembershipInvitationToken(invitationCookie.token),
    ),
  ]);
  if (
    !org ||
    !invitation ||
    invitation.orgId !== org.id ||
    invitation.status !== "pending" ||
    invitation.expiresAt <= new Date().toISOString()
  ) {
    return null;
  }

  return { invitation, org };
}

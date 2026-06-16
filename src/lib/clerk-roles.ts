import type { ClerkOrgRole, MembershipRole } from "@/lib/domain";

export const clerkAdminRole = "org:admin" satisfies ClerkOrgRole;
export const clerkMemberRole = "org:member" satisfies ClerkOrgRole;

export function localRoleFromClerkRole(role?: string | null): MembershipRole {
  return role === clerkAdminRole ? "org_admin" : "member";
}

export function clerkRoleFromLocalRole(role: MembershipRole): ClerkOrgRole {
  return role === "org_admin" ? clerkAdminRole : clerkMemberRole;
}

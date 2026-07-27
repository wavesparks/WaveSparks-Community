import type { Membership, OpportunitySource, PostType } from "@/lib/domain";
import { isApprovedMentor } from "@/server/permissions";

export const opportunityTypes: PostType[] = [
  "opportunity",
  "looking_for_cofounder",
  "looking_for_mentor",
];

export function isOpportunityPostType(type: PostType) {
  return opportunityTypes.includes(type);
}

export function isOpportunitySource(value: FormDataEntryValue | null): value is OpportunitySource {
  return value === "member" || value === "mentor" || value === "official";
}

export function opportunitySourceForPost(
  type: PostType,
  membership: Membership,
  requested: FormDataEntryValue | null,
  options: { canAdmin?: boolean } = {},
) {
  if (!isOpportunityPostType(type)) {
    return undefined;
  }

  const approvedMentor = isApprovedMentor(membership);

  const canAdmin = options.canAdmin ?? membership.role === "org_admin";
  if (canAdmin) {
    if (requested === "member") return "member";
    if (approvedMentor && requested === "mentor") return "mentor";
    return "official";
  }

  if (approvedMentor) {
    return requested === "mentor" ? "mentor" : "member";
  }

  return "member";
}

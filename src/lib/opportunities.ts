import type { Membership, OpportunitySource, PostType } from "@/lib/domain";

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
) {
  if (!isOpportunityPostType(type)) {
    return undefined;
  }

  if (membership.role === "org_admin" && isOpportunitySource(requested)) {
    return requested;
  }

  if (membership.affiliationType === "mentor" || membership.archetypes.includes("mentor")) {
    return "mentor";
  }

  return "member";
}

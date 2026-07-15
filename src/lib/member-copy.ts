import type {
  AccountStatus,
  AffiliationType,
  MembershipRole,
  SpaceAccessStatus,
} from "@/lib/domain";

const affiliationLabels: Record<AffiliationType, string> = {
  "current participant": "Participant",
  alumni: "Alumni",
  mentor: "Mentor",
  "invited outsider": "Guest",
};

const accountStatusLabels: Record<AccountStatus, string> = {
  invited: "Invitation pending",
  connected: "Active",
  suspended: "Paused",
  deprovisioned: "Account closed",
};

const membershipRoleLabels: Record<MembershipRole, string> = {
  member: "Member",
  org_admin: "Administrator",
};

const accessStatusLabels: Record<SpaceAccessStatus, string> = {
  active: "Active",
  waitlist: "Awaiting approval",
  rejected: "Not approved",
  suspended: "Paused",
  removed: "Removed",
};

export function getAffiliationLabel(value: AffiliationType) {
  return affiliationLabels[value];
}

export function getAccountStatusLabel(value: AccountStatus) {
  return accountStatusLabels[value];
}

export function getMembershipRoleLabel(value: MembershipRole) {
  return membershipRoleLabels[value];
}

export function getSpaceAccessStatusLabel(value: SpaceAccessStatus) {
  return accessStatusLabels[value];
}

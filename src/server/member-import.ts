import type { Organization } from "@/lib/domain";
import {
  MEMBER_IMPORT_MAX_ROWS,
  type MemberImportClassification,
  type MemberImportPreview,
  type MemberImportPreviewRequest,
  type MemberImportPreviewRow,
  type MemberImportSpaceAction,
} from "@/lib/member-import";
import {
  listMemberImportCandidatesForOrg,
  listSpacesForOrg,
} from "@/server/store";

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const retryableInvitationStatuses = new Set(["failed", "revoked", "expired"]);

function emptySummary(): Record<MemberImportClassification, number> {
  return {
    ready: 0,
    retryable: 0,
    already_invited: 0,
    already_connected: 0,
    existing_member: 0,
    duplicate: 0,
    invalid: 0,
    inactive_conflict: 0,
  };
}

function normalizedAllowedDomains(org: Organization) {
  return org.allowedDomains
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

function domainWarnings(org: Organization, email: string) {
  const allowedDomains = normalizedAllowedDomains(org);
  if (!allowedDomains.length) {
    return [];
  }

  const domain = email.split("@")[1] ?? "";
  return allowedDomains.includes(domain)
    ? []
    : ["Email domain is outside the organization’s configured domain list."];
}

export async function buildMemberImportPreview(
  org: Organization,
  input: MemberImportPreviewRequest,
): Promise<MemberImportPreview> {
  if (!Array.isArray(input.rows) || input.rows.length > MEMBER_IMPORT_MAX_ROWS) {
    throw new Error(`Import no more than ${MEMBER_IMPORT_MAX_ROWS} rows at a time.`);
  }
  const spaces = await listSpacesForOrg(org.id);
  const requestedSpaceId = input.destinationSpaceId.trim();
  if (!requestedSpaceId) {
    throw new Error("Choose a destination Space.");
  }
  const destinationSpace = spaces.find((space) => space.id === requestedSpaceId);
  if (!destinationSpace) {
    throw new Error("Destination Space not found.");
  }
  if (destinationSpace.lifecycle === "archived") {
    throw new Error("Archived Spaces cannot accept new members.");
  }
  if (destinationSpace.kind === "main" && destinationSpace.lifecycle !== "active") {
    throw new Error("Main Community lifecycle is invalid.");
  }
  const accessStatus = input.accessStatus;
  if (!(["active", "waitlist"] as const).includes(accessStatus)) {
    throw new Error("Invalid Space access selection.");
  }
  const prepared = input.rows.map((row, index) => ({
    rowNumber:
      Number.isInteger(row.rowNumber) && row.rowNumber > 0
        ? row.rowNumber
        : index + 2,
    email: String(row.email ?? "").trim(),
    normalizedEmail: String(row.email ?? "").trim().toLowerCase(),
    name: String(row.name ?? "").trim(),
  }));
  const firstRowsByEmail = new Map<string, number>();
  const validUniqueEmails: string[] = [];
  const preliminary = prepared.map((row) => {
    const invalidReason =
      !row.normalizedEmail ||
      row.normalizedEmail.length > 320 ||
      !emailPattern.test(row.normalizedEmail)
        ? "Enter a valid email address."
        : row.name.length > 120
          ? "Name must be 120 characters or fewer."
          : undefined;
    if (invalidReason) {
      return { row, classification: "invalid" as const, message: invalidReason };
    }

    const firstRow = firstRowsByEmail.get(row.normalizedEmail);
    if (firstRow !== undefined) {
      return {
        row,
        classification: "duplicate" as const,
        message: `Duplicate of row ${firstRow}; the first occurrence will be used.`,
      };
    }

    firstRowsByEmail.set(row.normalizedEmail, row.rowNumber);
    validUniqueEmails.push(row.normalizedEmail);
    return { row };
  });

  const candidates = await listMemberImportCandidatesForOrg(
    org.id,
    validUniqueEmails,
    destinationSpace.id,
  );
  const candidatesByEmail = new Map(
    candidates.map((candidate) => [candidate.email, candidate]),
  );

  const rows: MemberImportPreviewRow[] = preliminary.map((entry) => {
    const base = {
      rowNumber: entry.row.rowNumber,
      email: entry.row.email,
      name: entry.row.name,
      normalizedEmail: entry.row.normalizedEmail,
      warnings: entry.classification
        ? []
        : domainWarnings(org, entry.row.normalizedEmail),
    };
    if (entry.classification) {
      return {
        ...base,
        classification: entry.classification,
        spaceAction: "none",
        cohortAction: "none",
        message: entry.message,
      };
    }

    const candidate = candidatesByEmail.get(entry.row.normalizedEmail);
    const membership = candidate?.membership;
    const existingSpaceAccess = candidate?.spaceMembership?.accessStatus;
    const spaceAction: MemberImportSpaceAction = !existingSpaceAccess
      ? "grant"
      : existingSpaceAccess === "active"
        ? "already_in_space"
        : existingSpaceAccess === "waitlist"
          ? accessStatus === "active"
            ? "activate_waitlist"
            : "already_in_space"
          : "conflict";
    const cohortAction = destinationSpace.kind !== "event"
      ? "none"
      : spaceAction === "grant" || spaceAction === "activate_waitlist"
        ? "add"
        : spaceAction === "already_in_space"
          ? "already_in_cohort"
          : "none";

    if (!membership) {
      return {
        ...base,
        classification: "ready",
        spaceAction,
        cohortAction,
        message: `A new account invitation and ${destinationSpace.name} access will be created.`,
      };
    }
    if (
      membership.accountStatus === "suspended" ||
      membership.accountStatus === "deprovisioned"
    ) {
      return {
        ...base,
        classification: "inactive_conflict",
        spaceAction: "conflict",
        cohortAction: "none",
        membershipId: membership.id,
        message: `This account is ${membership.accountStatus}; restore it explicitly before assigning Space access.`,
      };
    }
    if (spaceAction === "conflict") {
      return {
        ...base,
        classification: "inactive_conflict",
        spaceAction,
        cohortAction: "none",
        membershipId: membership.id,
        message: `Access to ${destinationSpace.name} is ${existingSpaceAccess}; resolve it explicitly in member details.`,
      };
    }
    if (membership.clerkMembershipId) {
      return {
        ...base,
        classification: "already_connected",
        spaceAction,
        cohortAction,
        membershipId: membership.id,
        message:
          spaceAction === "grant" || spaceAction === "activate_waitlist"
            ? `Already connected; only ${destinationSpace.name} access will change.`
            : `Already connected with ${destinationSpace.name} access.`,
      };
    }
    if (membership.clerkInvitationStatus === "pending") {
      return {
        ...base,
        classification: "already_invited",
        spaceAction,
        cohortAction,
        membershipId: membership.id,
        message:
          spaceAction === "grant" || spaceAction === "activate_waitlist"
            ? `An account invitation is already pending; only ${destinationSpace.name} access will change.`
            : "An active account invitation and the selected Space access already exist.",
      };
    }
    if (
      !membership.clerkInvitationStatus ||
      retryableInvitationStatuses.has(membership.clerkInvitationStatus)
    ) {
      return {
        ...base,
        classification: "retryable",
        spaceAction,
        cohortAction,
        membershipId: membership.id,
        message: `The account invitation can be retried and ${destinationSpace.name} access will be ensured.`,
      };
    }

    return {
      ...base,
      classification: "existing_member",
      spaceAction,
      cohortAction,
      membershipId: membership.id,
      message:
        spaceAction === "grant" || spaceAction === "activate_waitlist"
          ? `Existing account; only ${destinationSpace.name} access will change.`
          : `This account already has ${destinationSpace.name} access.`,
    };
  });

  const summary = emptySummary();
  for (const row of rows) {
    summary[row.classification] += 1;
  }

  return {
    rows,
    summary,
    canInviteCount: summary.ready + summary.retryable,
    accessStatus,
    destinationSpaceId: destinationSpace.id,
    destinationSpaceName: destinationSpace.name,
    destinationSpaceKind: destinationSpace.kind,
    ...(destinationSpace.kind === "event" ? { cohortId: destinationSpace.id } : {}),
  };
}

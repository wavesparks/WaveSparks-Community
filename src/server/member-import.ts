import type { Organization } from "@/lib/domain";
import { getCommunityDisplayName } from "@/lib/community-copy";
import {
  MEMBER_IMPORT_MAX_ROWS,
  type MemberImportClassification,
  type MemberImportPreview,
  type MemberImportPreviewRequest,
  type MemberImportPreviewRow,
  type MemberImportSpaceAction,
} from "@/lib/member-import";
import { getSpaceAccessStatusLabel } from "@/lib/member-copy";
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
    throw new Error("Choose Wavesparks Community or an event.");
  }
  const destinationSpace = spaces.find((space) => space.id === requestedSpaceId);
  if (!destinationSpace) {
    throw new Error("The selected community or event could not be found.");
  }
  if (destinationSpace.lifecycle === "archived") {
    throw new Error("Restore this archived event before adding participants.");
  }
  if (destinationSpace.kind === "main" && destinationSpace.lifecycle !== "active") {
    throw new Error("Wavesparks Community is not available right now.");
  }
  const accessStatus = input.accessStatus;
  if (!(["active", "waitlist"] as const).includes(accessStatus)) {
    throw new Error("Choose active access or waitlist.");
  }
  const destinationName = getCommunityDisplayName(destinationSpace);
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
        message: `This person will be invited and added to ${destinationName}.`,
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
        message:
          membership.accountStatus === "suspended"
            ? "This account is paused. Restore it in member details before adding access."
            : "This account is no longer active. Restore it in member details before adding access.",
      };
    }
    if (spaceAction === "conflict") {
      return {
        ...base,
        classification: "inactive_conflict",
        spaceAction,
        cohortAction: "none",
        membershipId: membership.id,
        message: `Access to ${destinationName} is ${
          existingSpaceAccess
            ? getSpaceAccessStatusLabel(existingSpaceAccess).toLowerCase()
            : "unavailable"
        }. Review it in member details before continuing.`,
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
            ? `Account already connected; this person will be added to ${destinationName}.`
            : `Already has access to ${destinationName}.`,
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
            ? `An invitation is already pending; this person will be added to ${destinationName}.`
            : `An invitation is already pending and access to ${destinationName} is already set.`,
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
        message: `The invitation can be retried. Access to ${destinationName} will be added when it succeeds.`,
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
          ? `This existing account will be added to ${destinationName}.`
          : `Already has access to ${destinationName}.`,
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
    destinationSpaceName: destinationName,
    destinationSpaceKind: destinationSpace.kind,
    ...(destinationSpace.kind === "event" ? { cohortId: destinationSpace.id } : {}),
  };
}

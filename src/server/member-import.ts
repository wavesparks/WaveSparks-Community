import type { Organization } from "@/lib/domain";
import {
  MEMBER_IMPORT_MAX_ROWS,
  type MemberImportClassification,
  type MemberImportPreview,
  type MemberImportPreviewInput,
  type MemberImportPreviewRow,
} from "@/lib/member-import";
import { listMemberImportCandidatesForOrg } from "@/server/store";

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
  input: MemberImportPreviewInput,
): Promise<MemberImportPreview> {
  if (!Array.isArray(input.rows) || input.rows.length > MEMBER_IMPORT_MAX_ROWS) {
    throw new Error(`Import no more than ${MEMBER_IMPORT_MAX_ROWS} rows at a time.`);
  }
  if (!(["pending", "waitlist", "approved"] as const).includes(input.accessStatus)) {
    throw new Error("Invalid community access selection.");
  }

  const cohortId = input.cohortId?.trim() || undefined;
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
    cohortId,
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
        cohortAction: "none",
        message: entry.message,
      };
    }

    const candidate = candidatesByEmail.get(entry.row.normalizedEmail);
    const membership = candidate?.membership;
    const cohortAction = cohortId
      ? candidate?.inCohort
        ? "already_in_cohort"
        : "add"
      : "none";

    if (!membership) {
      return {
        ...base,
        classification: "ready",
        cohortAction,
        message: "A new member record and invitation will be created.",
      };
    }
    if (membership.status === "rejected" || membership.status === "suspended") {
      return {
        ...base,
        classification: "inactive_conflict",
        cohortAction: "none",
        membershipId: membership.id,
        message: `This member is ${membership.status}; restore access explicitly before inviting.`,
      };
    }
    if (membership.clerkMembershipId) {
      return {
        ...base,
        classification: "already_connected",
        cohortAction,
        membershipId: membership.id,
        message:
          cohortAction === "add"
            ? "Already connected; this member will only be added to the cohort."
            : "This member is already connected.",
      };
    }
    if (membership.clerkInvitationStatus === "pending") {
      return {
        ...base,
        classification: "already_invited",
        cohortAction,
        membershipId: membership.id,
        message:
          cohortAction === "add"
            ? "An invitation is already pending; this member will only be added to the cohort."
            : "An active invitation already exists and will not be duplicated.",
      };
    }
    if (
      !membership.clerkInvitationStatus ||
      retryableInvitationStatuses.has(membership.clerkInvitationStatus)
    ) {
      return {
        ...base,
        classification: "retryable",
        cohortAction,
        membershipId: membership.id,
        message: "The existing member record can receive a fresh invitation.",
      };
    }

    return {
      ...base,
      classification: "existing_member",
      cohortAction,
      membershipId: membership.id,
      message:
        cohortAction === "add"
          ? "Existing member; only the cohort association will be added."
          : "This member already exists and will not be changed.",
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
    accessStatus: input.accessStatus,
    ...(cohortId ? { cohortId } : {}),
  };
}

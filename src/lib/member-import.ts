export const MEMBER_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MEMBER_IMPORT_MAX_ROWS = 100;
export const MEMBER_IMPORT_MAX_COLUMNS = 20;

/** Access granted in the selected Space. Account invitation state is separate. */
export type MemberImportAccessStatus = "active" | "waitlist";

export interface MemberImportRow {
  rowNumber: number;
  email: string;
  name: string;
}

export interface MemberImportPreviewInput {
  rows: MemberImportRow[];
  accessStatus: MemberImportAccessStatus;
  destinationSpaceId: string;
}

export type MemberImportPreviewRequest = MemberImportPreviewInput;

export type MemberImportClassification =
  | "ready"
  | "retryable"
  | "already_invited"
  | "already_connected"
  | "existing_member"
  | "duplicate"
  | "invalid"
  | "inactive_conflict";

export type MemberImportSpaceAction =
  | "grant"
  | "activate_waitlist"
  | "already_in_space"
  | "conflict"
  | "none";

/** @deprecated Read `spaceAction`. */
export type MemberImportCohortAction = "add" | "already_in_cohort" | "none";

export interface MemberImportPreviewRow extends MemberImportRow {
  normalizedEmail: string;
  classification: MemberImportClassification;
  membershipId?: string;
  spaceAction: MemberImportSpaceAction;
  /** @deprecated Read `spaceAction`. */
  cohortAction?: MemberImportCohortAction;
  message: string;
  warnings: string[];
}

export interface MemberImportPreview {
  rows: MemberImportPreviewRow[];
  summary: Record<MemberImportClassification, number>;
  canInviteCount: number;
  accessStatus: MemberImportAccessStatus;
  destinationSpaceId: string;
  destinationSpaceName: string;
  destinationSpaceKind: "main" | "event";
  /** @deprecated Event Space ids remain equal to legacy Cohort ids during rollout. */
  cohortId?: string;
}

export type MemberImportResultStatus =
  | "invited"
  | "connected"
  | "space_added"
  /** @deprecated New results use `space_added`. */
  | "cohort_added"
  | "skipped"
  | "failed";

export interface MemberImportResultRow extends MemberImportRow {
  normalizedEmail: string;
  status: MemberImportResultStatus;
  membershipId?: string;
  message: string;
  retryable: boolean;
}

export interface MemberImportResult {
  rows: MemberImportResultRow[];
  summary: {
    invited: number;
    connected: number;
    spaceAdded?: number;
    /** @deprecated Read `spaceAdded`. */
    cohortAdded: number;
    skipped: number;
    failed: number;
  };
}

export type MemberImportFormat = "csv" | "xlsx";
export type MemberImportScalar = string | number | boolean | null;

export interface MemberImportRawRow {
  /** One-based row number in the source CSV or first worksheet. */
  rowNumber: number;
  values: MemberImportScalar[];
  /** Zero-based indexes of cells that contain spreadsheet-like formulas. */
  formulaColumns: number[];
}

export interface MemberImportFieldMapping {
  /** Zero-based column index, or null when no confident suggestion exists. */
  emailColumn: number | null;
  /** Zero-based column index, or null when no confident suggestion exists. */
  nameColumn: number | null;
}

export interface MemberImportParseResult {
  fileName: string;
  format: MemberImportFormat;
  headers: string[];
  rows: MemberImportRawRow[];
  suggestedMapping: MemberImportFieldMapping;
}

export interface MemberImportErrorResponse {
  error: string;
  code?: string;
}

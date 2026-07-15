"use client";

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";

import {
  confirmMemberImportAction,
  previewMemberImportAction,
  retryMemberInvitationsAction,
} from "@/actions/admin";
import {
  adminFriendlyMessage,
  adminSpaceName,
  adminSpaceOptionLabel,
} from "@/components/admin/admin-community-copy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  MemberImportAccessStatus,
  MemberImportClassification,
  MemberImportErrorResponse,
  MemberImportParseResult,
  MemberImportPreview,
  MemberImportPreviewInput,
  MemberImportResult,
  MemberImportResultRow,
  MemberImportResultStatus,
  MemberImportRow,
} from "@/lib/member-import";
import { getMemberImportOutcome } from "@/lib/member-import-outcome";
import { cn } from "@/lib/utils";

export interface MemberImportWorkflowProps {
  spaces?: Array<{
    id: string;
    name: string;
    kind: "main" | "event";
    lifecycle: string;
  }>;
  /** @deprecated Use `spaces`. */
  cohorts?: Array<{ id: string; name: string }>;
  defaultAccessStatus: MemberImportAccessStatus;
  defaultDestinationSpaceId?: string;
  /** @deprecated Use `defaultDestinationSpaceId`. */
  defaultCohortId?: string;
  invitationsEnabled?: boolean;
  slug: string;
}

type WorkflowStep = "source" | "mapping" | "preview" | "result";
type SourceMode = "file" | "paste";

const classificationOrder: MemberImportClassification[] = [
  "ready",
  "retryable",
  "already_invited",
  "already_connected",
  "existing_member",
  "duplicate",
  "invalid",
  "inactive_conflict",
];

const classificationLabels: Record<MemberImportClassification, string> = {
  ready: "Ready to invite",
  retryable: "Ready to retry",
  already_invited: "Invitation already sent",
  already_connected: "Account already connected",
  existing_member: "Account already exists",
  duplicate: "Repeated email",
  invalid: "Needs correction",
  inactive_conflict: "Access needs review",
};

const resultLabels: Record<MemberImportResultStatus, string> = {
  invited: "Invitation created",
  connected: "Account connected",
  space_added: "Added",
  cohort_added: "Added to Event",
  skipped: "Skipped",
  failed: "Failed",
};

function stringValue(value: string | number | boolean | null | undefined) {
  return value == null ? "" : String(value).trim();
}

function escapeCsvCell(value: string | number) {
  const raw = String(value);
  const text = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(fileName: string, rows: Array<Array<string | number>>) {
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.download = fileName;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

function summarizeResult(rows: MemberImportResultRow[]): MemberImportResult["summary"] {
  return rows.reduce<MemberImportResult["summary"]>(
    (summary, row) => {
      if (row.status === "invited") summary.invited += 1;
      if (row.status === "connected") summary.connected += 1;
      if (row.status === "space_added" || row.status === "cohort_added") {
        summary.spaceAdded = (summary.spaceAdded ?? 0) + 1;
        summary.cohortAdded += 1;
      }
      if (row.status === "skipped") summary.skipped += 1;
      if (row.status === "failed") summary.failed += 1;
      return summary;
    },
    { invited: 0, connected: 0, spaceAdded: 0, cohortAdded: 0, skipped: 0, failed: 0 },
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? adminFriendlyMessage(error.message)
    : "Something went wrong. Try again.";
}

export function MemberImportWorkflow({
  spaces,
  cohorts,
  defaultAccessStatus,
  defaultDestinationSpaceId,
  defaultCohortId,
  invitationsEnabled = true,
  slug,
}: MemberImportWorkflowProps) {
  const availableSpaces = spaces ?? (cohorts ?? []).map((cohort) => ({
    ...cohort,
    kind: "event" as const,
    lifecycle: "active",
  }));
  const initialDestinationSpaceId =
    defaultDestinationSpaceId ?? defaultCohortId ?? availableSpaces[0]?.id ?? "";
  const [step, setStep] = useState<WorkflowStep>("source");
  const [sourceMode, setSourceMode] = useState<SourceMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [pastedList, setPastedList] = useState("");
  const [parsed, setParsed] = useState<MemberImportParseResult | null>(null);
  const [emailColumn, setEmailColumn] = useState<number | null>(null);
  const [nameColumn, setNameColumn] = useState<number | null>(null);
  const [rows, setRows] = useState<MemberImportRow[]>([]);
  const [accessStatus, setAccessStatus] =
    useState<MemberImportAccessStatus>(defaultAccessStatus);
  const [destinationSpaceId, setDestinationSpaceId] = useState(
    initialDestinationSpaceId,
  );
  const [preview, setPreview] = useState<MemberImportPreview | null>(null);
  const [result, setResult] = useState<MemberImportResult | null>(null);
  const [previewDirty, setPreviewDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input: MemberImportPreviewInput = {
    rows,
    accessStatus,
    destinationSpaceId,
  };

  async function parseSource() {
    const sourceFile =
      sourceMode === "file"
        ? file
        : pastedList.trim()
          ? new File([pastedList], "pasted-members.csv", { type: "text/csv" })
          : null;

    if (!sourceFile) {
      setError(sourceMode === "file" ? "Choose a CSV or Excel file." : "Paste at least one person.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", sourceFile);
      body.append("slug", slug);
      const response = await fetch(
        `/api/admin/member-import/parse?slug=${encodeURIComponent(slug)}`,
        { method: "POST", body },
      );
      const payload = (await response.json().catch(() => ({}))) as
        | MemberImportParseResult
        | MemberImportErrorResponse;

      if (!response.ok || !("rows" in payload)) {
        throw new Error(
          "error" in payload
            ? payload.error
            : "We couldn't read this file. Check the format and try again.",
        );
      }

      setParsed(payload);
      setEmailColumn(payload.suggestedMapping.emailColumn);
      setNameColumn(payload.suggestedMapping.nameColumn);
      setStep("mapping");
    } catch (parseError) {
      setError(errorMessage(parseError));
    } finally {
      setBusy(false);
    }
  }

  async function runPreview(nextRows: MemberImportRow[]) {
    if (!nextRows.length) {
      setError("Add at least one person before continuing.");
      return;
    }

    const nextInput: MemberImportPreviewInput = {
      rows: nextRows,
      accessStatus,
      destinationSpaceId,
    };

    setBusy(true);
    setError(null);
    try {
      const nextPreview = await previewMemberImportAction(slug, nextInput);
      setRows(nextRows);
      setPreview(nextPreview);
      setPreviewDirty(false);
      setStep("preview");
    } catch (previewError) {
      setError(errorMessage(previewError));
    } finally {
      setBusy(false);
    }
  }

  async function mapAndPreview() {
    if (!parsed || emailColumn == null) {
      setError("Choose the column that contains email addresses.");
      return;
    }

    const mappedColumns = [emailColumn, nameColumn].filter(
      (column): column is number => column != null,
    );
    const formulaRow = parsed.rows.find((row) =>
      mappedColumns.some((column) => row.formulaColumns.includes(column)),
    );
    if (formulaRow) {
      setError(
        `Row ${formulaRow.rowNumber} uses a formula in one of the selected columns. Replace it with plain text.`,
      );
      return;
    }

    const nextRows = parsed.rows.map<MemberImportRow>((row) => ({
      rowNumber: row.rowNumber,
      email: stringValue(row.values[emailColumn]),
      name: nameColumn == null ? "" : stringValue(row.values[nameColumn]),
    }));
    await runPreview(nextRows);
  }

  function updateRow(rowNumber: number, field: "email" | "name", value: string) {
    setRows((currentRows) =>
      currentRows.map((row) => (row.rowNumber === rowNumber ? { ...row, [field]: value } : row)),
    );
    setPreviewDirty(true);
    setError(null);
  }

  function removeRow(rowNumber: number) {
    setRows((currentRows) => currentRows.filter((row) => row.rowNumber !== rowNumber));
    setPreviewDirty(true);
    setError(null);
  }

  function updateBatchSettings(
    nextAccessStatus: MemberImportAccessStatus,
    nextDestinationSpaceId: string,
  ) {
    setAccessStatus(nextAccessStatus);
    setDestinationSpaceId(nextDestinationSpaceId);
    if (step === "preview") {
      setPreviewDirty(true);
    }
  }

  const spaceOnlyCount =
    preview?.rows.filter(
      (row) =>
        (row.spaceAction === "grant" || row.spaceAction === "activate_waitlist") &&
        ["already_connected", "already_invited", "existing_member"].includes(
          row.classification,
        ),
    ).length ?? 0;
  const actionableCount = (preview?.canInviteCount ?? 0) + spaceOnlyCount;
  const destination = availableSpaces.find((space) => space.id === destinationSpaceId);
  const destinationName = destination
    ? adminSpaceName(destination)
    : preview?.destinationSpaceName
      ? adminFriendlyMessage(preview.destinationSpaceName)
      : "the selected community or Event";

  async function confirmImport() {
    if (!invitationsEnabled || !preview || previewDirty || !actionableCount) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const nextResult = await confirmMemberImportAction(slug, input);
      setResult(nextResult);
      setStep("result");
    } catch (confirmError) {
      setError(errorMessage(confirmError));
    } finally {
      setBusy(false);
    }
  }

  async function retryFailures() {
    if (!result) {
      return;
    }

    const membershipIds = [
      ...new Set(
        result.rows
          .filter((row) => row.status === "failed" && row.retryable && row.membershipId)
          .map((row) => row.membershipId!),
      ),
    ];
    if (!membershipIds.length) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const retryResult = await retryMemberInvitationsAction(slug, membershipIds);
      const retryRowsByMembership = new Map(
        retryResult.rows
          .filter((row) => row.membershipId)
          .map((row) => [row.membershipId!, row]),
      );
      const retryRowsByEmail = new Map(
        retryResult.rows.map((row) => [row.normalizedEmail, row]),
      );
      const mergedRows = result.rows.map(
        (row) => {
          const retriedRow =
            (row.membershipId ? retryRowsByMembership.get(row.membershipId) : undefined) ??
            retryRowsByEmail.get(row.normalizedEmail);
          return retriedRow
            ? {
                ...row,
                membershipId: retriedRow.membershipId ?? row.membershipId,
                message: retriedRow.message,
                retryable: retriedRow.retryable,
                status: retriedRow.status,
              }
            : row;
        },
      );
      setResult({
        rows: mergedRows,
        summary: {
          ...summarizeResult(mergedRows),
          spaceAdded: result.summary.spaceAdded,
          cohortAdded: result.summary.cohortAdded,
        },
      });
    } catch (retryError) {
      setError(errorMessage(retryError));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("source");
    setSourceMode("file");
    setFile(null);
    setPastedList("");
    setParsed(null);
    setEmailColumn(null);
    setNameColumn(null);
    setRows([]);
    setAccessStatus(defaultAccessStatus);
    setDestinationSpaceId(initialDestinationSpaceId);
    setPreview(null);
    setResult(null);
    setPreviewDirty(false);
    setError(null);
  }

  const retryableFailureCount =
    result?.rows.filter(
      (row) => row.status === "failed" && row.retryable && row.membershipId,
    ).length ?? 0;
  const resultOutcome = result ? getMemberImportOutcome(result) : null;
  const resultTone = resultOutcome?.tone ?? "success";
  const ResultIcon =
    resultTone === "success"
      ? CheckCircle2
      : resultTone === "error"
        ? AlertCircle
        : AlertTriangle;

  return (
    <div className="space-y-5">
      <ol aria-label="Invitation progress" className="grid grid-cols-3 gap-2 text-xs font-semibold">
        {["Add list", "Review", "Results"].map((label, index) => {
          const currentIndex =
            step === "source" || step === "mapping" ? 0 : step === "preview" ? 1 : 2;
          const active = index <= currentIndex;
          return (
            <li
              aria-current={index === currentIndex ? "step" : undefined}
              className={active ? "text-[var(--ink)]" : "text-[var(--ink-soft)]"}
              key={label}
            >
              <span
                aria-hidden
                className={cn(
                  "mb-2 block h-1 rounded-full",
                  active ? "bg-[var(--accent)]" : "bg-[var(--line)]",
                )}
              />
              {label}
            </li>
          );
        })}
      </ol>

      {error ? (
        <div
          className="flex gap-3 rounded-lg border border-red-600/25 bg-red-50 p-4 text-sm text-red-900"
          role="alert"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-red-700" />
          <p>{error}</p>
        </div>
      ) : null}

      {!invitationsEnabled ? (
        <div
          className="rounded-lg border border-amber-600/30 bg-amber-50 p-4 text-sm text-amber-900"
          role="status"
        >
          Invitations are temporarily unavailable. You can still add and review your list.
        </div>
      ) : null}

      {step === "source" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--surface-muted)] p-1" role="group" aria-label="List source">
            <Button
              aria-pressed={sourceMode === "file"}
              onClick={() => {
                setSourceMode("file");
                setError(null);
              }}
              type="button"
              variant={sourceMode === "file" ? "primary" : "ghost"}
            >
              <Upload aria-hidden className="size-4" />
              Upload file
            </Button>
            <Button
              aria-pressed={sourceMode === "paste"}
              onClick={() => {
                setSourceMode("paste");
                setError(null);
              }}
              type="button"
              variant={sourceMode === "paste" ? "primary" : "ghost"}
            >
              Paste list
            </Button>
          </div>

          {sourceMode === "file" ? (
            <div>
              <Label htmlFor="member-import-file">CSV or Excel file</Label>
              <Input
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                id="member-import-file"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setError(null);
                }}
                type="file"
              />
              <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
                You can add up to 100 people from the first sheet. The file must be 2 MB or less
                and include an email column; names are optional.
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="member-import-paste">Paste email and name</Label>
              <Textarea
                className="min-h-44 font-mono text-xs"
                id="member-import-paste"
                onChange={(event) => {
                  setPastedList(event.target.value);
                  setError(null);
                }}
                placeholder={"email,name\nmember@example.com,Member Name"}
                value={pastedList}
              />
              <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
                Add one person per line as email, name. Put quotation marks around names that contain a comma.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
            <Button asChild size="sm" variant="ghost">
              <a
                download="member-import-template.csv"
                href="data:text/csv;charset=utf-8,email%2Cname%0Amember%40example.com%2CMember%20Name"
              >
                <Download aria-hidden className="size-4" />
                Download template
              </a>
            </Button>
            <Button disabled={busy} onClick={() => void parseSource()} type="button">
              {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
              Choose columns
            </Button>
          </div>
        </div>
      ) : null}

      {step === "mapping" && parsed ? (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
            <FileSpreadsheet aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">{parsed.fileName}</p>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                {parsed.rows.length} {parsed.rows.length === 1 ? "person" : "people"} found · {parsed.format.toUpperCase()} file
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="member-import-email-column">Email column</Label>
              <Select
                id="member-import-email-column"
                onChange={(event) => {
                  setEmailColumn(event.target.value ? Number(event.target.value) : null);
                  setError(null);
                }}
                value={emailColumn ?? ""}
              >
                <option value="">Choose a column</option>
                {parsed.headers.map((header, index) => (
                  <option key={`${index}-${header}`} value={index}>
                    {header || `Column ${index + 1}`}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="member-import-name-column">Name column (optional)</Label>
              <Select
                id="member-import-name-column"
                onChange={(event) => {
                  setNameColumn(event.target.value ? Number(event.target.value) : null);
                  setError(null);
                }}
                value={nameColumn ?? ""}
              >
                <option value="">No name column</option>
                {parsed.headers.map((header, index) => (
                  <option key={`${index}-${header}`} value={index}>
                    {header || `Column ${index + 1}`}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[var(--line)]">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[var(--surface-muted)] text-[var(--ink-soft)]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Row</th>
                  {parsed.headers.map((header, index) => (
                    <th className="px-3 py-2 font-semibold" key={`${index}-${header}`}>
                      {header || `Column ${index + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {parsed.rows.slice(0, 5).map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="px-3 py-2 text-[var(--ink-soft)]">{row.rowNumber}</td>
                    {parsed.headers.map((_, index) => (
                      <td className="max-w-56 truncate px-3 py-2" key={index}>
                        {stringValue(row.values[index]) || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <BatchSettings
            accessStatus={accessStatus}
            destinationSpaceId={destinationSpaceId}
            onChange={updateBatchSettings}
            spaces={availableSpaces}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
            <Button onClick={() => setStep("source")} type="button" variant="ghost">
              <ArrowLeft aria-hidden className="size-4" />
              Back
            </Button>
            <Button disabled={busy || emailColumn == null} onClick={() => void mapAndPreview()} type="button">
              {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
              Review people
            </Button>
          </div>
        </div>
      ) : null}

      {step === "preview" && preview ? (
        <div className="space-y-5">
          <BatchSettings
            accessStatus={accessStatus}
            destinationSpaceId={destinationSpaceId}
            onChange={updateBatchSettings}
            spaces={availableSpaces}
          />

          {previewDirty ? (
            <div className="rounded-lg border border-amber-600/30 bg-amber-50 p-4 text-sm text-amber-900" role="status">
              Review the changes again before creating invitations.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {classificationOrder.map((classification) => (
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3" key={classification}>
                  <p className="text-xs font-semibold text-[var(--ink-soft)]">
                    {classificationLabels[classification]}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">
                    {preview.summary[classification]}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-[var(--line)]">
            <div className="hidden gap-3 bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase text-[var(--ink-soft)] md:grid md:grid-cols-[56px_1fr_1fr_1fr_44px]">
              <span>Row</span>
              <span>Email</span>
              <span>Name</span>
              <span>Review</span>
              <span className="sr-only">Actions</span>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {rows.map((row) => {
                const reviewedRow = preview.rows.find(
                  (candidate) => candidate.rowNumber === row.rowNumber,
                );
                return (
                  <div
                    className="grid gap-3 p-3 md:grid-cols-[56px_1fr_1fr_1fr_44px] md:items-start"
                    key={row.rowNumber}
                  >
                    <div>
                      <span className="text-xs font-semibold uppercase text-[var(--ink-soft)] md:hidden">Row</span>
                      <p className="mt-1 text-sm md:mt-2">{row.rowNumber}</p>
                    </div>
                    <div>
                      <Label className="mb-1 md:sr-only" htmlFor={`member-import-email-${row.rowNumber}`}>
                        Email
                      </Label>
                      <Input
                        id={`member-import-email-${row.rowNumber}`}
                        onChange={(event) => updateRow(row.rowNumber, "email", event.target.value)}
                        type="email"
                        value={row.email}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 md:sr-only" htmlFor={`member-import-name-${row.rowNumber}`}>
                        Name
                      </Label>
                      <Input
                        id={`member-import-name-${row.rowNumber}`}
                        onChange={(event) => updateRow(row.rowNumber, "name", event.target.value)}
                        value={row.name}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="mb-1 text-xs font-semibold uppercase text-[var(--ink-soft)] md:hidden">Review</p>
                      {reviewedRow ? (
                        <>
                          <Badge
                            className={cn(
                              reviewedRow.classification === "ready" && "border-emerald-600/25 bg-emerald-50 text-emerald-800",
                              reviewedRow.classification === "retryable" && "bg-amber-50 text-amber-800",
                              (reviewedRow.classification === "invalid" || reviewedRow.classification === "inactive_conflict") &&
                                "bg-red-50 text-red-800",
                            )}
                            variant={reviewedRow.classification === "ready" ? "accent" : "default"}
                          >
                            {classificationLabels[reviewedRow.classification]}
                          </Badge>
                          <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
                            {adminFriendlyMessage(reviewedRow.message)}
                          </p>
                          {reviewedRow.warnings.map((warning) => (
                            <p className="mt-1 text-xs leading-5 text-amber-800" key={warning}>
                              {adminFriendlyMessage(warning)}
                            </p>
                          ))}
                        </>
                      ) : (
                        <Badge variant="muted">Needs review</Badge>
                      )}
                    </div>
                    <Button
                      aria-label={`Remove row ${row.rowNumber}`}
                      onClick={() => removeRow(row.rowNumber)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </div>
                );
              })}
              {!rows.length ? (
                <p className="p-4 text-sm text-[var(--ink-soft)]">No one remains in this list.</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setStep("mapping")} type="button" variant="ghost">
                <ArrowLeft aria-hidden className="size-4" />
                Columns
              </Button>
              {!previewDirty &&
              preview.rows.some((row) =>
                ["duplicate", "invalid", "inactive_conflict"].includes(row.classification),
              ) ? (
                <Button
                  onClick={() =>
                    downloadCsv("member-import-problems.csv", [
                      ["row", "email", "name", "classification", "message"],
                      ...preview.rows
                        .filter((row) =>
                          ["duplicate", "invalid", "inactive_conflict"].includes(
                            row.classification,
                          ),
                        )
                        .map((row) => [
                          row.rowNumber,
                          row.email,
                          row.name,
                          classificationLabels[row.classification],
                          adminFriendlyMessage(row.message),
                        ]),
                    ])
                  }
                  type="button"
                  variant="secondary"
                >
                  <Download aria-hidden className="size-4" />
                  Download rows to fix
                </Button>
              ) : null}
            </div>
            {previewDirty ? (
              <Button disabled={busy || !rows.length} onClick={() => void runPreview(rows)} type="button">
                {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <RefreshCw aria-hidden className="size-4" />}
                Review changes
              </Button>
            ) : (
              <Button
                disabled={busy || !actionableCount || !invitationsEnabled}
                onClick={() => void confirmImport()}
                type="button"
              >
                {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
                {preview.canInviteCount
                  ? `Invite ${preview.canInviteCount} ${preview.canInviteCount === 1 ? "person" : "people"}${spaceOnlyCount ? ` and add ${spaceOnlyCount} existing ${spaceOnlyCount === 1 ? "member" : "members"}` : ""}`
                  : `Add ${spaceOnlyCount} ${spaceOnlyCount === 1 ? "person" : "people"} to ${destinationName}`}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {step === "result" && result ? (
        <div className="space-y-5">
          <div
            className={cn(
              "flex gap-3 rounded-lg border p-4",
              resultTone === "success" && "border-emerald-600/25 bg-emerald-50",
              resultTone === "warning" && "border-amber-600/30 bg-amber-50",
              resultTone === "error" && "border-red-600/25 bg-red-50",
            )}
            role={resultTone === "error" ? "alert" : "status"}
          >
            <ResultIcon
              aria-hidden
              className={cn(
                "mt-0.5 size-5 shrink-0",
                resultTone === "success" && "text-emerald-700",
                resultTone === "warning" && "text-amber-700",
                resultTone === "error" && "text-red-700",
              )}
            />
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">
                {resultOutcome?.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                {resultOutcome?.body}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Invited", result.summary.invited],
              ["Account connected", result.summary.connected],
              ["Added", result.summary.spaceAdded ?? result.summary.cohortAdded],
              ["Skipped", result.summary.skipped],
              ["Failed", result.summary.failed],
            ].map(([label, count]) => (
              <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-3" key={label}>
                <p className="text-xs font-semibold text-[var(--ink-soft)]">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{count}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-lg border border-[var(--line)]">
            <div className="hidden gap-3 bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase text-[var(--ink-soft)] md:grid md:grid-cols-[56px_1fr_1fr_0.8fr_1.2fr]">
              <span>Row</span>
              <span>Email</span>
              <span>Name</span>
              <span>Result</span>
              <span>Details</span>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {result.rows.map((row) => (
                <div
                  className="grid gap-3 p-3 md:grid-cols-[56px_1fr_1fr_0.8fr_1.2fr] md:items-start"
                  key={`${row.rowNumber}-${row.normalizedEmail}`}
                >
                  <ResultField label="Row">{row.rowNumber}</ResultField>
                  <ResultField label="Email">{row.email}</ResultField>
                  <ResultField label="Name">{row.name || "—"}</ResultField>
                  <ResultField label="Result">
                    <Badge
                      className={cn(
                        row.status === "failed" && "bg-red-50 text-red-800",
                        (row.status === "invited" || row.status === "connected") &&
                          "bg-emerald-50 text-emerald-800",
                      )}
                      variant={row.status === "skipped" ? "muted" : "default"}
                    >
                      {resultLabels[row.status]}
                    </Badge>
                  </ResultField>
                  <ResultField label="Details">
                    <span className="text-xs leading-5 text-[var(--ink-soft)]">
                      {adminFriendlyMessage(row.message)}
                    </span>
                  </ResultField>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
            <Button onClick={reset} type="button" variant="secondary">
              Add another list
            </Button>
            {retryableFailureCount ? (
              <Button disabled={busy} onClick={() => void retryFailures()} type="button">
                {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <RefreshCw aria-hidden className="size-4" />}
                Try {retryableFailureCount} failed {retryableFailureCount === 1 ? "invitation" : "invitations"} again
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface BatchSettingsProps {
  accessStatus: MemberImportAccessStatus;
  destinationSpaceId: string;
  spaces: Array<{
    id: string;
    name: string;
    kind: "main" | "event";
    lifecycle: string;
  }>;
  onChange: (accessStatus: MemberImportAccessStatus, destinationSpaceId: string) => void;
}

function BatchSettings({
  accessStatus,
  destinationSpaceId,
  spaces,
  onChange,
}: BatchSettingsProps) {
  return (
    <fieldset className="grid gap-4 rounded-lg border border-[var(--line)] p-4 sm:grid-cols-2">
      <legend className="px-1 text-sm font-semibold text-[var(--ink)]">Add this list</legend>
      <div>
        <Label htmlFor="member-import-access">When can they join?</Label>
        <Select
          id="member-import-access"
          onChange={(event) =>
            onChange(event.target.value as MemberImportAccessStatus, destinationSpaceId)
          }
          value={accessStatus}
        >
          <option value="waitlist">After approval</option>
          <option value="active">Immediately</option>
        </Select>
        <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
          People who already have access will keep it. Anyone with paused or removed access will be left unchanged for review.
        </p>
      </div>
      <div>
        <Label htmlFor="member-import-space">Add everyone to</Label>
        <Select
          id="member-import-space"
          onChange={(event) => onChange(accessStatus, event.target.value)}
          required
          value={destinationSpaceId}
        >
          <option value="" disabled>Choose Wavesparks Community or an Event</option>
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {adminSpaceOptionLabel(space)}
              {space.lifecycle === "ended" ? " (Past)" : ""}
            </option>
          ))}
        </Select>
      </div>
    </fieldset>
  );
}

function ResultField({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold uppercase text-[var(--ink-soft)] md:hidden">
        {label}
      </p>
      <div className="break-words text-sm text-[var(--ink)]">{children}</div>
    </div>
  );
}

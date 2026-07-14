import path from "node:path";

import { parse as parseCsv } from "csv-parse/sync";
import { strFromU8, unzipSync } from "fflate";
import { readSheet } from "read-excel-file/node";

import {
  MEMBER_IMPORT_MAX_COLUMNS,
  MEMBER_IMPORT_MAX_FILE_BYTES,
  MEMBER_IMPORT_MAX_ROWS,
  type MemberImportFieldMapping,
  type MemberImportFormat,
  type MemberImportParseResult,
  type MemberImportRawRow,
  type MemberImportScalar,
} from "@/lib/member-import";

const MAX_XLSX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;

const csvContentTypes = new Set([
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/octet-stream",
]);

const xlsxContentTypes = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/octet-stream",
]);

export type MemberImportFileErrorCode =
  | "unsupported_file_type"
  | "invalid_content_type"
  | "file_too_large"
  | "empty_file"
  | "invalid_utf8"
  | "invalid_csv"
  | "invalid_xlsx"
  | "encrypted_xlsx"
  | "missing_headers"
  | "no_data_rows"
  | "too_many_columns"
  | "too_many_rows"
  | "formula_in_mapped_field";

export class MemberImportFileError extends Error {
  constructor(
    message: string,
    readonly code: MemberImportFileErrorCode,
    readonly status: number,
  ) {
    super(message);
    this.name = "MemberImportFileError";
  }
}

export interface MemberImportFileInput {
  fileName: string;
  contentType?: string;
  bytes: Uint8Array;
}

interface ParsedSourceRow {
  rowNumber: number;
  values: MemberImportScalar[];
  formulaColumns: number[];
}

interface CsvRecordWithInfo {
  record: string[];
  info: {
    lines: number;
  };
}

interface FormulaCell {
  rowNumber: number;
  column: number;
}

function normalizedContentType(contentType?: string) {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function getFormat(fileName: string, contentType?: string): MemberImportFormat {
  const extension = path.extname(fileName).toLowerCase();
  const mime = normalizedContentType(contentType);

  if (extension !== ".csv" && extension !== ".xlsx") {
    throw new MemberImportFileError(
      "Only .csv and .xlsx files are supported.",
      "unsupported_file_type",
      415,
    );
  }

  const allowedContentTypes = extension === ".csv" ? csvContentTypes : xlsxContentTypes;
  if (mime && !allowedContentTypes.has(mime)) {
    throw new MemberImportFileError(
      `The file content type does not match ${extension}.`,
      "invalid_content_type",
      415,
    );
  }

  return extension === ".csv" ? "csv" : "xlsx";
}

function isEmptyScalar(value: MemberImportScalar) {
  return value === null || (typeof value === "string" && value.trim() === "");
}

function isNonEmptyRow(values: MemberImportScalar[]) {
  return values.some((value) => !isEmptyScalar(value));
}

function isNonEmptySourceRow(row: ParsedSourceRow) {
  return isNonEmptyRow(row.values) || row.formulaColumns.length > 0;
}

function trimTrailingEmptyCells(values: MemberImportScalar[]) {
  let end = values.length;
  while (end > 0 && isEmptyScalar(values[end - 1])) {
    end -= 1;
  }
  return values.slice(0, end);
}

function scalarToHeader(value: MemberImportScalar | undefined) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
}

function normalizeHeader(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[\s_.-]+/g, "");
}

function suggestMapping(headers: string[]): MemberImportFieldMapping {
  const normalizedHeaders = headers.map(normalizeHeader);
  const emailAliases = new Set([
    "email",
    "emailaddress",
    "emailid",
    "mail",
    "workemail",
    "personalemail",
    "邮箱",
    "电子邮箱",
    "邮件地址",
  ]);
  const nameAliases = new Set([
    "name",
    "fullname",
    "displayname",
    "preferredname",
    "membername",
    "姓名",
    "名字",
  ]);

  const emailColumn = normalizedHeaders.findIndex((header) => emailAliases.has(header));
  const nameColumn = normalizedHeaders.findIndex((header) => nameAliases.has(header));

  return {
    emailColumn: emailColumn >= 0 ? emailColumn : null,
    nameColumn: nameColumn >= 0 ? nameColumn : null,
  };
}

function looksLikeEmail(value: MemberImportScalar | undefined) {
  return (
    typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase())
  );
}

function isSpreadsheetFormula(value: MemberImportScalar) {
  return typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(value);
}

function validateAndBuildResult(
  input: MemberImportFileInput,
  format: MemberImportFormat,
  sourceRows: ParsedSourceRow[],
): MemberImportParseResult {
  if (sourceRows.length === 0) {
    throw new MemberImportFileError(
      "The file must contain a header row.",
      "missing_headers",
      422,
    );
  }

  const columnCount = sourceRows.reduce(
    (maximum, row) => Math.max(maximum, row.values.length),
    0,
  );
  if (columnCount > MEMBER_IMPORT_MAX_COLUMNS) {
    throw new MemberImportFileError(
      `The file can contain at most ${MEMBER_IMPORT_MAX_COLUMNS} columns.`,
      "too_many_columns",
      413,
    );
  }

  const headerRow = sourceRows[0];
  const headers = Array.from({ length: columnCount }, (_, index) =>
    scalarToHeader(headerRow.values[index]),
  );
  const suggestedMapping = suggestMapping(headers);

  if (
    headers.every((header) => header === "") ||
    (suggestedMapping.emailColumn === null && headerRow.values.some(looksLikeEmail))
  ) {
    throw new MemberImportFileError(
      "The first non-empty row must contain column headers.",
      "missing_headers",
      422,
    );
  }

  const rows: MemberImportRawRow[] = sourceRows
    .slice(1)
    .filter(isNonEmptySourceRow)
    .map((row) => ({
      rowNumber: row.rowNumber,
      values: trimTrailingEmptyCells(row.values),
      formulaColumns: row.formulaColumns,
    }));

  if (rows.length === 0) {
    throw new MemberImportFileError(
      "The file does not contain any non-empty data rows.",
      "no_data_rows",
      422,
    );
  }

  if (rows.length > MEMBER_IMPORT_MAX_ROWS) {
    throw new MemberImportFileError(
      `The file can contain at most ${MEMBER_IMPORT_MAX_ROWS} non-empty data rows.`,
      "too_many_rows",
      413,
    );
  }

  const mappedColumns = [
    suggestedMapping.emailColumn,
    suggestedMapping.nameColumn,
  ].filter((column): column is number => column !== null);
  const formulaRow = rows.find((row) =>
    row.formulaColumns.some((column) => mappedColumns.includes(column)),
  );
  if (formulaRow) {
    throw new MemberImportFileError(
      `Row ${formulaRow.rowNumber} contains a formula in a suggested Email or Name field. Replace it with a plain value.`,
      "formula_in_mapped_field",
      422,
    );
  }

  return {
    fileName: input.fileName,
    format,
    headers,
    rows,
    suggestedMapping,
  };
}

function parseCsvFile(input: MemberImportFileInput) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
  } catch {
    throw new MemberImportFileError(
      "CSV files must use UTF-8 encoding.",
      "invalid_utf8",
      422,
    );
  }

  let records: CsvRecordWithInfo[];
  try {
    records = parseCsv(text, {
      bom: true,
      cast: false,
      info: true,
      max_record_size: MEMBER_IMPORT_MAX_FILE_BYTES,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as unknown as CsvRecordWithInfo[];
  } catch {
    throw new MemberImportFileError(
      "The CSV file could not be parsed. Check its quoting and delimiters.",
      "invalid_csv",
      422,
    );
  }

  const rows = records
    .map(({ record, info }) => ({
      rowNumber: info.lines,
      values: record,
      formulaColumns: record.flatMap((value, index) =>
        isSpreadsheetFormula(value) ? [index] : [],
      ),
    }))
    .filter(isNonEmptySourceRow);

  return validateAndBuildResult(input, "csv", rows);
}

function hasOleCompoundFileSignature(bytes: Uint8Array) {
  const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return signature.every((byte, index) => bytes[index] === byte);
}

function hasZipSignature(bytes: Uint8Array) {
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}

function xmlAttribute(attributes: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = attributes.match(
    new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*["']([^"']*)["']`, "i"),
  );
  return match?.[1];
}

function firstWorksheetPath(files: Record<string, Uint8Array>) {
  const workbook = files["xl/workbook.xml"];
  const relationships = files["xl/_rels/workbook.xml.rels"];
  if (!workbook || !relationships) {
    return undefined;
  }

  const workbookXml = strFromU8(workbook);
  const firstSheetTag = workbookXml.match(/<(?:\w+:)?sheet\b([^>]*)\/?\s*>/i);
  const relationshipId = firstSheetTag
    ? xmlAttribute(firstSheetTag[1], "r:id")
    : undefined;
  if (!relationshipId) {
    return undefined;
  }

  const relationshipsXml = strFromU8(relationships);
  const relationshipTags = relationshipsXml.matchAll(
    /<(?:\w+:)?Relationship\b([^>]*)\/?\s*>/gi,
  );
  for (const match of relationshipTags) {
    if (xmlAttribute(match[1], "Id") !== relationshipId) {
      continue;
    }
    const target = xmlAttribute(match[1], "Target");
    if (!target) {
      return undefined;
    }
    const normalized = target.startsWith("/")
      ? path.posix.normalize(target.slice(1))
      : path.posix.normalize(path.posix.join("xl", target));
    return normalized;
  }

  return undefined;
}

function columnIndexFromCellReference(reference: string) {
  const match = reference.toUpperCase().match(/^\$?([A-Z]+)\$?(\d+)$/);
  if (!match) {
    return undefined;
  }

  let column = 0;
  for (const character of match[1]) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  return {
    column: column - 1,
    rowNumber: Number(match[2]),
  };
}

function findFormulaCells(worksheetXml: string): FormulaCell[] {
  const formulas: FormulaCell[] = [];
  const cellTags = worksheetXml.matchAll(
    /<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c\s*>/gi,
  );

  for (const match of cellTags) {
    if (!/<(?:\w+:)?f(?:\s[^>]*)?\s*\/?>/i.test(match[2])) {
      continue;
    }
    const reference = xmlAttribute(match[1], "r");
    const position = reference ? columnIndexFromCellReference(reference) : undefined;
    if (position) {
      formulas.push(position);
    }
  }

  return formulas;
}

function inspectXlsxArchive(bytes: Uint8Array) {
  let uncompressedBytes = 0;
  let archiveTooLarge = false;
  let encrypted = false;
  let macroEnabled = false;
  let files: Record<string, Uint8Array>;

  try {
    files = unzipSync(bytes, {
      filter(file) {
        uncompressedBytes += file.originalSize;
        if (uncompressedBytes > MAX_XLSX_UNCOMPRESSED_BYTES) {
          archiveTooLarge = true;
        }
        const normalizedName = file.name.replace(/^\//, "");
        if (/^(?:EncryptionInfo|EncryptedPackage)$/i.test(normalizedName)) {
          encrypted = true;
        }
        if (/^xl\/vbaProject\.bin$/i.test(normalizedName)) {
          macroEnabled = true;
        }
        return (
          !archiveTooLarge &&
          (normalizedName === "[Content_Types].xml" ||
            normalizedName === "xl/workbook.xml" ||
            normalizedName === "xl/_rels/workbook.xml.rels" ||
            /^xl\/worksheets\/[^/]+\.xml$/i.test(normalizedName))
        );
      },
    });
  } catch {
    throw new MemberImportFileError(
      "The XLSX file is corrupt or uses unsupported encryption.",
      "invalid_xlsx",
      422,
    );
  }

  if (encrypted) {
    throw new MemberImportFileError(
      "Encrypted spreadsheets are not supported.",
      "encrypted_xlsx",
      422,
    );
  }
  if (macroEnabled) {
    throw new MemberImportFileError(
      "Macro-enabled spreadsheets are not supported. Save the file as .xlsx.",
      "unsupported_file_type",
      415,
    );
  }
  if (archiveTooLarge) {
    throw new MemberImportFileError(
      "The expanded XLSX file is too large to process safely.",
      "file_too_large",
      413,
    );
  }
  if (!files["[Content_Types].xml"]) {
    throw new MemberImportFileError(
      "The XLSX file is missing required workbook data.",
      "invalid_xlsx",
      422,
    );
  }

  const worksheetPath = firstWorksheetPath(files);
  const worksheet = worksheetPath ? files[worksheetPath] : undefined;
  if (!worksheet) {
    throw new MemberImportFileError(
      "The first worksheet could not be found.",
      "invalid_xlsx",
      422,
    );
  }

  return findFormulaCells(strFromU8(worksheet));
}

function toImportScalar(value: unknown): MemberImportScalar {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value);
}

async function parseXlsxFile(input: MemberImportFileInput) {
  if (hasOleCompoundFileSignature(input.bytes)) {
    throw new MemberImportFileError(
      "Legacy or encrypted Excel files are not supported. Upload an unencrypted .xlsx file.",
      "encrypted_xlsx",
      422,
    );
  }
  if (!hasZipSignature(input.bytes)) {
    throw new MemberImportFileError(
      "The file is not a valid XLSX workbook.",
      "invalid_xlsx",
      422,
    );
  }

  const formulaCells = inspectXlsxArchive(input.bytes);
  let sheet: unknown[][];
  try {
    sheet = (await readSheet(Buffer.from(input.bytes), 1)) as unknown[][];
  } catch {
    throw new MemberImportFileError(
      "The XLSX file is corrupt or uses unsupported encryption.",
      "invalid_xlsx",
      422,
    );
  }

  const formulasByRow = new Map<number, number[]>();
  for (const formula of formulaCells) {
    formulasByRow.set(formula.rowNumber, [
      ...(formulasByRow.get(formula.rowNumber) ?? []),
      formula.column,
    ]);
  }

  const rows: ParsedSourceRow[] = sheet
    .map((values, index) => ({
      rowNumber: index + 1,
      values: values.map(toImportScalar),
      formulaColumns: [...new Set(formulasByRow.get(index + 1) ?? [])].sort(
        (left, right) => left - right,
      ),
    }))
    .filter(isNonEmptySourceRow);

  return validateAndBuildResult(input, "xlsx", rows);
}

export async function parseMemberImportFile(
  input: MemberImportFileInput,
): Promise<MemberImportParseResult> {
  const format = getFormat(input.fileName, input.contentType);

  if (input.bytes.byteLength === 0) {
    throw new MemberImportFileError("The uploaded file is empty.", "empty_file", 422);
  }
  if (input.bytes.byteLength > MEMBER_IMPORT_MAX_FILE_BYTES) {
    throw new MemberImportFileError(
      "The file must be 2 MB or smaller.",
      "file_too_large",
      413,
    );
  }

  return format === "csv" ? parseCsvFile(input) : parseXlsxFile(input);
}

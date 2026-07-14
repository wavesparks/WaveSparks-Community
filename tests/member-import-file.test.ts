import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";

import {
  MEMBER_IMPORT_MAX_FILE_BYTES,
  MEMBER_IMPORT_MAX_ROWS,
} from "@/lib/member-import";
import { parseMemberImportFile } from "@/server/member-import-file";

const encoder = new TextEncoder();

function csvInput(
  contents: string,
  overrides: Partial<{
    fileName: string;
    contentType: string;
  }> = {},
) {
  return {
    fileName: overrides.fileName ?? "members.csv",
    contentType: overrides.contentType ?? "text/csv",
    bytes: encoder.encode(contents),
  };
}

function cellReference(column: number, row: number) {
  let remaining = column + 1;
  let letters = "";
  while (remaining > 0) {
    const digit = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + digit) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return `${letters}${row}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type FixtureCell = string | number | boolean | null | { formula: string; value: string };

function worksheetXml(rows: FixtureCell[][]) {
  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          if (value === null) {
            return "";
          }
          const reference = cellReference(columnIndex, rowIndex + 1);
          if (typeof value === "object") {
            return `<c r="${reference}" t="str"><f>${escapeXml(value.formula)}</f><v>${escapeXml(value.value)}</v></c>`;
          }
          if (typeof value === "number") {
            return `<c r="${reference}" t="n"><v>${value}</v></c>`;
          }
          if (typeof value === "boolean") {
            return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
          }
          return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function xlsxFixture(firstSheet: FixtureCell[][], secondSheet?: FixtureCell[][]) {
  const hasSecondSheet = Boolean(secondSheet);
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${hasSecondSheet ? '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' : ""}</Types>`;
  const rootRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="First" sheetId="1" r:id="rId1"/>${hasSecondSheet ? '<sheet name="Second" sheetId="2" r:id="rId2"/>' : ""}</sheets></workbook>`;
  const workbookRelationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>${hasSecondSheet ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' : ""}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" xfId="0"/></cellXfs></styleSheet>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRelationships),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRelationships),
    "xl/styles.xml": strToU8(styles),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(firstSheet)),
  };
  if (secondSheet) {
    files["xl/worksheets/sheet2.xml"] = strToU8(worksheetXml(secondSheet));
  }
  return zipSync(files);
}

describe("member import file parser", () => {
  it("parses UTF-8 BOM CSV files with CRLF, quoted commas, and Unicode names", async () => {
    const result = await parseMemberImportFile(
      csvInput(
        '\uFEFFEmail,Full Name,Note\r\nalice@example.com,"Alice, Tan",Founder\r\nli@example.cn,李雷,"Hello, world"\r\n',
      ),
    );

    expect(result).toEqual({
      fileName: "members.csv",
      format: "csv",
      headers: ["Email", "Full Name", "Note"],
      suggestedMapping: { emailColumn: 0, nameColumn: 1 },
      rows: [
        {
          rowNumber: 2,
          values: ["alice@example.com", "Alice, Tan", "Founder"],
          formulaColumns: [],
        },
        {
          rowNumber: 3,
          values: ["li@example.cn", "李雷", "Hello, world"],
          formulaColumns: [],
        },
      ],
    });
  });

  it("retains duplicate rows for the preview action to classify", async () => {
    const result = await parseMemberImportFile(
      csvInput("Email,Name\nalice@example.com,Alice\nalice@example.com,Alice Again"),
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.rowNumber)).toEqual([2, 3]);
  });

  it("returns null suggestions for manually mapped custom headers", async () => {
    const result = await parseMemberImportFile(
      csvInput("Contact,Person\nalice@example.com,Alice"),
    );

    expect(result.suggestedMapping).toEqual({ emailColumn: null, nameColumn: null });
  });

  it("rejects a data-first CSV with no header row", async () => {
    await expect(
      parseMemberImportFile(csvInput("alice@example.com,Alice\nbob@example.com,Bob")),
    ).rejects.toMatchObject({ code: "missing_headers", status: 422 });
  });

  it("rejects unsupported extensions and mismatched content types", async () => {
    await expect(
      parseMemberImportFile(csvInput("Email\nalice@example.com", { fileName: "members.xls" })),
    ).rejects.toMatchObject({ code: "unsupported_file_type", status: 415 });
    await expect(
      parseMemberImportFile(
        csvInput("Email\nalice@example.com", { fileName: "members.xlsm" }),
      ),
    ).rejects.toMatchObject({ code: "unsupported_file_type", status: 415 });
    await expect(
      parseMemberImportFile(
        csvInput("Email\nalice@example.com", { contentType: "image/png" }),
      ),
    ).rejects.toMatchObject({ code: "invalid_content_type", status: 415 });
  });

  it("enforces the file, row, and column limits", async () => {
    await expect(
      parseMemberImportFile({
        fileName: "members.csv",
        contentType: "text/csv",
        bytes: new Uint8Array(MEMBER_IMPORT_MAX_FILE_BYTES + 1),
      }),
    ).rejects.toMatchObject({ code: "file_too_large", status: 413 });

    const tooManyRows = [
      "Email,Name",
      ...Array.from(
        { length: MEMBER_IMPORT_MAX_ROWS + 1 },
        (_, index) => `member${index}@example.com,Member ${index}`,
      ),
    ].join("\n");
    await expect(parseMemberImportFile(csvInput(tooManyRows))).rejects.toMatchObject({
      code: "too_many_rows",
      status: 413,
    });

    const tooManyColumns = `${Array.from({ length: 21 }, (_, index) => `Column ${index}`).join(",")}\n${Array.from({ length: 21 }, () => "value").join(",")}`;
    await expect(parseMemberImportFile(csvInput(tooManyColumns))).rejects.toMatchObject({
      code: "too_many_columns",
      status: 413,
    });
  });

  it("rejects invalid UTF-8 and formulas in suggested CSV fields", async () => {
    await expect(
      parseMemberImportFile({
        fileName: "members.csv",
        contentType: "text/csv",
        bytes: new Uint8Array([0xff, 0xfe, 0xfd]),
      }),
    ).rejects.toMatchObject({ code: "invalid_utf8", status: 422 });

    await expect(
      parseMemberImportFile(csvInput("Email,Name\n=LOWER(A2),Alice")),
    ).rejects.toMatchObject({ code: "formula_in_mapped_field", status: 422 });
  });

  it("records formulas in unmapped columns without blocking valid mapped fields", async () => {
    const result = await parseMemberImportFile(
      csvInput("Email,Name,Notes\nalice@example.com,Alice,=1+1"),
    );

    expect(result.rows[0].formulaColumns).toEqual([2]);
  });

  it("reads scalar values from only the first XLSX worksheet", async () => {
    const bytes = xlsxFixture(
      [
        ["Email", "Name", "Active", "Score"],
        ["alice@example.com", "Alice", true, 42],
      ],
      [
        ["Email", "Name"],
        ["ignored@example.com", "Ignored"],
      ],
    );
    const result = await parseMemberImportFile({
      fileName: "members.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes,
    });

    expect(result.format).toBe("xlsx");
    expect(result.headers).toEqual(["Email", "Name", "Active", "Score"]);
    expect(result.rows).toEqual([
      {
        rowNumber: 2,
        values: ["alice@example.com", "Alice", true, 42],
        formulaColumns: [],
      },
    ]);
  });

  it("rejects formulas in suggested XLSX fields", async () => {
    const bytes = xlsxFixture([
      ["Email", "Name"],
      [{ formula: 'LOWER("ALICE@EXAMPLE.COM")', value: "alice@example.com" }, "Alice"],
    ]);

    await expect(
      parseMemberImportFile({
        fileName: "members.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes,
      }),
    ).rejects.toMatchObject({ code: "formula_in_mapped_field", status: 422 });
  });

  it("rejects corrupt and OLE/encrypted XLSX input", async () => {
    await expect(
      parseMemberImportFile({
        fileName: "members.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes: encoder.encode("not a zip file"),
      }),
    ).rejects.toMatchObject({ code: "invalid_xlsx", status: 422 });

    await expect(
      parseMemberImportFile({
        fileName: "members.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      }),
    ).rejects.toMatchObject({ code: "encrypted_xlsx", status: 422 });
  });
});

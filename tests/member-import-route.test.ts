// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBER_IMPORT_MAX_FILE_BYTES } from "@/lib/member-import";

const getCurrentAuthIdentityMock = vi.hoisted(() => vi.fn());
const getViewerRecordByEmailAndSlugMock = vi.hoisted(() => vi.fn());
const canViewAdminRouteMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-identity", () => ({
  getCurrentAuthIdentity: getCurrentAuthIdentityMock,
}));

vi.mock("@/server/store", () => ({
  getViewerRecordByEmailAndSlug: getViewerRecordByEmailAndSlugMock,
}));

vi.mock("@/server/permissions", () => ({
  canViewAdminRoute: canViewAdminRouteMock,
}));

import { POST } from "@/app/api/admin/member-import/parse/route";

function uploadRequest(
  file?: File,
  options: {
    querySlug?: string;
    formSlug?: string;
  } = {},
) {
  const formData = new FormData();
  if (file) {
    formData.set("file", file);
  }
  if (options.formSlug) {
    formData.set("slug", options.formSlug);
  }
  const query = options.querySlug ? `?slug=${encodeURIComponent(options.querySlug)}` : "";
  return new Request(`http://localhost/api/admin/member-import/parse${query}`, {
    method: "POST",
    body: formData,
  });
}

describe("member import parse route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentAuthIdentityMock.mockResolvedValue({
      email: "admin@example.com",
      name: "Admin",
      provider: "clerk",
    });
    getViewerRecordByEmailAndSlugMock.mockResolvedValue({
      org: { id: "org_1", slug: "wavespark" },
      user: { id: "user_1" },
      membership: { id: "membership_1" },
    });
    canViewAdminRouteMock.mockReturnValue(true);
  });

  it("rejects unauthenticated callers before reading the upload", async () => {
    getCurrentAuthIdentityMock.mockResolvedValue(null);
    const response = await POST(
      new Request("http://localhost/api/admin/member-import/parse", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(getViewerRecordByEmailAndSlugMock).not.toHaveBeenCalled();
  });

  it("rejects authenticated non-admin members", async () => {
    canViewAdminRouteMock.mockReturnValue(false);
    const response = await POST(
      uploadRequest(new File(["Email\nalice@example.com"], "members.csv", { type: "text/csv" })),
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 for an unknown organization", async () => {
    getViewerRecordByEmailAndSlugMock.mockResolvedValue({});
    const response = await POST(
      uploadRequest(new File(["Email\nalice@example.com"], "members.csv", { type: "text/csv" })),
    );

    expect(response.status).toBe(404);
  });

  it("parses an authorized multipart upload without persisting the file", async () => {
    const response = await POST(
      uploadRequest(
        new File(
          ['\uFEFFEmail,Name\r\nalice@example.com,"Alice, Tan"\r\n'],
          "members.csv",
          { type: "text/csv" },
        ),
        { querySlug: "community" },
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      fileName: "members.csv",
      format: "csv",
      headers: ["Email", "Name"],
      suggestedMapping: { emailColumn: 0, nameColumn: 1 },
      rows: [
        {
          rowNumber: 2,
          values: ["alice@example.com", "Alice, Tan"],
          formulaColumns: [],
        },
      ],
    });
    expect(getViewerRecordByEmailAndSlugMock).toHaveBeenCalledWith(
      "community",
      "admin@example.com",
    );
  });

  it("accepts the organization slug from form data", async () => {
    const response = await POST(
      uploadRequest(
        new File(["Email\nalice@example.com"], "members.csv", { type: "text/csv" }),
        { formSlug: "form-community" },
      ),
    );

    expect(response.status).toBe(200);
    expect(getViewerRecordByEmailAndSlugMock).toHaveBeenCalledWith(
      "form-community",
      "admin@example.com",
    );
  });

  it("validates multipart bodies, files, size, extension, and MIME type", async () => {
    const malformed = await POST(
      new Request("http://localhost/api/admin/member-import/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(malformed.status).toBe(400);

    const missing = await POST(uploadRequest());
    expect(missing.status).toBe(400);

    const oversized = await POST(
      uploadRequest(
        new File([new Uint8Array(MEMBER_IMPORT_MAX_FILE_BYTES + 1)], "members.csv", {
          type: "text/csv",
        }),
      ),
    );
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toMatchObject({ code: "file_too_large" });

    const wrongExtension = await POST(
      uploadRequest(new File(["Email\nalice@example.com"], "members.xls", {
        type: "application/vnd.ms-excel",
      })),
    );
    expect(wrongExtension.status).toBe(415);

    const wrongMime = await POST(
      uploadRequest(new File(["Email\nalice@example.com"], "members.csv", {
        type: "image/png",
      })),
    );
    expect(wrongMime.status).toBe(415);
    await expect(wrongMime.json()).resolves.toMatchObject({
      code: "invalid_content_type",
    });
  });
});

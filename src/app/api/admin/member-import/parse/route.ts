import { getCurrentAuthIdentity } from "@/lib/auth-identity";
import { MEMBER_IMPORT_MAX_FILE_BYTES } from "@/lib/member-import";
import {
  MemberImportFileError,
  parseMemberImportFile,
} from "@/server/member-import-file";
import { canViewAdminRoute } from "@/server/permissions";
import { getViewerRecordByEmailAndSlug } from "@/server/store";

export const runtime = "nodejs";

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.size === "number" &&
    typeof value.arrayBuffer === "function"
  );
}

export async function POST(request: Request) {
  const identity = await getCurrentAuthIdentity();
  if (!identity) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const requestUrl = new URL(request.url);
  const orgSlug =
    requestUrl.searchParams.get("slug")?.trim() ||
    String(formData.get("slug") ?? formData.get("orgSlug") ?? "wavespark").trim() ||
    "wavespark";
  const viewerRecord = await getViewerRecordByEmailAndSlug(orgSlug, identity.email);

  if (!viewerRecord.org) {
    return Response.json({ error: "Organization not found." }, { status: 404 });
  }
  if (
    !viewerRecord.user ||
    !viewerRecord.membership ||
    !canViewAdminRoute(viewerRecord.user, viewerRecord.membership)
  ) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const file = formData.get("file");
  if (!isUploadFile(file)) {
    return Response.json({ error: "Missing file." }, { status: 400 });
  }
  if (file.size > MEMBER_IMPORT_MAX_FILE_BYTES) {
    return Response.json(
      { error: "The file must be 2 MB or smaller.", code: "file_too_large" },
      { status: 413 },
    );
  }

  try {
    const result = await parseMemberImportFile({
      fileName: file.name,
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof MemberImportFileError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    return Response.json(
      { error: "The member list could not be parsed." },
      { status: 500 },
    );
  }
}

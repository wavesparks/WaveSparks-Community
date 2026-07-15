import { getCurrentAuthIdentity } from "@/lib/auth-identity";
import { canViewAdminRoute } from "@/server/permissions";
import { getViewerRecordByEmailAndSlug } from "@/server/store";
import { uploadAsset } from "@/server/upload";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxLogoBytes = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const identity = await getCurrentAuthIdentity();
  if (!identity) {
    return Response.json({ error: "Sign in to upload a logo." }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  let formData: FormData | undefined;
  let slug = requestUrl.searchParams.get("slug")?.trim();
  if (!slug) {
    formData = await request.formData();
    slug = String(formData.get("slug") ?? "wavesparks").trim();
  }

  const { org, user, membership } = await getViewerRecordByEmailAndSlug(
    slug || "wavesparks",
    identity.email,
  );
  if (!org) {
    return Response.json({ error: "Community not found." }, { status: 404 });
  }

  if (!user || !membership || !canViewAdminRoute(user, membership)) {
    return Response.json(
      { error: "You don't have permission to change this logo." },
      { status: 403 },
    );
  }

  formData ??= await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Choose a logo to upload." }, { status: 400 });
  }

  if (!allowedImageTypes.has(file.type)) {
    return Response.json({ error: "Use a JPG, PNG, or WebP image." }, { status: 415 });
  }

  if (file.size > maxLogoBytes) {
    return Response.json({ error: "Choose an image that is 2 MB or smaller." }, { status: 413 });
  }

  try {
    const url = await uploadAsset({
      kind: "org-logo",
      fileName: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
    });
    return Response.json({ url });
  } catch (error) {
    console.error("[wavesparks] Community logo upload failed", error);
    return Response.json(
      { error: "We couldn't upload the logo. Please try again." },
      { status: 500 },
    );
  }
}

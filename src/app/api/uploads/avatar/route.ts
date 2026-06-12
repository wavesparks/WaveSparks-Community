import { getCurrentAuthIdentity } from "@/lib/auth-identity";
import { uploadAsset } from "@/server/upload";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAvatarBytes = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const identity = await getCurrentAuthIdentity();
  if (!identity) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  if (!allowedImageTypes.has(file.type)) {
    return Response.json({ error: "Unsupported image type" }, { status: 415 });
  }

  if (file.size > maxAvatarBytes) {
    return Response.json({ error: "Image must be 2 MB or smaller" }, { status: 413 });
  }

  try {
    const url = await uploadAsset({
      kind: "avatar",
      fileName: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
    });
    return Response.json({ url });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}

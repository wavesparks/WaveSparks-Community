import { getCurrentAuthIdentity } from "@/lib/auth-identity";
import { uploadAsset } from "@/server/upload";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAvatarBytes = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const identity = await getCurrentAuthIdentity();
  if (!identity) {
    return Response.json({ error: "Sign in to upload a profile photo." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Choose a photo to upload." }, { status: 400 });
  }

  if (!allowedImageTypes.has(file.type)) {
    return Response.json({ error: "Use a JPG, PNG, or WebP image." }, { status: 415 });
  }

  if (file.size > maxAvatarBytes) {
    return Response.json({ error: "Choose an image that is 2 MB or smaller." }, { status: 413 });
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
    console.error("[wavesparks] Profile photo upload failed", error);
    return Response.json(
      { error: "We couldn't upload your photo. Please try again." },
      { status: 500 },
    );
  }
}

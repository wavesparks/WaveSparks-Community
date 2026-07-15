import { put } from "@vercel/blob";

import { env } from "@/lib/env";

export async function uploadAsset(input: {
  kind: "avatar" | "org-logo";
  fileName: string;
  bytes: Buffer;
  contentType: string;
}) {
  if (!env.blobReadWriteToken) {
    throw new Error("Image storage is unavailable.");
  }

  const safeFileName =
    input.fileName
      .split(/[\\/]/)
      .pop()
      ?.replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "upload";
  const blob = await put(`${input.kind}/${safeFileName}`, input.bytes, {
    access: "public",
    addRandomSuffix: true,
    contentType: input.contentType,
    token: env.blobReadWriteToken,
  });

  return blob.url;
}

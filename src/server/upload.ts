import { env } from "@/lib/env";

export async function uploadAsset(input: {
  kind: "avatar" | "org-logo";
  fileName: string;
  bytes: Buffer;
  contentType: string;
}) {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("Supabase storage is not configured.");
  }

  const safeFileName =
    input.fileName
      .split(/[\\/]/)
      .pop()
      ?.replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "upload";
  const filePath = `${input.kind}/${Date.now()}-${safeFileName}`;
  const response = await fetch(
    `${env.supabaseUrl}/storage/v1/object/${env.supabaseBucket}/${filePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
        apikey: env.supabaseServiceRoleKey,
        "Content-Type": input.contentType,
        "x-upsert": "true",
      },
      body: new Uint8Array(input.bytes),
    },
  );

  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }

  return `${env.supabaseUrl}/storage/v1/object/public/${env.supabaseBucket}/${filePath}`;
}

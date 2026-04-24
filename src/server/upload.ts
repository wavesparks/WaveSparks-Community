import { env } from "@/lib/env";

export async function uploadAsset(input: {
  kind: "avatar" | "org-logo";
  fileName: string;
  bytes: Buffer;
}) {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("Supabase storage is not configured.");
  }

  const filePath = `${input.kind}/${Date.now()}-${input.fileName}`;
  const response = await fetch(
    `${env.supabaseUrl}/storage/v1/object/${env.supabaseBucket}/${filePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
        apikey: env.supabaseServiceRoleKey,
        "Content-Type": "application/octet-stream",
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

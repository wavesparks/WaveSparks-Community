import { uploadAsset } from "@/server/upload";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  try {
    const url = await uploadAsset({
      kind: "org-logo",
      fileName: file.name,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return Response.json({ url });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}

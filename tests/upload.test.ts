import { describe, expect, it, vi } from "vitest";

const putMock = vi.hoisted(() => vi.fn());

vi.mock("@vercel/blob", () => ({
  put: putMock,
}));

vi.mock("@/lib/env", () => ({
  env: {
    blobReadWriteToken: "vercel_blob_rw_test_token",
  },
}));

import { uploadAsset } from "@/server/upload";

describe("uploadAsset", () => {
  it("uploads public assets to Vercel Blob", async () => {
    const bytes = Buffer.from("image-bytes");
    putMock.mockResolvedValueOnce({
      url: "https://store.public.blob.vercel-storage.com/avatar/profile-photo-a1b2.png",
    });

    await expect(
      uploadAsset({
        kind: "avatar",
        fileName: "nested/profile photo.png",
        bytes,
        contentType: "image/png",
      }),
    ).resolves.toBe(
      "https://store.public.blob.vercel-storage.com/avatar/profile-photo-a1b2.png",
    );

    expect(putMock).toHaveBeenCalledWith("avatar/profile-photo.png", bytes, {
      access: "public",
      addRandomSuffix: true,
      contentType: "image/png",
      token: "vercel_blob_rw_test_token",
    });
  });
});

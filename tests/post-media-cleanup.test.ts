import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnvironment = {
  blobToken: process.env.BLOB_READ_WRITE_TOKEN,
  cronSecret: process.env.CRON_SECRET,
  databaseUrl: process.env.DATABASE_URL,
  e2eLocalAuth: process.env.E2E_LOCAL_AUTH_ENABLED,
  mediaStorage: process.env.POST_MEDIA_STORAGE,
  vercel: process.env.VERCEL,
};

function restoreEnvironment() {
  for (const [key, value] of Object.entries({
    BLOB_READ_WRITE_TOKEN: originalEnvironment.blobToken,
    CRON_SECRET: originalEnvironment.cronSecret,
    DATABASE_URL: originalEnvironment.databaseUrl,
    E2E_LOCAL_AUTH_ENABLED: originalEnvironment.e2eLocalAuth,
    POST_MEDIA_STORAGE: originalEnvironment.mediaStorage,
    VERCEL: originalEnvironment.vercel,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("post media cleanup", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    restoreEnvironment();
  });

  it("removes old staged rows and untracked Blob objects but keeps recent media", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "";
    process.env.CRON_SECRET = "cleanup-test-secret";
    process.env.DATABASE_URL = "";
    process.env.E2E_LOCAL_AUTH_ENABLED = "1";
    process.env.POST_MEDIA_STORAGE = "memory";
    process.env.VERCEL = "";
    vi.resetModules();

    const oldTime = new Date("2026-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(oldTime);

    const storage = await import("@/server/post-media-storage");
    const store = await import("@/server/store");
    const { GET } = await import("@/app/api/internal/post-media/cleanup/route");
    store.resetStore();
    storage.resetMemoryPostMediaStorage();

    const stagedPath = "post-images/spc_test/mem_test/pimg_cleanup_staged/raw.png";
    const processedPath =
      "post-images/spc_test/mem_test/pimg_cleanup_staged/__wavesparks_processed__.webp";
    const untrackedPath = "post-link-previews/spc_test/untracked/thumbnail.webp";
    await store.createStagedPostImage({
      id: "pimg_cleanup_staged",
      orgId: "org_test",
      spaceId: "spc_test",
      uploaderMembershipId: "mem_test",
      blobPathname: stagedPath,
      contentType: "image/png",
      sizeBytes: 3,
      position: 0,
      uploadStatus: "staged",
      moderationStatus: "visible",
      createdAt: oldTime.toISOString(),
      updatedAt: oldTime.toISOString(),
    });
    await Promise.all([
      storage.putPrivateMedia({
        pathname: stagedPath,
        bytes: new Uint8Array([1, 2, 3]),
        contentType: "image/png",
      }),
      storage.putPrivateMedia({
        pathname: processedPath,
        bytes: new Uint8Array([4, 5, 6]),
        contentType: "image/webp",
      }),
      storage.putPrivateMedia({
        pathname: untrackedPath,
        bytes: new Uint8Array([7, 8, 9]),
        contentType: "image/webp",
      }),
    ]);

    vi.setSystemTime(new Date("2026-01-02T02:00:00.000Z"));
    const recentPath = "post-images/spc_test/untracked/recent.webp";
    await storage.putPrivateMedia({
      pathname: recentPath,
      bytes: new Uint8Array([10, 11, 12]),
      contentType: "image/webp",
    });

    const response = await GET(
      new Request("http://localhost/api/internal/post-media/cleanup", {
        headers: { Authorization: "Bearer cleanup-test-secret" },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      deletedImages: 1,
      deletedUntrackedBlobs: 1,
      ok: true,
    });
    await expect(store.getPostImageById("pimg_cleanup_staged")).resolves.toBeUndefined();
    await expect(storage.getPrivateMedia(stagedPath)).resolves.toBeNull();
    await expect(storage.getPrivateMedia(processedPath)).resolves.toBeNull();
    await expect(storage.getPrivateMedia(untrackedPath)).resolves.toBeNull();
    await expect(storage.getPrivateMedia(recentPath)).resolves.not.toBeNull();
  });
});

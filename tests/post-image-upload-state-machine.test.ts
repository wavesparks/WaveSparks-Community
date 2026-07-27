// @vitest-environment node

import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleUpload: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({
  handleUpload: mocks.handleUpload,
}));

vi.mock("@/lib/space-auth", () => ({
  requireSpaceAccessForAction: mocks.requireAccess,
}));

interface UploadCallbacks {
  onBeforeGenerateToken: (
    pathname: string,
    clientPayload: string,
  ) => Promise<{ tokenPayload?: string }>;
  onUploadCompleted: (input: {
    blob: { pathname: string };
    tokenPayload?: string;
  }) => Promise<void>;
}

const originalEnvironment = {
  blobToken: process.env.BLOB_READ_WRITE_TOKEN,
  databaseUrl: process.env.DATABASE_URL,
  e2eLocalAuth: process.env.E2E_LOCAL_AUTH_ENABLED,
  mediaStorage: process.env.POST_MEDIA_STORAGE,
  vercel: process.env.VERCEL,
};

let route: typeof import("@/app/api/org/[slug]/spaces/[spaceId]/post-images/upload/route");
let storage: typeof import("@/server/post-media-storage");
let store: typeof import("@/server/store");

const ORG_ID = "org_upload_state_test";
const OWNER_ID = "mem_upload_owner";
const OTHER_MEMBER_ID = "mem_upload_other";
const SPACE_ID = "spc_upload_state_test";
const SLUG = "upload-state-test";

function restoreEnvironment() {
  for (const [key, value] of Object.entries({
    BLOB_READ_WRITE_TOKEN: originalEnvironment.blobToken,
    DATABASE_URL: originalEnvironment.databaseUrl,
    E2E_LOCAL_AUTH_ENABLED: originalEnvironment.e2eLocalAuth,
    POST_MEDIA_STORAGE: originalEnvironment.mediaStorage,
    VERCEL: originalEnvironment.vercel,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function accessFor(membershipId = OWNER_ID) {
  return {
    viewer: {
      membership: { id: membershipId },
      org: { id: ORG_ID, slug: SLUG },
    },
    space: { id: SPACE_ID },
  };
}

function context(spaceId = SPACE_ID) {
  return { params: Promise.resolve({ slug: SLUG, spaceId }) };
}

function routeRequest(method: "DELETE" | "GET" | "POST", query = "") {
  return new Request(
    `http://localhost/api/org/${SLUG}/spaces/${SPACE_ID}/post-images/upload${query}`,
    {
      method,
      ...(method === "POST"
        ? {
            body: JSON.stringify({ type: "blob.generate-client-token" }),
            headers: { "Content-Type": "application/json" },
          }
        : {}),
    },
  );
}

function stagedImage(input: { id: string; membershipId?: string; pathname?: string }) {
  const timestamp = new Date().toISOString();
  return {
    id: input.id,
    orgId: ORG_ID,
    spaceId: SPACE_ID,
    uploaderMembershipId: input.membershipId ?? OWNER_ID,
    blobPathname:
      input.pathname ??
      `post-images/${SPACE_ID}/${input.membershipId ?? OWNER_ID}/${input.id}/raw-upload`,
    contentType: "image/png" as const,
    sizeBytes: 128,
    position: 0,
    uploadStatus: "staged" as const,
    moderationStatus: "visible" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

beforeAll(async () => {
  process.env.BLOB_READ_WRITE_TOKEN = "test_blob_token";
  delete process.env.DATABASE_URL;
  process.env.E2E_LOCAL_AUTH_ENABLED = "1";
  process.env.POST_MEDIA_STORAGE = "memory";
  delete process.env.VERCEL;
  vi.resetModules();

  storage = await import("@/server/post-media-storage");
  store = await import("@/server/store");
  route = await import(
    "@/app/api/org/[slug]/spaces/[spaceId]/post-images/upload/route"
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  store.resetStore();
  storage.resetMemoryPostMediaStorage();
  mocks.requireAccess.mockResolvedValue(accessFor());
});

afterAll(() => {
  restoreEnvironment();
  vi.resetModules();
});

describe("post image upload state machine", () => {
  it("lets only one concurrent staged-to-processing claim advance to ready", async () => {
    const image = stagedImage({ id: "pimg_atomic_claim_001" });
    await store.createStagedPostImage(image);

    const claims = await Promise.all([
      store.updatePostImageUpload(
        image.id,
        { uploadStatus: "processing" },
        { blobPathname: image.blobPathname, uploadStatus: "staged" },
      ),
      store.updatePostImageUpload(
        image.id,
        { uploadStatus: "processing" },
        { blobPathname: image.blobPathname, uploadStatus: "staged" },
      ),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(
      store.updatePostImageUpload(
        image.id,
        { uploadStatus: "ready", width: 4, height: 3 },
        { blobPathname: image.blobPathname, uploadStatus: "staged" },
      ),
    ).resolves.toBeNull();
    await expect(
      store.updatePostImageUpload(
        image.id,
        { uploadStatus: "ready", width: 4, height: 3 },
        { blobPathname: image.blobPathname, uploadStatus: "processing" },
      ),
    ).resolves.toMatchObject({ uploadStatus: "ready", width: 4, height: 3 });
  });

  it("processes duplicate concurrent completion callbacks only through the conditional state path", async () => {
    const imageId = "pimg_duplicate_callback_001";
    const rawPathname = `post-images/${SPACE_ID}/${OWNER_ID}/${imageId}/photo.png`;
    const source = await sharp({
      create: {
        width: 7,
        height: 5,
        channels: 3,
        background: "#5d4dff",
      },
    })
      .jpeg()
      .toBuffer();
    const observedStatuses: string[] = [];

    mocks.handleUpload.mockImplementationOnce(async (callbacks: UploadCallbacks) => {
      const token = await callbacks.onBeforeGenerateToken(
        rawPathname,
        JSON.stringify({
          imageId,
          // The callback must replace client-claimed metadata with processed reality.
          sizeBytes: 1,
          contentType: "image/png",
          fileName: "photo.png",
        }),
      );
      observedStatuses.push((await store.getPostImageById(imageId))?.uploadStatus ?? "missing");
      await storage.putPrivateMedia({
        pathname: rawPathname,
        bytes: source,
        contentType: "image/png",
      });

      const completion = {
        blob: { pathname: rawPathname },
        tokenPayload: token.tokenPayload,
      };
      await Promise.all([
        callbacks.onUploadCompleted(completion),
        callbacks.onUploadCompleted(completion),
      ]);
      // A later provider retry must also be a no-op once the row is ready.
      await callbacks.onUploadCompleted(completion);
      return { ok: true };
    });

    const response = await route.POST(routeRequest("POST"), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(observedStatuses).toEqual(["staged"]);
    const image = await store.getPostImageById(imageId);
    expect(image).toMatchObject({
      blobPathname: `post-images/${SPACE_ID}/${OWNER_ID}/${imageId}/__wavesparks_processed__.webp`,
      contentType: "image/webp",
      height: 5,
      uploadStatus: "ready",
      width: 7,
    });
    expect(image?.sizeBytes).toBeGreaterThan(1);
    await expect(storage.getPrivateMedia(rawPathname)).resolves.toBeNull();

    const processedMedia = await storage.getPrivateMedia(image!.blobPathname);
    expect(processedMedia?.size).toBe(image?.sizeBytes);
    const processedBytes = Buffer.from(
      await new Response(processedMedia!.stream).arrayBuffer(),
    );
    await expect(sharp(processedBytes).metadata()).resolves.toMatchObject({
      format: "webp",
      height: 5,
      width: 7,
    });
  });

  it("uses actual callback bytes for size and format rejection", async () => {
    const scenarios = [
      {
        id: "pimg_fake_format_001",
        bytes: new TextEncoder().encode("not a real PNG"),
        error: /genuine JPG, PNG, or WebP/i,
      },
      {
        id: "pimg_real_size_001",
        bytes: new Uint8Array(5 * 1024 * 1024 + 1),
        error: /too large/i,
      },
    ];

    for (const scenario of scenarios) {
      const rawPathname = `post-images/${SPACE_ID}/${OWNER_ID}/${scenario.id}/photo.png`;
      mocks.handleUpload.mockImplementationOnce(async (callbacks: UploadCallbacks) => {
        const token = await callbacks.onBeforeGenerateToken(
          rawPathname,
          JSON.stringify({
            imageId: scenario.id,
            sizeBytes: 1,
            contentType: "image/png",
            fileName: "photo.png",
          }),
        );
        await storage.putPrivateMedia({
          pathname: rawPathname,
          bytes: scenario.bytes,
          contentType: "image/png",
        });
        await callbacks.onUploadCompleted({
          blob: { pathname: rawPathname },
          tokenPayload: token.tokenPayload,
        });
        return { ok: true };
      });

      const response = await route.POST(routeRequest("POST"), context());
      expect(response.status).toBe(200);
      await expect(store.getPostImageById(scenario.id)).resolves.toMatchObject({
        uploadStatus: "failed",
        uploadError: expect.stringMatching(scenario.error),
      });
      await expect(storage.getPrivateMedia(rawPathname)).resolves.toBeNull();
      await expect(
        storage.getPrivateMedia(
          `post-images/${SPACE_ID}/${OWNER_ID}/${scenario.id}/__wavesparks_processed__.webp`,
        ),
      ).resolves.toBeNull();
    }
  });

  it("does not expose or delete another member's staged image", async () => {
    const image = stagedImage({ id: "pimg_staged_owner_001" });
    await store.createStagedPostImage(image);
    await storage.putPrivateMedia({
      pathname: image.blobPathname,
      bytes: new Uint8Array([1, 2, 3]),
      contentType: image.contentType,
    });
    mocks.requireAccess.mockResolvedValue(accessFor(OTHER_MEMBER_ID));

    const query = `?imageId=${encodeURIComponent(image.id)}`;
    const forbiddenRead = await route.GET(routeRequest("GET", query), context());
    const forbiddenDelete = await route.DELETE(
      routeRequest("DELETE", query),
      context(),
    );

    expect(forbiddenRead.status).toBe(404);
    expect(forbiddenDelete.status).toBe(404);
    await expect(store.getPostImageById(image.id)).resolves.toMatchObject({
      uploaderMembershipId: OWNER_ID,
      uploadStatus: "staged",
    });
    await expect(storage.getPrivateMedia(image.blobPathname)).resolves.not.toBeNull();

    mocks.requireAccess.mockResolvedValue(accessFor(OWNER_ID));
    const ownerRead = await route.GET(routeRequest("GET", query), context());
    expect(ownerRead.status).toBe(200);
    await expect(ownerRead.json()).resolves.toMatchObject({
      image: { id: image.id, status: "staged" },
    });
    const ownerDelete = await route.DELETE(routeRequest("DELETE", query), context());
    expect(ownerDelete.status).toBe(200);
    await expect(store.getPostImageById(image.id)).resolves.toBeUndefined();
    await expect(storage.getPrivateMedia(image.blobPathname)).resolves.toBeNull();
  });
});

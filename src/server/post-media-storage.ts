import { env } from "@/lib/env";

interface StoredMedia {
  bytes: Uint8Array;
  contentType: string;
  uploadedAt: string;
}

export interface PrivateMediaRead {
  stream: ReadableStream<Uint8Array>;
  contentType: string;
  size: number;
}

export interface PrivateMediaListing {
  pathname: string;
  uploadedAt: Date;
}

declare global {
  var __wavesparksPostMedia: Map<string, StoredMedia> | undefined;
}

function memoryMediaStorageIsIsolated() {
  return (
    process.env.E2E_LOCAL_AUTH_ENABLED === "1" &&
    !env.databaseUrl &&
    !process.env.VERCEL
  );
}

function usesMemoryMediaStorage() {
  if (process.env.POST_MEDIA_STORAGE !== "memory") return false;

  if (!memoryMediaStorageIsIsolated()) {
    throw new Error("The in-memory media store is restricted to isolated local E2E runs.");
  }
  return true;
}

function memoryStore() {
  globalThis.__wavesparksPostMedia ??= new Map<string, StoredMedia>();
  return globalThis.__wavesparksPostMedia;
}

export function isPostMediaStorageConfigured() {
  return (
    Boolean(env.postMediaReadWriteToken) ||
    (process.env.POST_MEDIA_STORAGE === "memory" && memoryMediaStorageIsIsolated())
  );
}

export function isMemoryPostMediaStorage() {
  return usesMemoryMediaStorage();
}

export function getPostMediaStorageMode() {
  if (process.env.POST_MEDIA_STORAGE === "memory" && memoryMediaStorageIsIsolated()) {
    return "memory" as const;
  }
  return env.postMediaReadWriteToken ? ("blob" as const) : undefined;
}

export async function putPrivateMedia(input: {
  pathname: string;
  bytes: Uint8Array;
  contentType: string;
}) {
  if (usesMemoryMediaStorage()) {
    memoryStore().set(input.pathname, {
      bytes: new Uint8Array(input.bytes),
      contentType: input.contentType,
      uploadedAt: new Date().toISOString(),
    });
    return { pathname: input.pathname };
  }

  if (!env.postMediaReadWriteToken) {
    throw new Error("Private media storage is unavailable.");
  }
  const { put } = await import("@vercel/blob");
  const blob = await put(input.pathname, Buffer.from(input.bytes), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: input.contentType,
    token: env.postMediaReadWriteToken,
  });
  return { pathname: blob.pathname };
}

export async function listPrivateMedia(
  prefix: string,
): Promise<PrivateMediaListing[]> {
  if (usesMemoryMediaStorage()) {
    return [...memoryStore().entries()]
      .filter(([pathname]) => pathname.startsWith(prefix))
      .map(([pathname, media]) => ({
        pathname,
        uploadedAt: new Date(media.uploadedAt),
      }));
  }
  if (!env.postMediaReadWriteToken) return [];

  const { list } = await import("@vercel/blob");
  const media: PrivateMediaListing[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({
      cursor,
      limit: 1_000,
      prefix,
      token: env.postMediaReadWriteToken,
    });
    media.push(
      ...page.blobs.map((blob) => ({
        pathname: blob.pathname,
        uploadedAt: blob.uploadedAt,
      })),
    );
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return media;
}

export async function getPrivateMedia(pathname: string): Promise<PrivateMediaRead | null> {
  if (usesMemoryMediaStorage()) {
    const media = memoryStore().get(pathname);
    if (!media) return null;
    const bytes = new Uint8Array(media.bytes);
    return {
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      contentType: media.contentType,
      size: bytes.byteLength,
    };
  }

  if (!env.postMediaReadWriteToken) return null;
  const { get } = await import("@vercel/blob");
  const result = await get(pathname, {
    access: "private",
    token: env.postMediaReadWriteToken,
  });
  if (!result || result.statusCode === 304 || !result.stream) return null;
  return {
    stream: result.stream,
    contentType: result.blob.contentType ?? "application/octet-stream",
    size: result.blob.size ?? 0,
  };
}

export async function deletePrivateMedia(pathname: string) {
  if (usesMemoryMediaStorage()) {
    memoryStore().delete(pathname);
    return;
  }
  if (!env.postMediaReadWriteToken) return;
  const { del } = await import("@vercel/blob");
  await del(pathname, { token: env.postMediaReadWriteToken });
}

export function resetMemoryPostMediaStorage() {
  if (process.env.POST_MEDIA_STORAGE === "memory") {
    globalThis.__wavesparksPostMedia = new Map();
  }
}

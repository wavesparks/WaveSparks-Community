import sharp from "sharp";

export const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const POST_IMAGE_MAX_COUNT = 4;
export const POST_IMAGE_MAX_PIXELS = 40_000_000;
export const POST_IMAGE_MAX_EDGE = 2_400;
export const POST_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export interface ProcessedPostImage {
  bytes: Uint8Array;
  contentType: "image/webp";
  width: number;
  height: number;
}

export function supportedPostImageFormat(bytes: Uint8Array) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg" as const;
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png" as const;
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp" as const;
  }
  return undefined;
}

export function safePostImageFileName(fileName: string) {
  return (
    fileName
      .split(/[\\/]/)
      .pop()
      ?.replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "upload"
  );
}

export function expectedPostImagePathPrefix(input: {
  spaceId: string;
  membershipId: string;
  imageId: string;
}) {
  return `post-images/${input.spaceId}/${input.membershipId}/${input.imageId}/`;
}

export function processedPostImagePath(input: {
  spaceId: string;
  membershipId: string;
  imageId: string;
}) {
  return `${expectedPostImagePathPrefix(input)}__wavesparks_processed__.webp`;
}

export async function processPostImage(bytes: Uint8Array): Promise<ProcessedPostImage> {
  if (!bytes.byteLength || bytes.byteLength > POST_IMAGE_MAX_BYTES) {
    throw new Error("Each image must be 5 MB or smaller.");
  }
  const detectedFormat = supportedPostImageFormat(bytes);
  if (!detectedFormat) {
    throw new Error("Use a genuine JPG, PNG, or WebP image.");
  }

  const pipeline = sharp(bytes, {
    animated: false,
    failOn: "warning",
    limitInputPixels: POST_IMAGE_MAX_PIXELS,
  });
  const metadata = await pipeline.metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.format !== detectedFormat
  ) {
    throw new Error("Use a genuine JPG, PNG, or WebP image.");
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new Error("Animated images are not supported.");
  }
  if (metadata.width * metadata.height > POST_IMAGE_MAX_PIXELS) {
    throw new Error("The image dimensions are too large.");
  }

  const { data, info } = await pipeline
    .rotate()
    .resize({
      width: POST_IMAGE_MAX_EDGE,
      height: POST_IMAGE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 86, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  if (data.byteLength > POST_IMAGE_MAX_BYTES) {
    throw new Error("The processed image is still too large.");
  }

  return {
    bytes: new Uint8Array(data),
    contentType: "image/webp",
    width: info.width,
    height: info.height,
  };
}

export async function readStreamWithLimit(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("The uploaded image is too large.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

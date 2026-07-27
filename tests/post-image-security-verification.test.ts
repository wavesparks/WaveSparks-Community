import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  POST_IMAGE_MAX_BYTES,
  POST_IMAGE_MAX_EDGE,
  expectedPostImagePathPrefix,
  processPostImage,
  readStreamWithLimit,
  safePostImageFileName,
} from "@/server/post-image-processing";

const ANIMATED_WEBP = Buffer.from(
  "UklGRpQAAABXRUJQVlA4WAoAAAACAAAAAAAAAAAAQU5JTQYAAAD/////AABBTk1GMAAAAAAAAAAAAAAAAAAAAGQAAAJWUDggGAAAADABAJ0BKgEAAQABQCYlpAADcAD+/TZoAEFOTUYwAAAAAAAAAAAAAAAAAAAAZAAAAFZQOCAYAAAANAEAnQEqAQABAAAAJiWkAANwAP789AAA",
  "base64",
);

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function pngWithDeclaredDimensions(width: number, height: number) {
  const png = await sharp({
    create: {
      width: 1,
      height: 1,
      channels: 3,
      background: "#123456",
    },
  })
    .png()
    .toBuffer();
  const forged = Buffer.from(png);
  forged.writeUInt32BE(width, 16);
  forged.writeUInt32BE(height, 20);
  forged.writeUInt32BE(crc32(forged.subarray(12, 29)), 29);
  return forged;
}

describe("post image security processing", () => {
  it("decodes the real bytes, applies EXIF orientation, strips metadata, and emits WebP", async () => {
    const jpeg = await sharp({
      create: {
        width: 4,
        height: 2,
        channels: 3,
        background: "#336699",
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const processed = await processPostImage(jpeg);
    const metadata = await sharp(processed.bytes).metadata();

    expect(processed.contentType).toBe("image/webp");
    expect({ width: processed.width, height: processed.height }).toEqual({
      width: 2,
      height: 4,
    });
    expect(metadata).toMatchObject({
      format: "webp",
      width: 2,
      height: 4,
      hasProfile: false,
    });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it("shrinks an oversized edge without enlarging the other dimension", async () => {
    const png = await sharp({
      create: {
        width: 3_000,
        height: 1_000,
        channels: 3,
        background: "#abcdef",
      },
    })
      .png()
      .toBuffer();

    const processed = await processPostImage(png);

    expect(processed.width).toBe(POST_IMAGE_MAX_EDGE);
    expect(processed.height).toBe(800);
  });

  it("rejects SVG, fake image bytes, and animated WebP", async () => {
    await expect(
      processPostImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).rejects.toThrow();
    await expect(processPostImage(Buffer.from("not actually a png"))).rejects.toThrow();
    await expect(processPostImage(ANIMATED_WEBP)).rejects.toThrow(
      "Animated images are not supported.",
    );
  });

  it("rejects empty, over-limit, and pixel-bomb inputs before output", async () => {
    await expect(processPostImage(new Uint8Array())).rejects.toThrow(
      "Each image must be 5 MB or smaller.",
    );
    await expect(
      processPostImage(new Uint8Array(POST_IMAGE_MAX_BYTES + 1)),
    ).rejects.toThrow("Each image must be 5 MB or smaller.");

    const pixelBomb = await pngWithDeclaredDimensions(10_000, 10_000);
    await expect(processPostImage(pixelBomb)).rejects.toThrow();
  });

  it("enforces stream limits even when the excess arrives in a later chunk", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
        controller.close();
      },
    });

    await expect(readStreamWithLimit(stream, 3)).rejects.toThrow(
      "The uploaded image is too large.",
    );
  });

  it("keeps generated paths scoped and removes path syntax from user filenames", () => {
    expect(
      expectedPostImagePathPrefix({
        spaceId: "space_a",
        membershipId: "member_b",
        imageId: "pimg_c",
      }),
    ).toBe("post-images/space_a/member_b/pimg_c/");
    expect(safePostImageFileName("../../private\\secret name.png")).toBe(
      "secret-name.png",
    );
  });
});

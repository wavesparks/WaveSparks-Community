"use client";

import { upload } from "@vercel/blob/client";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type StagedPostImageStatus = "uploading" | "processing" | "ready" | "failed";

export interface StagedPostImage {
  alt: string;
  error?: string;
  file: File;
  height?: number;
  id: string;
  localUrl: string;
  progress: number;
  readUrl?: string;
  sizeBytes?: number;
  status: StagedPostImageStatus;
  width?: number;
}

interface ProcessedImageResponse {
  error?: string;
  height?: number;
  readUrl?: string;
  sizeBytes?: number;
  status?: StagedPostImageStatus | "uploaded";
  width?: number;
}

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 4;
const STATUS_POLL_INTERVAL_MS = 750;
const UPLOAD_TIMEOUT_MS = 2 * 60 * 1000;
const STATUS_POLL_ATTEMPTS = Math.ceil(UPLOAD_TIMEOUT_MS / STATUS_POLL_INTERVAL_MS);

function sanitizeFileName(name: string) {
  const normalized = name.normalize("NFKD").toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  const extension = dotIndex >= 0 ? normalized.slice(dotIndex).replace(/[^.a-z0-9]/gu, "") : "";
  const base = (dotIndex >= 0 ? normalized.slice(0, dotIndex) : normalized)
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return `${base || "image"}${extension}`;
}

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"));
      return;
    }
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export function PostImageUploadField({
  endpoint,
  images,
  membershipId,
  memoryUpload = false,
  setImages,
  spaceId,
}: {
  endpoint: string;
  images: StagedPostImage[];
  membershipId: string;
  memoryUpload?: boolean;
  setImages: Dispatch<SetStateAction<StagedPostImage[]>>;
  spaceId: string;
}) {
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const localUrls = useRef<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const urls = localUrls.current;
    const controllers = abortControllers.current;
    return () => {
      controllers.forEach((controller) => controller.abort());
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function updateImage(id: string, update: Partial<StagedPostImage>) {
    setImages((current) =>
      current.map((image) => (image.id === id ? { ...image, ...update } : image)),
    );
  }

  function markImageProcessing(id: string) {
    setImages((current) =>
      current.map((image) =>
        image.id === id &&
        (image.status === "uploading" || image.status === "processing")
          ? { ...image, error: undefined, progress: 100, status: "processing" }
          : image,
      ),
    );
  }

  async function pollUntilReady(image: StagedPostImage, signal: AbortSignal) {
    for (let attempt = 0; attempt < STATUS_POLL_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await wait(STATUS_POLL_INTERVAL_MS, signal);
      const response = await fetch(`${endpoint}?imageId=${encodeURIComponent(image.id)}`, {
        cache: "no-store",
        signal,
      });
      const payload = (await response.json().catch(() => ({}))) as
        | (ProcessedImageResponse & { image?: ProcessedImageResponse })
        | undefined;
      const record = payload?.image ?? payload ?? {};

      if (response.status === 404) continue;
      if (!response.ok) {
        throw new Error(record.error || "We couldn't finish processing this image.");
      }
      if (record.status === "failed") {
        throw new Error(record.error || "This image could not be processed.");
      }
      if (record.status === "processing" || record.status === "uploaded") {
        markImageProcessing(image.id);
      }
      if (record.status === "ready" && record.readUrl) {
        updateImage(image.id, {
          error: undefined,
          height: record.height,
          progress: 100,
          readUrl: record.readUrl,
          sizeBytes: record.sizeBytes,
          status: "ready",
          width: record.width,
        });
        return;
      }
    }

    throw new Error("Image processing is taking longer than expected. Try again.");
  }

  async function uploadImage(image: StagedPostImage) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, UPLOAD_TIMEOUT_MS);
    abortControllers.current.set(image.id, controller);
    updateImage(image.id, { error: undefined, progress: 0, status: "uploading" });

    try {
      if (memoryUpload) {
        const formData = new FormData();
        formData.set("file", image.file);
        formData.set("imageId", image.id);
        updateImage(image.id, { progress: 35 });
        const response = await fetch(endpoint, {
          body: formData,
          method: "POST",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as
          | (ProcessedImageResponse & { image?: ProcessedImageResponse })
          | undefined;
        const record = payload?.image ?? payload ?? {};
        if (!response.ok || record.status !== "ready" || !record.readUrl) {
          throw new Error(record.error || "We couldn't finish processing this image.");
        }
        updateImage(image.id, {
          error: undefined,
          height: record.height,
          progress: 100,
          readUrl: record.readUrl,
          sizeBytes: record.sizeBytes,
          status: "ready",
          width: record.width,
        });
        return;
      }
      const pathname = `post-images/${spaceId}/${membershipId}/${image.id}/${sanitizeFileName(image.file.name)}`;
      const uploadPromise = upload(pathname, image.file, {
        abortSignal: controller.signal,
        access: "private",
        clientPayload: JSON.stringify({
          contentType: image.file.type,
          fileName: image.file.name,
          imageId: image.id,
          sizeBytes: image.file.size,
        }),
        contentType: image.file.type,
        handleUploadUrl: endpoint,
        onUploadProgress: ({ percentage }) => {
          updateImage(image.id, {
            progress: Math.max(0, Math.min(100, Math.round(percentage))),
          });
        },
      }).then(() => {
        markImageProcessing(image.id);
      });
      const statusPromise = pollUntilReady(image, controller.signal);
      await Promise.race([
        statusPromise,
        uploadPromise.then(() => statusPromise),
      ]);
    } catch (error) {
      if (timedOut) {
        updateImage(image.id, {
          error: "Image upload timed out. Check your connection and try again.",
          status: "failed",
        });
        return;
      }
      if (controller.signal.aborted) return;
      updateImage(image.id, {
        error: error instanceof Error ? error.message : "Image upload failed.",
        status: "failed",
      });
    } finally {
      window.clearTimeout(timeout);
      controller.abort();
      abortControllers.current.delete(image.id);
    }
  }

  async function deleteRemoteImage(imageId: string) {
    await fetch(`${endpoint}?imageId=${encodeURIComponent(imageId)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }

  async function removeImage(image: StagedPostImage) {
    abortControllers.current.get(image.id)?.abort();
    abortControllers.current.delete(image.id);
    setImages((current) => current.filter((item) => item.id !== image.id));
    localUrls.current.delete(image.localUrl);
    URL.revokeObjectURL(image.localUrl);
    await deleteRemoteImage(image.id);
  }

  async function retryImage(image: StagedPostImage) {
    const retriedImage = {
      ...image,
      error: undefined,
      id: `pimg_${crypto.randomUUID()}`,
      progress: 0,
      status: "uploading" as const,
    };
    setImages((current) =>
      current.map((candidate) =>
        candidate.id === image.id ? retriedImage : candidate,
      ),
    );
    await deleteRemoteImage(image.id);
    await uploadImage(retriedImage);
  }

  function addFiles(files: File[]) {
    setMessage(null);
    const availableSlots = Math.max(0, MAX_IMAGES - images.length);
    const accepted: StagedPostImage[] = [];
    const errors: string[] = [];
    let exceededLimit = false;

    for (const file of files) {
      if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
        errors.push(`${file.name}: choose a JPG, PNG, or WebP image.`);
        continue;
      }
      if (file.size <= 0) {
        errors.push(`${file.name}: the image file is empty.`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        errors.push(`${file.name}: images must be 5 MB or smaller.`);
        continue;
      }
      if (accepted.length >= availableSlots) {
        exceededLimit = true;
        continue;
      }

      const localUrl = URL.createObjectURL(file);
      localUrls.current.add(localUrl);
      accepted.push({
        alt: "",
        file,
        id: `pimg_${crypto.randomUUID()}`,
        localUrl,
        progress: 0,
        status: "uploading",
      });
    }

    if (exceededLimit) errors.push(`You can attach up to ${MAX_IMAGES} images.`);
    if (errors.length) setMessage(errors.join(" "));
    if (!accepted.length) return;

    setImages((current) => [...current, ...accepted]);
    accepted.forEach((image) => void uploadImage(image));
  }

  function moveImage(imageId: string, direction: -1 | 1) {
    setImages((current) => {
      const index = current.findIndex((image) => image.id === imageId);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[destination]] = [
        reordered[destination],
        reordered[index],
      ];
      return reordered;
    });
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
      <legend className="sr-only">Images</legend>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[var(--ink)]">Images</p>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
            Add up to four JPG, PNG, or WebP images, 5 MB each.
          </p>
        </div>
        <label
          className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] ring-1 ring-[var(--line)] transition hover:bg-[var(--cyan-soft)] has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50"
          htmlFor="post-image-files"
        >
          <ImagePlus className="size-4" aria-hidden="true" />
          Add images
        </label>
        <Input
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={images.length >= MAX_IMAGES}
          id="post-image-files"
          multiple
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
          type="file"
        />
      </div>

      {message ? (
        <p aria-live="polite" className="flex items-start gap-2 text-xs text-red-700">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {message}
        </p>
      ) : null}

      {images.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {images.map((image, index) => (
            <div
              className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]"
              key={image.id}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[var(--accent-soft)]">
                <Image
                  alt={image.alt || "Image preview"}
                  className="absolute inset-0 size-full object-cover"
                  height={image.height || 900}
                  sizes="(max-width: 640px) 100vw, 360px"
                  src={image.localUrl}
                  unoptimized
                  width={image.width || 1200}
                />
                <div
                  aria-live="polite"
                  className="absolute inset-x-0 bottom-0 bg-[linear-gradient(transparent,rgba(34,27,68,0.82))] px-3 pb-2 pt-8 text-xs font-semibold text-white"
                >
                  {image.status === "uploading" ? `${image.progress}% uploaded` : null}
                  {image.status === "processing" ? "Processing image…" : null}
                  {image.status === "ready" ? "Ready" : null}
                  {image.status === "failed" ? "Upload failed" : null}
                </div>
              </div>

              <div className="space-y-3 p-3">
                {image.status === "uploading" ? (
                  <progress
                    aria-label={`Upload progress for image ${index + 1}`}
                    className="h-1.5 w-full accent-[var(--accent)]"
                    max={100}
                    value={image.progress}
                  />
                ) : null}
                {image.status === "processing" ? (
                  <p className="flex items-center gap-2 text-xs text-[var(--ink-soft)]">
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                    Validating and optimizing…
                  </p>
                ) : null}
                {image.error ? (
                  <p className="text-xs leading-5 text-red-700">{image.error}</p>
                ) : null}

                <div>
                  <Label htmlFor={`post-image-alt-${image.id}`}>
                    Alt text <span className="font-normal text-[var(--ink-soft)]">(optional)</span>
                  </Label>
                  <Input
                    id={`post-image-alt-${image.id}`}
                    maxLength={300}
                    onChange={(event) => updateImage(image.id, { alt: event.target.value })}
                    placeholder="Describe this image"
                    value={image.alt}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    aria-label={`Move image ${index + 1} left`}
                    disabled={index === 0}
                    onClick={() => moveImage(image.id, -1)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <ArrowLeft className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    aria-label={`Move image ${index + 1} right`}
                    disabled={index === images.length - 1}
                    onClick={() => moveImage(image.id, 1)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Button>
                  {image.status === "failed" ? (
                    <Button
                      onClick={() => void retryImage(image)}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <RefreshCw className="size-3.5" aria-hidden="true" />
                      Retry
                    </Button>
                  ) : null}
                  <Button
                    aria-label={`Remove image ${index + 1}`}
                    className="ml-auto"
                    onClick={() => void removeImage(image)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

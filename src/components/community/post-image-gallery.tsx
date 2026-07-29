"use client";

import { ArrowLeft, ArrowRight, Maximize2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface PostImageGalleryItem {
  alt?: string;
  height: number;
  id: string;
  position?: number;
  url: string;
  width: number;
}

function isSafeSameOriginPath(value: string) {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

export function PostImageGallery({
  className,
  compact = false,
  images,
}: {
  className?: string;
  compact?: boolean;
  images?: PostImageGalleryItem[];
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const returnFocusIndex = useRef<number | null>(null);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const visibleImages = (images ?? [])
    .filter((image) => isSafeSameOriginPath(image.url))
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
  const selectedImage = selectedIndex === null ? undefined : visibleImages[selectedIndex];

  useEffect(() => {
    if (selectedIndex !== null || returnFocusIndex.current === null) return;
    const index = returnFocusIndex.current;
    returnFocusIndex.current = null;
    const timeout = window.setTimeout(() => triggerRefs.current[index]?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [selectedIndex]);

  function imageAlt(image: PostImageGalleryItem, index: number) {
    return image.alt?.trim() || `Post image ${index + 1}`;
  }

  function moveSelection(direction: -1 | 1) {
    setSelectedIndex((current) => {
      if (current === null || visibleImages.length < 2) return current;
      return (current + direction + visibleImages.length) % visibleImages.length;
    });
  }

  if (!visibleImages.length) return null;

  return (
    <>
      <div
        className={cn(
          "gap-2 overflow-hidden rounded-lg",
          compact ? "flex flex-wrap" : "grid",
          !compact && visibleImages.length > 1 && "grid-cols-2",
          className,
        )}
      >
        {visibleImages.map((image, index) => (
          <figure
            className={cn(
              "relative overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-muted)]",
              compact
                ? "h-36 w-full shrink-0 sm:w-52"
                : "min-h-40",
              !compact && (visibleImages.length === 1 ? "aspect-[16/9]" : "aspect-square"),
              !compact && visibleImages.length === 3 && index === 0 && "col-span-2",
            )}
            key={image.id}
          >
            <button
              aria-haspopup="dialog"
              aria-label={`Open image ${index + 1} of ${visibleImages.length}: ${imageAlt(image, index)}`}
              className="group relative block size-full cursor-zoom-in overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
              onClick={() => {
                returnFocusIndex.current = index;
                setSelectedIndex(index);
              }}
              ref={(node) => {
                triggerRefs.current[index] = node;
              }}
              type="button"
            >
              <Image
                alt={imageAlt(image, index)}
                className="absolute inset-0 size-full object-cover transition duration-200 group-hover:scale-[1.02]"
                height={Math.max(1, image.height || 900)}
                sizes={
                  compact
                    ? "(max-width: 640px) calc(100vw - 3rem), 208px"
                    : visibleImages.length === 1
                      ? "(max-width: 768px) 100vw, 760px"
                      : "(max-width: 768px) 50vw, 380px"
                }
                src={image.url}
                unoptimized
                width={Math.max(1, image.width || 1200)}
              />
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-[var(--night)]/80 px-2 py-1 text-xs font-semibold text-white shadow-sm">
                <Maximize2 aria-hidden className="size-3.5" />
                View
              </span>
            </button>
          </figure>
        ))}
      </div>

      <Dialog
        className="w-[min(1200px,calc(100vw-1rem))] max-w-none"
        description={
          selectedImage && selectedIndex !== null
            ? `${imageAlt(selectedImage, selectedIndex)} — Image ${selectedIndex + 1} of ${visibleImages.length}.`
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) setSelectedIndex(null);
        }}
        open={Boolean(selectedImage)}
        title="Image preview"
      >
        {selectedImage && selectedIndex !== null ? (
          <div className="space-y-4">
            <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-lg bg-[var(--night)] p-2 sm:min-h-80">
              <Image
                alt={imageAlt(selectedImage, selectedIndex)}
                className="h-auto max-h-[calc(100dvh-15rem)] w-auto max-w-full rounded-md object-contain"
                height={Math.max(1, selectedImage.height || 900)}
                sizes="(max-width: 768px) calc(100vw - 3rem), 1100px"
                src={selectedImage.url}
                unoptimized
                width={Math.max(1, selectedImage.width || 1200)}
              />
            </div>
            {visibleImages.length > 1 ? (
              <div className="flex items-center justify-between gap-3">
                <Button
                  aria-label="Previous image"
                  onClick={() => moveSelection(-1)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <ArrowLeft aria-hidden className="size-4" />
                  Previous
                </Button>
                <span className="text-sm font-semibold text-[var(--ink-soft)]">
                  {selectedIndex + 1} / {visibleImages.length}
                </span>
                <Button
                  aria-label="Next image"
                  onClick={() => moveSelection(1)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Next
                  <ArrowRight aria-hidden className="size-4" />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

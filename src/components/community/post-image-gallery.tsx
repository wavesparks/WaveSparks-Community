import Image from "next/image";

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
  images,
}: {
  className?: string;
  images?: PostImageGalleryItem[];
}) {
  const visibleImages = (images ?? [])
    .filter((image) => isSafeSameOriginPath(image.url))
    .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));

  if (!visibleImages.length) return null;

  return (
    <div
      className={cn(
        "grid gap-2 overflow-hidden rounded-lg",
        visibleImages.length > 1 && "grid-cols-2",
        className,
      )}
    >
      {visibleImages.map((image, index) => (
        <figure
          className={cn(
            "relative min-h-40 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-muted)]",
            visibleImages.length === 1 ? "aspect-[16/9]" : "aspect-square",
            visibleImages.length === 3 && index === 0 && "col-span-2",
          )}
          key={image.id}
        >
          <Image
            alt={image.alt?.trim() || `Post image ${index + 1}`}
            className="absolute inset-0 size-full object-cover"
            height={Math.max(1, image.height || 900)}
            sizes={visibleImages.length === 1 ? "(max-width: 768px) 100vw, 760px" : "(max-width: 768px) 50vw, 380px"}
            src={image.url}
            unoptimized
            width={Math.max(1, image.width || 1200)}
          />
        </figure>
      ))}
    </div>
  );
}

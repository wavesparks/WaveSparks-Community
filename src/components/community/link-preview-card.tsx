import { ExternalLink } from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";

export interface LinkPreviewCardData {
  description?: string;
  id: string;
  siteName?: string;
  thumbnailHeight?: number;
  thumbnailUrl?: string;
  thumbnailWidth?: number;
  title?: string;
  url: string;
}

function safePreviewUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

function safeThumbnailUrl(value: string | undefined) {
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : undefined;
}

export function LinkPreviewCard({
  className,
  compact = false,
  preview,
}: {
  className?: string;
  compact?: boolean;
  preview?: LinkPreviewCardData | null;
}) {
  const url = preview ? safePreviewUrl(preview.url) : null;
  if (!preview || !url) return null;

  const siteName = preview.siteName?.trim() || url.hostname.replace(/^www\./u, "");
  const thumbnailUrl = safeThumbnailUrl(preview.thumbnailUrl);

  return (
    <a
      className={cn(
        "group/preview grid overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] transition hover:border-[var(--accent)]/35 hover:bg-[var(--surface)]",
        thumbnailUrl && !compact && "sm:grid-cols-[180px_minmax(0,1fr)]",
        className,
      )}
      href={url.href}
      rel="noopener noreferrer nofollow ugc"
      target="_blank"
    >
      {thumbnailUrl && !compact ? (
        <div className="relative min-h-32 overflow-hidden bg-[var(--accent-soft)]">
          <Image
            alt=""
            className="absolute inset-0 size-full object-cover transition duration-200 group-hover/preview:scale-[1.02]"
            height={Math.max(1, preview.thumbnailHeight || 360)}
            sizes="(max-width: 640px) 100vw, 180px"
            src={thumbnailUrl}
            unoptimized
            width={Math.max(1, preview.thumbnailWidth || 640)}
          />
        </div>
      ) : null}
      <div className="min-w-0 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
          <span className="truncate">{siteName}</span>
          <ExternalLink className="ml-auto size-3.5 shrink-0" aria-hidden="true" />
        </div>
        <p className="mt-1 line-clamp-2 font-semibold leading-snug text-[var(--ink)]">
          {preview.title?.trim() || url.href}
        </p>
        {preview.description?.trim() && !compact ? (
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--ink-soft)]">
            {preview.description}
          </p>
        ) : null}
      </div>
    </a>
  );
}

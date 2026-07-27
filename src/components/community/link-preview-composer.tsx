"use client";

import { Eye, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  LinkPreviewCard,
  type LinkPreviewCardData,
} from "@/components/community/link-preview-card";
import { Button } from "@/components/ui/button";
import { extractFirstExternalSafeHttpUrl } from "@/lib/post-content";

function firstExternalUrl(body: string, appOrigin?: string) {
  return extractFirstExternalSafeHttpUrl(body, appOrigin ?? "")?.href ?? null;
}

export function LinkPreviewComposer({
  appOrigin,
  body,
  endpoint,
}: {
  appOrigin?: string;
  body: string;
  endpoint: string;
}) {
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<LinkPreviewCardData | null>(null);
  const [previewSourceUrl, setPreviewSourceUrl] = useState<string | null>(null);
  const previewRef = useRef<LinkPreviewCardData | null>(null);
  const previewSourceUrlRef = useRef<string | null>(null);
  const url = firstExternalUrl(body, appOrigin);

  function updatePreview(next: LinkPreviewCardData | null, sourceUrl?: string) {
    previewRef.current = next;
    previewSourceUrlRef.current = next ? (sourceUrl ?? previewSourceUrlRef.current) : null;
    setPreviewSourceUrl(previewSourceUrlRef.current);
    setPreview(next);
  }

  async function deletePreview(previewId: string) {
    await fetch(`${endpoint}?previewId=${encodeURIComponent(previewId)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }

  useEffect(() => {
    if (!enabled) return;
    if (!url) {
      const timer = window.setTimeout(() => {
        const current = previewRef.current;
        if (current) void deletePreview(current.id);
        updatePreview(null);
        setError(null);
        setIsLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (previewRef.current && previewSourceUrlRef.current === url) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const previous = previewRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(endpoint, {
          body: JSON.stringify({ url }),
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          preview?: LinkPreviewCardData;
        };
        if (!response.ok || !payload.preview) {
          throw new Error(payload.error || "Preview unavailable.");
        }
        if (previous && previous.id !== payload.preview.id) {
          void deletePreview(previous.id);
        }
        updatePreview(payload.preview, url);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        if (previous) void deletePreview(previous.id);
        updatePreview(null);
        setError(
          requestError instanceof Error ? requestError.message : "Preview unavailable.",
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 650);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // The state setter passed by the parent is stable. Including it would restart a fetch
    // when an inline adapter is used, so URL and endpoint intentionally drive this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, endpoint, url]);

  if (!url) return null;

  if (!enabled) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-[var(--line)] px-3 py-2">
        <input name="link_preview_id" type="hidden" value="" />
        <p className="text-xs text-[var(--ink-soft)]">Link preview hidden. The link will stay clickable.</p>
        <Button onClick={() => setEnabled(true)} size="sm" type="button" variant="ghost">
          <Eye className="size-3.5" aria-hidden="true" />
          Show preview
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        name="link_preview_id"
        type="hidden"
        value={
          preview && previewSourceUrl === url ? preview.id : ""
        }
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
          Link preview
        </p>
        <Button
          onClick={() => {
            const current = previewRef.current;
            setEnabled(false);
            if (current) void deletePreview(current.id);
            updatePreview(null);
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X className="size-3.5" aria-hidden="true" />
          Hide
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-4 text-sm text-[var(--ink-soft)]">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Fetching a safe preview…
        </div>
      ) : null}
      {preview && !isLoading ? <LinkPreviewCard preview={preview} /> : null}
      {error && !isLoading ? (
        <p aria-live="polite" className="text-xs text-[var(--ink-soft)]">
          {error} The link will still be published as a clickable URL.
        </p>
      ) : null}
    </div>
  );
}

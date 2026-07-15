"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OrgLogoUploadField({
  defaultValue,
  orgName,
  slug,
}: {
  defaultValue: string;
  orgName: string;
  slug: string;
}) {
  const [logoUrl, setLogoUrl] = useState(defaultValue);
  const [status, setStatus] = useState<string | null>(null);

  async function upload(file: File) {
    setStatus("Uploading logo...");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`/api/uploads/org-logo?slug=${encodeURIComponent(slug)}`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || !payload.url) {
        setStatus(payload.error ?? "We couldn't upload the logo. Try again or use an image link.");
        return;
      }

      setLogoUrl(payload.url);
      setStatus("Logo ready.");
    } catch {
      setStatus("We couldn't upload the logo. Try again or use an image link.");
    }
  }

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] text-sm font-semibold text-[var(--ink-soft)]">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={`${orgName} logo`} className="size-full object-contain p-2" src={logoUrl} />
          ) : (
            orgName.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <Label htmlFor="org_logo_upload">Community logo</Label>
            <Input
              accept="image/jpeg,image/png,image/webp"
              id="org_logo_upload"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void upload(file);
                }
              }}
              type="file"
            />
          </div>
          <div>
            <Label htmlFor="org_logo_url">Or use an image link</Label>
            <Input
              id="org_logo_url"
              onChange={(event) => {
                setLogoUrl(event.target.value);
                setStatus(null);
              }}
              placeholder="https://..."
              value={logoUrl}
            />
          </div>
          {status ? (
            <p aria-live="polite" className="text-xs text-[var(--ink-soft)]">
              {status}
            </p>
          ) : null}
        </div>
      </div>
      <input name="logo_url" type="hidden" value={logoUrl} />
    </div>
  );
}

"use client";

import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AvatarUploadField({
  defaultValue,
  displayName,
}: {
  defaultValue: string;
  displayName: string;
}) {
  const [photoUrl, setPhotoUrl] = useState(defaultValue);
  const [status, setStatus] = useState<string | null>(null);

  async function upload(file: File) {
    setStatus("Uploading profile photo...");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/uploads/avatar", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || !payload.url) {
        setStatus(payload.error ?? "We couldn't upload your photo. Try again or use an image link.");
        return;
      }

      setPhotoUrl(payload.url);
      setStatus("Profile photo ready.");
    } catch {
      setStatus("We couldn't upload your photo. Try again or use an image link.");
    }
  }

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 md:col-span-2">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="size-20" name={displayName} src={photoUrl} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <Label htmlFor="profile_photo_upload">Profile photo</Label>
            <Input
              accept="image/jpeg,image/png,image/webp"
              id="profile_photo_upload"
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
            <Label htmlFor="profile_photo_url">Or use an image link</Label>
            <Input
              id="profile_photo_url"
              onChange={(event) => {
                setPhotoUrl(event.target.value);
                setStatus(null);
              }}
              placeholder="https://..."
              value={photoUrl}
            />
          </div>
          {status ? (
            <p aria-live="polite" className="text-xs text-[var(--ink-soft)]">
              {status}
            </p>
          ) : null}
        </div>
      </div>
      <input name="profile_photo" type="hidden" value={photoUrl} />
    </div>
  );
}

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
    setStatus("Uploading portrait...");

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/uploads/avatar", {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };

    if (!response.ok || !payload.url) {
      setStatus(payload.error ?? "Upload unavailable. Paste an image URL instead.");
      return;
    }

    setPhotoUrl(payload.url);
    setStatus("Portrait uploaded.");
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 md:col-span-2">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="size-20" name={displayName} src={photoUrl} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <Label htmlFor="profile_photo_upload">Upload portrait</Label>
            <Input
              accept="image/*"
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
            <Label htmlFor="profile_photo_url">Portrait URL fallback</Label>
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
          {status ? <p className="text-xs text-slate-500">{status}</p> : null}
        </div>
      </div>
      <input name="profile_photo" type="hidden" value={photoUrl} />
    </div>
  );
}

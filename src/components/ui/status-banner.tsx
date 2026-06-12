"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";

import { getStatusBannerCopy } from "@/lib/activation";

export function StatusBanner({ status }: { status?: string }) {
  const copy = getStatusBannerCopy(status);

  useEffect(() => {
    if (!copy || !window.location.search.includes("status=")) {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("status");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [copy]);

  if (!copy) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="flex gap-3 rounded-lg border border-[var(--accent)]/20 bg-white/[0.86] p-4 text-sm text-[var(--ink)] shadow-[0_18px_50px_rgba(34,27,68,0.10)]"
      role="status"
    >
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
      <div>
        <p className="font-semibold text-[var(--ink)]">{copy.title}</p>
        <p className="mt-1 leading-6">{copy.body}</p>
      </div>
    </div>
  );
}

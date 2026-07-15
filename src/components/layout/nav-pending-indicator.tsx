"use client";

import { useLinkStatus } from "next/link";

import { cn } from "@/lib/utils";

export function NavPendingIndicator({ className }: { className?: string }) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full bg-current opacity-0 transition-opacity duration-150",
        pending ? "animate-pulse opacity-70" : null,
        className,
      )}
    />
  );
}

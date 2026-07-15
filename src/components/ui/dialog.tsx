"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DialogProps {
  children: ReactNode;
  className?: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}

export function Dialog({
  children,
  className,
  description,
  onOpenChange,
  open,
  title,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[min(960px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-0 text-[var(--ink)] shadow-[0_30px_90px_rgba(34,27,68,0.35)] backdrop:bg-[var(--night)]/60",
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
      ref={dialogRef}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-[var(--ink)]" id={titleId}>
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]" id={descriptionId}>
              {description}
            </p>
          ) : null}
        </div>
        <Button
          aria-label="Close dialog"
          className="shrink-0"
          onClick={() => onOpenChange(false)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X aria-hidden className="size-4" />
        </Button>
      </div>
      <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto px-5 py-5 sm:px-6">
        {children}
      </div>
    </dialog>
  );
}

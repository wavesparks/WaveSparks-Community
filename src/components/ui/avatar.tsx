/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Avatar({
  src,
  name,
  className,
}: {
  src?: string;
  name: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--ink)] ring-2 ring-[var(--surface)] shadow-[0_10px_24px_rgba(34,27,68,0.12)]",
        className,
      )}
    >
      {src ? (
        <img
          alt={`${name} portrait`}
          className="size-full object-cover"
          referrerPolicy="no-referrer"
          src={src}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}

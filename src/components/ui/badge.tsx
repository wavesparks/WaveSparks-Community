import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-white/[0.92] text-[var(--ink-soft)] ring-1 ring-[var(--line)]",
        accent:
          "bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent)]/20",
        muted:
          "bg-[var(--surface-muted)] text-[var(--ink-soft)] ring-1 ring-[var(--line)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

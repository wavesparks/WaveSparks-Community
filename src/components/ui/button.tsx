import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition duration-150 ease-out active:translate-y-px active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--night)] px-4 py-2.5 text-[var(--surface)] shadow-[0_10px_20px_rgba(34,27,68,0.16)] ring-1 ring-[var(--surface)] hover:bg-[var(--blue)]",
        secondary:
          "bg-[var(--surface)] px-4 py-2.5 text-[var(--ink)] ring-1 ring-[var(--line)] hover:bg-[var(--cyan-soft)] hover:text-[var(--night)]",
        ghost: "px-3 py-2 text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]",
        destructive:
          "bg-[var(--night)] px-4 py-2.5 text-[var(--gold)] shadow-sm ring-1 ring-[var(--gold)] hover:bg-[var(--blue)] hover:text-[var(--surface)]",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-5 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

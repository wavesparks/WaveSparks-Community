import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--ink)] outline-none transition placeholder:text-[var(--ink-soft)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:bg-[var(--accent-soft)] disabled:text-[var(--ink-soft)]",
        className,
      )}
      {...props}
    />
  );
}

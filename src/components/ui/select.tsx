import { cn } from "@/lib/utils";

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

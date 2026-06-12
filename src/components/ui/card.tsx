import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--line)] bg-white p-5 shadow-[0_18px_45px_rgba(1,2,10,0.06)]",
        className,
      )}
      {...props}
    />
  );
}

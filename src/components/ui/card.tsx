import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "ws-card-glow relative rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}

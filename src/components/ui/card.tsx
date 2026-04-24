import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_22px_60px_rgba(15,23,42,0.08)] backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

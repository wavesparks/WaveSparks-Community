import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  level = 2,
  tone = "default",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  level?: 1 | 2 | 3;
  tone?: "default" | "inverse";
  className?: string;
}) {
  const inverse = tone === "inverse";
  const Heading = level === 1 ? "h1" : level === 3 ? "h3" : "h2";

  return (
    <div className={cn("space-y-2", className)}>
      {eyebrow ? (
        <p
          className={cn(
            "text-xs font-semibold uppercase tracking-[0.18em]",
            inverse ? "text-white/75" : "text-[var(--accent)]",
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <div className="space-y-1.5">
        <Heading
          className={cn(
            "text-2xl font-semibold leading-tight sm:text-3xl",
            inverse ? "text-white" : "text-[var(--ink)]",
          )}
        >
          {title}
        </Heading>
        {description ? (
          <p
            className={cn(
              "max-w-2xl text-sm leading-6",
              inverse ? "text-white/75" : "text-[var(--ink-soft)]",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

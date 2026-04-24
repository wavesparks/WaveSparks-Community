export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-3">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent)]">
          {eyebrow}
        </p>
      ) : null}
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-slate-950 sm:text-3xl">{title}</h2>
        {description ? <p className="max-w-2xl text-sm text-slate-600">{description}</p> : null}
      </div>
    </div>
  );
}

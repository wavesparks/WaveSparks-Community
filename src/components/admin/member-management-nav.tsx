import Link from "next/link";

import { cn } from "@/lib/utils";

export interface MemberManagementNavProps {
  active: "members" | "cohorts";
  slug: string;
}

const items = [
  { key: "members", label: "Members", path: "members" },
  { key: "cohorts", label: "Cohorts", path: "cohorts" },
] as const;

export function MemberManagementNav({ active, slug }: MemberManagementNavProps) {
  return (
    <nav aria-label="Member management" className="border-b border-[var(--line)]">
      <div className="flex gap-6">
        {items.map((item) => {
          const isActive = active === item.key;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative -mb-px min-h-11 px-1 py-3 text-sm font-semibold transition-colors focus-visible:rounded-sm",
                isActive
                  ? "text-[var(--ink)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[var(--accent)]"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]",
              )}
              href={`/org/${slug}/admin/${item.path}`}
              key={item.key}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

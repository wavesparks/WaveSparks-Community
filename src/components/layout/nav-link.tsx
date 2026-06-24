import Link from "next/link";
import type { ReactNode } from "react";

import { NavPendingIndicator } from "@/components/layout/nav-pending-indicator";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  active,
  className,
  children,
}: {
  href: string;
  active: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "duration-150 ease-out active:translate-y-px active:scale-[0.99]",
        className,
      )}
      href={href}
    >
      {children}
      <NavPendingIndicator />
    </Link>
  );
}

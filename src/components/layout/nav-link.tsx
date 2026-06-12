import Link from "next/link";
import type { ReactNode } from "react";

import { NavPendingIndicator } from "@/components/layout/nav-pending-indicator";

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
      className={className}
      href={href}
    >
      {children}
      <NavPendingIndicator />
    </Link>
  );
}

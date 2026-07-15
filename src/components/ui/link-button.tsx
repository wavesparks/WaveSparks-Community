"use client";

import Link, { useLinkStatus, type LinkProps } from "next/link";
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";

interface LinkButtonProps
  extends Omit<ButtonProps, "asChild" | "children" | "disabled" | "type"> {
  children: ReactNode;
  href: LinkProps["href"];
  pendingLabel?: ReactNode;
  prefetch?: LinkProps["prefetch"];
  replace?: LinkProps["replace"];
  scroll?: LinkProps["scroll"];
}

function LinkButtonContent({
  children,
  pendingLabel,
}: {
  children: ReactNode;
  pendingLabel?: ReactNode;
}) {
  const { pending } = useLinkStatus();

  return (
    <>
      {pending ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
      {pending ? (pendingLabel ?? children) : children}
    </>
  );
}

export function LinkButton({
  children,
  href,
  pendingLabel,
  prefetch,
  replace,
  scroll,
  ...buttonProps
}: LinkButtonProps) {
  return (
    <Button asChild {...buttonProps}>
      <Link href={href} prefetch={prefetch} replace={replace} scroll={scroll}>
        <LinkButtonContent pendingLabel={pendingLabel}>{children}</LinkButtonContent>
      </Link>
    </Button>
  );
}

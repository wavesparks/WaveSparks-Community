"use client";

import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { useClerk } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SignOutButton({
  callbackUrl,
  tone = "dark",
}: {
  callbackUrl: string;
  tone?: "dark" | "light";
}) {
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);
  const className = cn(
    tone === "dark"
      ? "text-[var(--cyan-soft)] hover:bg-[var(--blue)] hover:text-[var(--surface)]"
      : "text-[var(--ink-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]",
  );

  async function handleSignOut() {
    if (pending) {
      return;
    }

    setPending(true);

    try {
      await signOut({ redirectUrl: callbackUrl });
    } catch (error) {
      setPending(false);
      throw error;
    }
  }

  return (
    <Button
      aria-busy={pending}
      className={className}
      disabled={pending}
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => void handleSignOut()}
    >
      {pending ? (
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
      ) : (
        <LogOut className="size-4" />
      )}
      {pending ? "Signing out" : "Sign out"}
    </Button>
  );
}

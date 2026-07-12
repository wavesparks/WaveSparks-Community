"use client";

import { useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { useClerk } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SignOutButton({
  callbackUrl,
  mode = "clerk",
  tone = "dark",
}: {
  callbackUrl: string;
  mode?: "clerk" | "local";
  tone?: "dark" | "light";
}) {
  if (mode === "local") {
    return <LocalSignOutButton callbackUrl={callbackUrl} tone={tone} />;
  }

  return <ClerkSignOutButton callbackUrl={callbackUrl} tone={tone} />;
}

function buttonClassName(tone: "dark" | "light") {
  return cn(
    tone === "dark"
      ? "text-[var(--cyan-soft)] hover:bg-[var(--blue)] hover:text-[var(--surface)]"
      : "text-[var(--ink-soft)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]",
  );
}

function ClerkSignOutButton({
  callbackUrl,
  tone,
}: {
  callbackUrl: string;
  tone: "dark" | "light";
}) {
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);

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
      className={buttonClassName(tone)}
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

function LocalSignOutButton({
  callbackUrl,
  tone,
}: {
  callbackUrl: string;
  tone: "dark" | "light";
}) {
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    if (pending) {
      return;
    }

    setPending(true);
    const response = await fetch("/api/internal/e2e-auth", { method: "DELETE" });
    if (!response.ok) {
      setPending(false);
      return;
    }

    window.location.assign(callbackUrl);
  }

  return (
    <Button
      aria-busy={pending}
      className={buttonClassName(tone)}
      disabled={pending}
      onClick={() => void handleSignOut()}
      size="sm"
      type="button"
      variant="ghost"
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

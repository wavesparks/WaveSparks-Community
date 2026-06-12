"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SignOutButton({
  callbackUrl,
  tone = "dark",
}: {
  callbackUrl: string;
  tone?: "dark" | "light";
}) {
  const className = cn(
    tone === "dark"
      ? "text-slate-300 hover:bg-white/10 hover:text-white"
      : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
  );

  async function handleSignOut() {
    await signOut({ redirect: false });

    const clerkSignOut = (window as typeof window & {
      Clerk?: { signOut?: (options: { redirectUrl: string }) => Promise<void> };
    }).Clerk?.signOut;

    if (clerkSignOut) {
      await clerkSignOut({ redirectUrl: callbackUrl });
      return;
    }

    window.location.assign(callbackUrl);
  }

  return (
    <Button
      className={className}
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => void handleSignOut()}
    >
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}

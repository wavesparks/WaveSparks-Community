"use client";

import { SignOutButton as ClerkSignOutButton } from "@clerk/nextjs";
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
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const className = cn(
    tone === "dark"
      ? "text-slate-300 hover:bg-white/10 hover:text-white"
      : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
  );

  if (clerkConfigured) {
    return (
      <ClerkSignOutButton redirectUrl={callbackUrl}>
        <Button
          className={className}
          type="button"
          variant="ghost"
          size="sm"
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </ClerkSignOutButton>
    );
  }

  return (
    <Button
      className={className}
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => signOut({ callbackUrl })}
    >
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}

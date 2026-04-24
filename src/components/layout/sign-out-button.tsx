"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => signOut({ callbackUrl: "/org/wavespark" })}
    >
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}

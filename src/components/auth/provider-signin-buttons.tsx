"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface AuthButton {
  id: string;
  label: string;
  description: string;
  email?: string;
}

export function ProviderSignInButtons({
  slug,
  providers,
}: {
  slug: string;
  providers: AuthButton[];
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {providers.map((provider) => (
        <Card className="space-y-4" key={`${provider.id}-${provider.email ?? "credential"}`}>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-950">{provider.label}</h3>
            <p className="text-sm text-slate-600">{provider.description}</p>
            {provider.email ? (
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {provider.email}
              </p>
            ) : null}
          </div>
          <Button
            className="w-full"
            disabled={pendingId === provider.label}
            onClick={async () => {
              setPendingId(provider.label);
              await signIn(provider.id, {
                email: provider.email,
                callbackUrl: `/org/${slug}`,
              });
            }}
          >
            {pendingId === provider.label ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Continue
          </Button>
        </Card>
      ))}
    </div>
  );
}

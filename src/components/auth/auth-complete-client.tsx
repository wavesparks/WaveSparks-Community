"use client";

import { useAuth } from "@clerk/nextjs";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";

export function AuthCompleteClient({ slug }: { slug: string }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    let active = true;

    async function completeAuth() {
      if (!isSignedIn) {
        router.replace(`/org/${slug}/signin`);
        return;
      }

      try {
        const token = await getToken();
        const response = await fetch(
          `/api/internal/auth/complete?orgSlug=${encodeURIComponent(slug)}`,
          {
            cache: "no-store",
            headers: token ? { authorization: `Bearer ${token}` } : undefined,
          },
        );

        if (!active) {
          return;
        }

        if (response.status === 401) {
          router.replace(`/org/${slug}/signin`);
          return;
        }

        if (!response.ok) {
          setError("We could not finish the workspace handoff. Please try again.");
          return;
        }

        const payload = (await response.json()) as { target?: string };
        router.replace(payload.target ?? `/org/${slug}/feed`);
      } catch {
        if (active) {
          setError("We could not finish the workspace handoff. Please try again.");
        }
      }
    }

    void completeAuth();

    return () => {
      active = false;
    };
  }, [attempt, getToken, isLoaded, isSignedIn, router, slug]);

  return (
    <main className="ws-page-shell grid min-h-screen place-items-center px-4 py-8">
      <Card className="w-full max-w-lg space-y-5 text-center">
        <BrandLogo className="mx-auto h-9 w-fit" />
        <SectionHeading
          eyebrow="Signing in"
          level={1}
          title="Completing your workspace handoff"
          description={
            error ??
            "Keep this tab open while Wavespark connects your Clerk session to the community workspace."
          }
        />
        {error ? (
          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button
              disabled={leaving}
              onClick={() => {
                setError(null);
                setAttempt((value) => value + 1);
              }}
              type="button"
            >
              Try again
            </Button>
            <Button
              aria-busy={leaving}
              disabled={leaving}
              onClick={() => {
                setLeaving(true);
                router.replace(`/org/${slug}/signin`);
              }}
              type="button"
              variant="secondary"
            >
              {leaving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
              {leaving ? "Opening sign in" : "Back to sign in"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[var(--ink-soft)]">
            <LoaderCircle className="size-4 animate-spin" />
            Syncing secure session
          </div>
        )}
      </Card>
    </main>
  );
}

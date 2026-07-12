"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";

const authCompleteRetryCount = 8;
const authCompleteRetryDelayMs = 750;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function AuthCompleteClient({ slug }: { slug: string }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { setActive, signOut } = useClerk();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [leaving, setLeaving] = useState(false);

  async function handleBackToSignIn() {
    if (leaving) {
      return;
    }

    setLeaving(true);

    try {
      await signOut({ redirectUrl: `/org/${slug}/signin` });
    } catch {
      router.replace(`/org/${slug}/signin`);
    }
  }

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
        for (let index = 0; index < authCompleteRetryCount; index += 1) {
          const token = await getToken({ skipCache: index > 0 });

          if (!active) {
            return;
          }

          if (!token) {
            await wait(authCompleteRetryDelayMs);
            continue;
          }

          const response = await fetch(
            `/api/internal/auth/complete?orgSlug=${encodeURIComponent(slug)}`,
            {
              cache: "no-store",
              headers: { authorization: `Bearer ${token}` },
            },
          );

          if (!active) {
            return;
          }

          if (response.status === 401 && index < authCompleteRetryCount - 1) {
            await wait(authCompleteRetryDelayMs);
            continue;
          }

          if (response.status === 401) {
            setError("We could not verify your Clerk session. Please try again.");
            return;
          }

          if (response.status === 403) {
            setError(
              "This Clerk account does not have an active Wavespark invitation. Sign out and use the email address that was invited.",
            );
            return;
          }

          if (!response.ok) {
            setError("We could not finish the workspace handoff. Please try again.");
            return;
          }

          const payload = (await response.json()) as {
            clerkOrgId?: string;
            state?: "ready" | "pending" | "inactive";
            target?: string;
          };
          const target = payload.target ?? `/org/${slug}/feed`;
          if (payload.clerkOrgId && payload.state !== "inactive") {
            await setActive({
              organization: payload.clerkOrgId,
              redirectUrl: target,
            });
            return;
          }
          router.replace(target);
          return;
        }

        if (active) {
          setError("We could not verify your Clerk session. Please try again.");
        }
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
  }, [attempt, getToken, isLoaded, isSignedIn, router, setActive, slug]);

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
              onClick={() => void handleBackToSignIn()}
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

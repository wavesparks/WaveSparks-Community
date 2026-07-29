"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";

const authCompleteRetryCount = 2;

export function AuthCompleteClient({ slug }: { slug: string }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
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
            continue;
          }

          const invitationResponse = await fetch(
            `/api/internal/membership-invitations/accept?orgSlug=${encodeURIComponent(slug)}`,
            {
              cache: "no-store",
              credentials: "same-origin",
              headers: { authorization: `Bearer ${token}` },
              method: "POST",
            },
          );

          if (!active) {
            return;
          }

          if (
            invitationResponse.status === 401 &&
            index < authCompleteRetryCount - 1
          ) {
            continue;
          }

          if (invitationResponse.status === 401) {
            setError("We couldn’t confirm your sign-in. Please try again.");
            return;
          }

          if (invitationResponse.status === 403) {
            setError(
              "This invitation belongs to a different email address. Sign out and use the address that received the invitation.",
            );
            return;
          }

          if (invitationResponse.status === 410) {
            setError(
              "This invitation has expired or is no longer active. Ask a Wavesparks admin to resend it.",
            );
            return;
          }

          if (invitationResponse.status === 409) {
            setError(
              "We couldn’t connect this invitation to your account. Please contact the Wavesparks team.",
            );
            return;
          }

          if (
            invitationResponse.status !== 204 &&
            !invitationResponse.ok
          ) {
            setError("We couldn’t finish accepting your invitation. Please try again.");
            return;
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
            continue;
          }

          if (response.status === 401) {
            setError("We couldn’t confirm your sign-in. Please try again.");
            return;
          }

          if (response.status === 403) {
            setError(
              "This account does not have an active Wavesparks invitation. Sign out and use the email address that was invited.",
            );
            return;
          }

          if (!response.ok) {
            setError("We couldn’t finish signing you in. Please try again.");
            return;
          }

          const payload = (await response.json()) as {
            state?: "ready" | "pending" | "inactive";
            target?: string;
          };
          const target = payload.target ?? `/org/${slug}`;
          router.replace(target);
          return;
        }

        if (active) {
          setError("We couldn’t confirm your sign-in. Please try again.");
        }
      } catch {
        if (active) {
          setError("We couldn’t finish signing you in. Please try again.");
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
        <BrandLogo className="mx-auto w-60" />
        <SectionHeading
          eyebrow="Signing in"
          level={1}
          title="Signing you in"
          description={
            error ??
            "Keep this tab open for a moment while Wavesparks finishes setting up your account."
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
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            Finishing sign-in
          </div>
        )}
      </Card>
    </main>
  );
}

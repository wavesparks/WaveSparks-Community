import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";

import { PasswordSignInForm } from "@/components/auth/password-signin-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { demoProviderButtons } from "@/lib/auth-buttons";
import { getViewerContext } from "@/lib/auth";
import { isClerkConfigured } from "@/lib/env";
import Link from "next/link";

export default async function SignInPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug);
  const clerkConfigured = isClerkConfigured();

  if (viewer) {
    redirect(`/org/${slug}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid w-full gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-slate-800 bg-[#111827] text-white">
          <SectionHeading
            eyebrow="Sign in"
            level={1}
            title="Enter the Wavespark application flow"
            description="Use the built-in account your admin created for this community."
            tone="inverse"
          />
          <div className="mt-6 space-y-4 text-sm text-slate-300">
            <p>Regular members cannot browse a people directory.</p>
            <p>Profiles become more visible through posts, match cards, and accepted intros.</p>
            <p>Contact details stay hidden until both sides agree.</p>
          </div>
        </Card>

        <div className="space-y-6">
          {clerkConfigured ? (
            <Card className="space-y-5">
              <SectionHeading eyebrow="Account" title="Sign in with Clerk" />
              <div className="flex justify-center">
                <SignIn
                  fallbackRedirectUrl={`/org/${slug}`}
                  path={`/org/${slug}/signin`}
                  routing="path"
                  signUpUrl={`/org/${slug}/sign-up`}
                />
              </div>
            </Card>
          ) : (
            <>
              <Card className="space-y-5">
                <SectionHeading
                  eyebrow="Account"
                  title="Local fallback sign in"
                  description="Clerk keys are not configured in this environment yet."
                />
                <PasswordSignInForm slug={slug} />
              </Card>

              {demoProviderButtons.length ? (
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Demo mode is available</p>
                    <p className="text-sm text-slate-600">Use the separate demo entrance for seeded preview personas.</p>
                  </div>
                  <Button asChild variant="secondary">
                    <Link href={`/org/${slug}/demo`}>Open demo</Link>
                  </Button>
                </Card>
              ) : null}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

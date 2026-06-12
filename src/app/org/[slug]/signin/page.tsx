import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { PasswordSignInForm } from "@/components/auth/password-signin-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { demoProviderButtons } from "@/lib/auth-buttons";
import { getViewerContext } from "@/lib/auth";
import { isClerkConfigured } from "@/lib/env";

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
    <main className="min-h-screen bg-[var(--canvas)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl flex-col justify-center gap-5">
        <div className="flex items-center justify-between gap-3">
          <Button asChild size="sm" variant="ghost">
            <Link href={`/org/${slug}/feed`}>
              <ArrowLeft className="size-4" />
              Back to forum
            </Link>
          </Button>
        </div>

        <div className="grid w-full gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
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

          <div className="space-y-4">
            <Card className="space-y-5 border-[var(--accent)]/30 shadow-md">
              <SectionHeading
                eyebrow="Account"
                title="Email sign in"
                description="Use the account credentials created by the Wavespark admin."
              />
              <PasswordSignInForm slug={slug} />
              <div className="flex gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
                <p>Members can browse first. Sign in is only needed to post, reply, follow, or request intros.</p>
              </div>
            </Card>

            {clerkConfigured ? (
              <Card className="space-y-5">
                <SectionHeading
                  eyebrow="Managed identity"
                  title="Sign in with Clerk"
                  description="Use Clerk when the managed identity service is available."
                />
                <div className="flex justify-center">
                  <SignIn
                    fallbackRedirectUrl={`/org/${slug}`}
                    path={`/org/${slug}/signin`}
                    routing="path"
                    signUpUrl={`/org/${slug}/sign-up`}
                  />
                </div>
              </Card>
            ) : demoProviderButtons.length ? (
              <>
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Demo mode is available</p>
                    <p className="text-sm text-slate-600">Use the separate demo entrance for seeded preview personas.</p>
                  </div>
                  <Button asChild variant="secondary">
                    <Link href={`/org/${slug}/demo`}>Open demo</Link>
                  </Button>
                </Card>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

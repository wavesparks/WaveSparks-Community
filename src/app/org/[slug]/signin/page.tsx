import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
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
    <main className="ws-page-shell px-4 py-6 sm:px-6 lg:px-8">
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
          <Card
            className="ws-hero-art min-h-[430px] overflow-hidden border-0 p-0 text-[var(--surface)]"
          >
            <div className="flex min-h-[430px] flex-col justify-between p-6 sm:p-7">
              <BrandLogo className="h-8 w-fit" tone="light" />
              <div>
                <SectionHeading
                  eyebrow="Sign in"
                  level={1}
                  title="Enter the Wavespark application flow"
                  description="Use the account your admin created for this community."
                  tone="inverse"
                />
                <div className="mt-6 grid gap-3 text-sm text-[var(--surface)]/80">
                  <p>Browse first; interact only when you are ready.</p>
                  <p>Profiles surface through posts, match cards, and accepted intros.</p>
                  <p>Contact details stay hidden until both sides agree.</p>
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            {clerkConfigured ? (
              <Card className="space-y-5">
                <SectionHeading
                  eyebrow="Managed identity"
                  title="Sign in to Wavespark"
                  description="Use Clerk to access your Wavespark community account."
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
            ) : (
              <Card className="space-y-4">
                <SectionHeading
                  eyebrow="Configuration"
                  title="Clerk is not configured"
                  description="Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to enable sign-in."
                />
              </Card>
            )}
            <Card className="text-sm leading-6 text-[var(--ink-soft)]">
              Members can browse first. Sign in is only needed to post, reply, follow, or request intros.
            </Card>
            {clerkConfigured ? (
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">Need an account?</p>
                  <p className="text-sm text-[var(--ink-soft)]">
                    Create one with Clerk and your local community profile will be linked by email.
                  </p>
                </div>
                <Button asChild variant="secondary">
                  <Link href={`/org/${slug}/sign-up`}>Sign up</Link>
                </Button>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

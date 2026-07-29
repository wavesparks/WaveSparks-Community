import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";

import { BrandLogo } from "@/components/ui/brand-logo";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { isClerkConfigured } from "@/lib/env";

export default async function SignInPage({
  params,
}: {
  params: Promise<{ slug: string; "sign-in"?: string[] }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug);
  const clerkConfigured = isClerkConfigured();

  if (viewer) {
    redirect(`/org/${slug}/auth/complete`);
  }

  return (
    <main className="ws-page-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-5xl flex-col justify-center gap-5">
        <div className="flex items-center justify-between gap-3">
          <LinkButton href={`/org/${slug}`} size="sm" variant="ghost">
            <ArrowLeft className="size-4" />
            Back to home
          </LinkButton>
        </div>

        <div className="grid w-full gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <Card className="ws-hero-art min-h-[430px] overflow-hidden border-0 p-0 text-[var(--surface)]">
            <div className="flex min-h-[430px] flex-col justify-between p-6 sm:p-7">
              <BrandLogo className="w-[13.7rem]" tone="light" />
              <div>
                <SectionHeading
                  description="Use the email address that received your Wavesparks invitation."
                  eyebrow="Sign in"
                  level={1}
                  title="Welcome to Wavesparks"
                  tone="inverse"
                />
                <div className="mt-6 grid gap-3 text-sm text-[var(--surface)]/80">
                  <p>Wavesparks Community and each event have their own people and conversations.</p>
                  <p>You will only see the community and events you have been invited to.</p>
                  <p>Contact details are shared only after an introduction is accepted.</p>
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            {clerkConfigured ? (
              <Card className="space-y-5">
                <SectionHeading
                  description="Sign in to see your community and events."
                  eyebrow="Your account"
                  title="Sign in to Wavesparks"
                />
                <div className="flex min-h-[360px] justify-center">
                  <SignIn
                    fallbackRedirectUrl={`/org/${slug}/auth/complete`}
                    path={`/org/${slug}/signin`}
                    routing="path"
                    withSignUp={false}
                  />
                </div>
              </Card>
            ) : (
              <Card className="space-y-4">
                <SectionHeading
                  description="Please try again later or contact the Wavesparks team."
                  eyebrow="Sign-in unavailable"
                  title="Sign-in is temporarily unavailable"
                />
              </Card>
            )}
            <Card className="text-sm leading-6 text-[var(--ink-soft)]">
              Sign in is required before any community content or member information is shown.
            </Card>
            {clerkConfigured ? (
              <Card className="space-y-2 text-sm leading-6 text-[var(--ink-soft)]">
                <p className="font-semibold text-[var(--ink)]">Invitation required</p>
                <p>
                  Wavesparks is invitation-only. Ask the Wavesparks team to invite your email
                  address.
                </p>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

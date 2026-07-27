import { SignUp } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/ui/brand-logo";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { getCurrentAuthIdentity } from "@/lib/auth-identity";
import { isClerkConfigured } from "@/lib/env";
import { membershipInvitationCookieName } from "@/lib/membership-invitation-token";
import { getActiveMembershipInvitationSession } from "@/server/membership-invitation-session";

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const invitationSession = await getActiveMembershipInvitationSession({
    cookieValue: cookieStore.get(membershipInvitationCookieName)?.value,
    orgSlug: slug,
  });

  if (invitationSession && (await getCurrentAuthIdentity())) {
    redirect(`/org/${slug}/auth/complete`);
  }

  const clerkConfigured = isClerkConfigured();

  return (
    <main className="ws-page-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col justify-center gap-6">
        <LinkButton className="w-fit" href={`/org/${slug}`} variant="ghost">
          <ArrowLeft className="size-4" />
          Back to home
        </LinkButton>

        <div className="grid w-full gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card
            className="ws-hero-art min-h-[350px] overflow-hidden border-0 p-0 text-[var(--surface)]"
          >
            <div className="flex min-h-[350px] flex-col justify-between p-6 sm:p-7">
              <BrandLogo className="h-8 w-fit" tone="light" />
              <SectionHeading
                eyebrow="Create account"
                level={1}
                title="Join Wavesparks by invitation"
                description="Wavesparks is invitation only. You will only see Wavesparks Community and the events you have been invited to."
                tone="inverse"
              />
            </div>
          </Card>

          <div className="space-y-4">
            {invitationSession && clerkConfigured ? (
              <Card className="space-y-5">
                <SectionHeading
                  eyebrow="Personal invitation"
                  title="Create your invited account"
                  description="Use the exact email address that received this invitation. Wavesparks verifies it before granting any access."
                />
                <div className="flex min-h-[390px] justify-center">
                  <SignUp
                    fallbackRedirectUrl={`/org/${slug}/auth/complete`}
                    path={`/org/${slug}/sign-up`}
                    routing="path"
                    signInUrl={`/org/${slug}/accept-invitation`}
                  />
                </div>
              </Card>
            ) : (
              <>
                <Card className="space-y-5">
                  <SectionHeading
                    eyebrow="Invitation required"
                    title="Check your invitation email"
                    description="Open the personal link in your invitation email to create an account or sign in with the invited address."
                  />
                  <LinkButton href={`/org/${slug}/signin`}>
                    Sign in with an invited account
                  </LinkButton>
                </Card>
                <Card className="space-y-3 text-sm leading-6 text-[var(--ink-soft)]">
                  <p className="font-semibold text-[var(--ink)]">Ask for an invitation</p>
                  <p>
                    Wavesparks is invitation-only. Ask the Wavesparks team to invite your email
                    address.
                  </p>
                  <LinkButton className="w-fit" href={`/org/${slug}/signin`} variant="secondary">
                    Sign in with an invited account
                  </LinkButton>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

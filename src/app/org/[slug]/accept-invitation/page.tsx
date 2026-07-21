import { SignIn } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { BrandLogo } from "@/components/ui/brand-logo";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { getCurrentAuthIdentity } from "@/lib/auth-identity";
import { isClerkConfigured } from "@/lib/env";
import {
  membershipInvitationCookieName,
} from "@/lib/membership-invitation-token";
import { getActiveMembershipInvitationSession } from "@/server/membership-invitation-session";

function singleValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function invitationUnavailableCopy(state?: string) {
  if (state === "expired") {
    return "This invitation has expired. Ask a Wavesparks admin to resend it.";
  }
  if (state === "inactive") {
    return "This invitation has already been used or revoked. Ask a Wavesparks admin if you still need access.";
  }
  return "This page only opens from a valid, unexpired invitation email. Ask a Wavesparks admin to send or resend your invitation.";
}

export default async function AcceptInvitationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const rawToken = singleValue(query.token)?.trim();

  if (rawToken) {
    const exchangeUrl = new URL(
      "/api/internal/membership-invitations/accept",
      "http://localhost",
    );
    exchangeUrl.searchParams.set("orgSlug", slug);
    exchangeUrl.searchParams.set("token", rawToken);
    for (const key of ["__clerk_status", "__clerk_ticket"] as const) {
      const value = singleValue(query[key])?.trim();
      if (value) exchangeUrl.searchParams.set(key, value);
    }
    redirect(`${exchangeUrl.pathname}${exchangeUrl.search}`);
  }

  const cookieStore = await cookies();
  const invitationSession = await getActiveMembershipInvitationSession({
    cookieValue: cookieStore.get(membershipInvitationCookieName)?.value,
    orgSlug: slug,
  });
  const invitationActive = Boolean(invitationSession);

  if (invitationActive && (await getCurrentAuthIdentity())) {
    redirect(`/org/${slug}/auth/complete`);
  }

  const state = singleValue(query.state);
  const clerkConfigured = isClerkConfigured();

  return (
    <main className="ws-page-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col justify-center gap-5">
        <LinkButton className="w-fit" href={`/org/${slug}`} variant="ghost">
          <ArrowLeft className="size-4" />
          Back to home
        </LinkButton>
        <Card className="space-y-6">
          <BrandLogo className="h-8 w-fit" />
          <SectionHeading
            eyebrow="Personal invitation"
            level={1}
            title={
              invitationActive
                ? "Accept your Wavesparks invitation"
                : "Invitation link required"
            }
            description={
              invitationActive
                ? "Create your account or sign in with the verified email address that received this invitation."
                : invitationUnavailableCopy(state)
            }
          />
          {invitationActive && clerkConfigured ? (
            <div className="flex min-h-[390px] justify-center">
              <SignIn
                fallbackRedirectUrl={`/org/${slug}/auth/complete`}
                routing="hash"
                signUpUrl={`/org/${slug}/sign-up`}
                withSignUp
              />
            </div>
          ) : (
            <LinkButton
              className="w-fit"
              href={`/org/${slug}/signin`}
              variant="secondary"
            >
              Sign in
            </LinkButton>
          )}
        </Card>
      </div>
    </main>
  );
}

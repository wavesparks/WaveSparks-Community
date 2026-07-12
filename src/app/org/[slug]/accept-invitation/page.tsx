import { SignIn } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { BrandLogo } from "@/components/ui/brand-logo";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { isClerkConfigured } from "@/lib/env";

function singleValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
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
  const ticket = singleValue(query.__clerk_ticket);
  const ticketStatus = singleValue(query.__clerk_status);

  if (ticket && ticketStatus === "complete") {
    redirect(`/org/${slug}/auth/complete`);
  }

  const hasValidTicketShape = Boolean(
    ticket && (ticketStatus === "sign_in" || ticketStatus === "sign_up"),
  );

  return (
    <main className="ws-page-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col justify-center gap-5">
        <LinkButton className="w-fit" href={`/org/${slug}/feed`} variant="ghost">
          <ArrowLeft className="size-4" />
          Back to forum
        </LinkButton>
        <Card className="space-y-6">
          <BrandLogo className="h-8 w-fit" />
          <SectionHeading
            eyebrow="Personal invitation"
            level={1}
            title={hasValidTicketShape ? "Accept your Wavespark invitation" : "Invitation link required"}
            description={
              hasValidTicketShape
                ? "Use Clerk to create your account or sign in with the invited email address."
                : "This page only opens from a valid, unexpired invitation email. Ask a Wavespark admin to send or resend your invitation."
            }
          />
          {hasValidTicketShape && isClerkConfigured() ? (
            <div className="flex min-h-[390px] justify-center">
              <SignIn
                fallbackRedirectUrl={`/org/${slug}/auth/complete`}
                routing="hash"
                signUpUrl={`/org/${slug}/accept-invitation`}
                withSignUp
              />
            </div>
          ) : (
            <LinkButton className="w-fit" href={`/org/${slug}/signin`} variant="secondary">
              Sign in
            </LinkButton>
          )}
        </Card>
      </div>
    </main>
  );
}

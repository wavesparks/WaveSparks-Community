import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/ui/brand-logo";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="ws-page-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col justify-center gap-6">
        <LinkButton className="w-fit" href={`/org/${slug}`} variant="ghost">
          <ArrowLeft className="size-4" />
          Back to My Spaces
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
                description="Community content is private. New accounts are created only from a personal invitation, and each account can enter only its assigned Spaces."
                tone="inverse"
              />
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="space-y-5">
              <SectionHeading
                eyebrow="Invitation required"
                title="Check your invitation email"
                description="Each invitation contains a private Clerk ticket for one email address. Open that link to create an account or connect an existing Clerk account."
              />
              <LinkButton href={`/org/${slug}/signin`}>
                Sign in with an invited account
              </LinkButton>
            </Card>
            <Card className="space-y-3 text-sm leading-6 text-[var(--ink-soft)]">
              <p className="font-semibold text-[var(--ink)]">Ask an admin for an invitation</p>
              <p>
                Direct public registration and shared invite codes are closed. Ask a Wavesparks
                admin to send a personal invitation to your email address.
              </p>
              <LinkButton className="w-fit" href={`/org/${slug}/signin`} variant="secondary">
                Sign in with an invited account
              </LinkButton>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

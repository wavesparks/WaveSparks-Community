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
        <LinkButton className="w-fit" href={`/org/${slug}/feed`} variant="ghost">
          <ArrowLeft className="size-4" />
          Back to forum
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
                title="Join Wavespark by invitation"
                description="The public forum is open to read. Member accounts are created by an admin so posting, replies, follows, and intro requests stay inside the approved community."
                tone="inverse"
              />
            </div>
          </Card>

          <Card className="space-y-5">
            <SectionHeading
              eyebrow="Invitation only"
              title="Ask an admin for an invitation"
              description="Wavespark accounts are created from Clerk organization invitations. Use the invite link sent by your community admin to create or access your account."
            />
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]">
              Direct public registration is closed so membership stays limited to
              approved community invitees.
            </div>
            <LinkButton href={`/org/${slug}/signin`}>
              Sign in with an invited account
            </LinkButton>
          </Card>
        </div>
      </div>
    </main>
  );
}

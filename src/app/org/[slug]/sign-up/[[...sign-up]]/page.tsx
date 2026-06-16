import { SignUp } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/ui/brand-logo";
import { SectionHeading } from "@/components/ui/section-heading";
import { isClerkConfigured } from "@/lib/env";

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const clerkConfigured = isClerkConfigured();

  return (
    <main className="ws-page-shell px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col justify-center gap-6">
        <Button asChild className="w-fit" variant="ghost">
          <Link href={`/org/${slug}/feed`}>
            <ArrowLeft className="size-4" />
            Back to forum
          </Link>
        </Button>

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

          {clerkConfigured ? (
            <Card className="space-y-5">
              <SectionHeading
                eyebrow="Managed identity"
                title="Create your Clerk account"
                description="Sign up with Clerk to enter the Wavespark community flow."
              />
              <div className="flex justify-center">
                <SignUp
                  fallbackRedirectUrl={`/org/${slug}`}
                  path={`/org/${slug}/sign-up`}
                  routing="path"
                  signInUrl={`/org/${slug}/signin`}
                />
              </div>
            </Card>
          ) : (
            <Card className="space-y-5">
              <SectionHeading
                eyebrow="Configuration"
                title="Clerk is not configured"
                description="Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to enable account creation."
              />
              <Button asChild>
                <Link href={`/org/${slug}/signin`}>Sign in</Link>
              </Button>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

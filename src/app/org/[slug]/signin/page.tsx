import { redirect } from "next/navigation";

import { PasswordSignInForm } from "@/components/auth/password-signin-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { demoProviderButtons } from "@/lib/auth-buttons";
import { getViewerContext } from "@/lib/auth";
import Link from "next/link";

export default async function SignInPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug);

  if (viewer) {
    if (viewer.canAdmin && viewer.membership.status === "approved") {
      redirect(`/org/${slug}/admin/members`);
    }

    if (viewer.membership.status !== "approved") {
      redirect(`/org/${slug}/pending`);
    }

    if (!viewer.profile?.onboardingComplete) {
      redirect(`/org/${slug}/onboarding`);
    }

    redirect(`/org/${slug}/feed`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid w-full gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="bg-[#1f1d2b] text-white">
          <SectionHeading
            eyebrow="Sign in"
            title="Enter the Wavespark application flow"
            description="Use the built-in account your admin created for this community."
          />
          <div className="mt-6 space-y-4 text-sm text-slate-300">
            <p>Regular members cannot browse a people directory.</p>
            <p>Profiles become more visible through posts, match cards, and accepted intros.</p>
            <p>Contact details stay hidden until both sides agree.</p>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="space-y-5">
            <SectionHeading eyebrow="Account" title="Sign in with email" />
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
        </div>
      </div>
    </main>
  );
}

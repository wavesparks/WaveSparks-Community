import { redirect } from "next/navigation";

import { ProviderSignInButtons } from "@/components/auth/provider-signin-buttons";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import { configuredProviderButtons, demoProviderButtons } from "@/lib/auth-options";
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
            description="Social sign-in keeps registration light, but every membership still goes through admin approval before the community unlocks."
          />
          <div className="mt-6 space-y-4 text-sm text-slate-300">
            <p>Regular members cannot browse a people directory.</p>
            <p>Profiles become more visible through posts, match cards, and accepted intros.</p>
            <p>Contact details stay hidden until both sides agree.</p>
          </div>
        </Card>

        <div className="space-y-6">
          {configuredProviderButtons.length ? (
            <div className="space-y-4">
              <SectionHeading
                eyebrow="Production providers"
                title="Continue with a live provider"
              />
              <ProviderSignInButtons slug={slug} providers={configuredProviderButtons} />
            </div>
          ) : (
            <Card className="space-y-3">
              <SectionHeading
                eyebrow="Production providers"
                title="OAuth providers are not configured"
                description="Add provider credentials in the environment to enable Google, GitHub, and LinkedIn sign-in."
              />
            </Card>
          )}

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

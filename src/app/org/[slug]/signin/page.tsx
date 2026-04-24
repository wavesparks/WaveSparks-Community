import { redirect } from "next/navigation";

import { ProviderSignInButtons } from "@/components/auth/provider-signin-buttons";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  configuredProviderButtons,
  demoProviderButtons,
} from "@/lib/auth-options";
import { getViewerContext } from "@/lib/auth";

export default async function SignInPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug);

  if (viewer) {
    redirect(
      viewer.membership.status === "approved" && viewer.profile?.onboardingComplete
        ? `/org/${slug}/feed`
        : `/org/${slug}/pending`,
    );
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
          ) : null}

          {demoProviderButtons.length ? (
            <div className="space-y-4">
              <SectionHeading
                eyebrow="Local preview"
                title="Use seeded demo personas"
                description="These are dev-only fallbacks so the full product can be exercised without external OAuth credentials."
              />
              <ProviderSignInButtons slug={slug} providers={demoProviderButtons} />
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

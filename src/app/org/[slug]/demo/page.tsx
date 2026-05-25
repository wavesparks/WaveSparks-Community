import Link from "next/link";

import { ProviderSignInButtons } from "@/components/auth/provider-signin-buttons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { demoProviderButtons } from "@/lib/auth-buttons";

export default async function DemoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <SectionHeading
            eyebrow="Demo mode"
            title="Use seeded preview personas"
            description="Demo access is available only when the demo credentials provider is enabled in the environment."
          />
          <Button asChild size="sm" variant="secondary">
            <Link href={`/org/${slug}/signin`}>Production sign-in</Link>
          </Button>
        </div>

        {demoProviderButtons.length ? (
          <ProviderSignInButtons slug={slug} providers={demoProviderButtons} />
        ) : (
          <Card>
            <SectionHeading
              title="Demo mode is disabled"
              description="Set AUTH_DEV_DEMO_ENABLED=true in a local or preview environment to show seeded personas here."
            />
          </Card>
        )}
      </div>
    </main>
  );
}

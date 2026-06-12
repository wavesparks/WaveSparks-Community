import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { isClerkConfigured } from "@/lib/env";

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid w-full gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-slate-800 bg-[#111827] text-white">
          <SectionHeading
            eyebrow="Create account"
            level={1}
            title="Join Wavespark with Clerk"
            description="Create your account first. The community profile, approval state, and matching context remain managed inside Wavespark."
            tone="inverse"
          />
          <div className="mt-6 text-sm text-slate-300">
            <Link className="font-semibold text-white underline" href={`/org/${slug}/signin`}>
              Already have an account?
            </Link>
          </div>
        </Card>

        <Card className="space-y-5">
          {isClerkConfigured() ? (
            <div className="flex justify-center">
              <SignUp
                fallbackRedirectUrl={`/org/${slug}`}
                path={`/org/${slug}/sign-up`}
                routing="path"
                signInUrl={`/org/${slug}/signin`}
              />
            </div>
          ) : (
            <SectionHeading
              eyebrow="Setup required"
              title="Clerk keys are not configured"
              description="Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to enable account creation in this environment."
            />
          )}
        </Card>
      </div>
    </main>
  );
}

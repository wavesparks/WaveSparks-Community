import { ArrowLeft, LogIn, MailCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col justify-center gap-6">
        <Button asChild className="w-fit" variant="ghost">
          <Link href={`/org/${slug}/feed`}>
            <ArrowLeft className="size-4" />
            Back to forum
          </Link>
        </Button>

        <div className="grid w-full gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-slate-800 bg-[#111827] text-white">
            <SectionHeading
              eyebrow="Create account"
              level={1}
              title="Join Wavespark by invitation"
              description="The public forum is open to read. Member accounts are created by an admin so posting, replies, follows, and intro requests stay inside the approved community."
              tone="inverse"
            />
          </Card>

          <Card className="space-y-5">
            <div className="flex size-11 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <MailCheck className="size-5" />
            </div>
            <SectionHeading
              eyebrow="Invitation-only access"
              title="Use the credentials your admin sent"
              description="If you already have an email and temporary password, sign in to finish your community profile. If you need access, ask a Wavespark admin to create your member account."
            />
            <Button asChild>
              <Link href={`/org/${slug}/signin`}>
                <LogIn className="size-4" />
                Sign in
              </Link>
            </Button>
          </Card>
        </div>
      </div>
    </main>
  );
}

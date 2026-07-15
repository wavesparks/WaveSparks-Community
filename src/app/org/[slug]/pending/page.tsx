import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/layout/sign-out-button";
import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getViewerContext } from "@/lib/auth";
import { isClerkConfigured } from "@/lib/env";
import { singleQueryValue } from "@/lib/feed-filters";

export default async function PendingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const viewer = await getViewerContext(slug, { requireAuth: true });
  if (!viewer) return null;

  if (viewer.membership.accountStatus === "connected") {
    redirect(`/org/${slug}`);
  }

  const inactive =
    viewer.membership.accountStatus === "suspended" ||
    viewer.membership.accountStatus === "deprovisioned";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <Card className="w-full space-y-6">
        <StatusBanner status={singleQueryValue(query.status)} />
        <SectionHeading
          description={
            inactive
              ? "Your account cannot currently enter Main Community or any Event Space. Contact the community team if you believe this is a mistake."
              : "Your invitation is connected to this email, but account setup has not finished yet. Complete the Clerk organization invitation, then sign in again."
          }
          eyebrow="Account access"
          level={1}
          title={inactive ? "Account access is paused" : "Finish connecting your account"}
        />
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
          <p className="text-sm font-semibold text-[var(--ink)]">Account status</p>
          <p className="mt-1 text-sm capitalize text-[var(--ink-soft)]">
            {viewer.membership.accountStatus}
          </p>
        </div>
        <SignOutButton
          callbackUrl={`/org/${slug}`}
          mode={isClerkConfigured() ? "clerk" : "local"}
          tone="light"
        />
      </Card>
    </main>
  );
}

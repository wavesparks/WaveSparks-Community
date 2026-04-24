import Link from "next/link";

import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getViewerContext } from "@/lib/auth";
import { canAccessFeed } from "@/server/permissions";

export default async function PendingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug, { requireAuth: true });

  if (!viewer) {
    return null;
  }

  if (canAccessFeed(viewer.membership, viewer.profile)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <Card className="w-full space-y-4">
          <SectionHeading title="You’re approved and ready to go" />
          <Link className="text-sm font-semibold text-[var(--accent)]" href={`/org/${slug}/feed`}>
            Enter the community feed
          </Link>
        </Card>
      </main>
    );
  }

  const copy =
    viewer.membership.status === "pending"
      ? {
          title: "Your application is in review",
          body: "Admins can see your full profile and will approve, waitlist, or reject access from the membership queue.",
        }
      : viewer.membership.status === "rejected"
        ? {
            title: "Your application wasn’t approved",
            body: viewer.membership.approvalNote ?? "You can contact Wavespark if you think this was a mistake.",
          }
        : {
            title: "Your access is currently paused",
            body: viewer.membership.approvalNote ?? "Suspended members cannot enter the feed or matching surfaces.",
          };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <Card className="w-full space-y-6">
        <SectionHeading
          eyebrow={viewer.membership.status}
          title={copy.title}
          description={copy.body}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-slate-50 shadow-none">
            <p className="text-sm text-slate-700">
              Profile completion stays open while you wait, so you can sharpen your
              matching context before approval.
            </p>
            <Link
              className="mt-4 inline-flex text-sm font-semibold text-[var(--accent)]"
              href={`/org/${slug}/onboarding`}
            >
              Continue editing your profile
            </Link>
          </Card>
          <Card className="bg-slate-50 shadow-none">
            <p className="text-sm text-slate-700">
              Access note: {viewer.membership.approvalNote ?? "No admin note yet."}
            </p>
          </Card>
        </div>
      </Card>
    </main>
  );
}

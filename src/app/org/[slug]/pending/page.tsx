import { AlertCircle, CheckCircle2, Circle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { getViewerContext } from "@/lib/auth";
import { getPendingAccessExperience } from "@/lib/activation";
import { isClerkConfigured } from "@/lib/env";
import { singleQueryValue } from "@/lib/feed-filters";
import { canAccessFeed } from "@/server/permissions";

export default async function PendingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const viewer = await getViewerContext(slug, { requireAuth: true });

  if (!viewer) {
    return null;
  }

  if (canAccessFeed(viewer.membership, viewer.profile)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <Card className="w-full space-y-4">
          <SectionHeading level={1} title="You’re approved and ready to go" />
          <LinkButton className="w-fit" href={`/org/${slug}/feed`} variant="secondary">
            Enter the community feed
          </LinkButton>
        </Card>
      </main>
    );
  }

  const experience = getPendingAccessExperience(
    viewer.membership.status,
    viewer.membership.approvalNote,
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl items-center px-4 py-8 sm:px-6 lg:px-8">
      <Card className="w-full space-y-6">
        <StatusBanner status={singleQueryValue(query.status)} />
        <SectionHeading
          eyebrow={viewer.membership.status}
          level={1}
          title={experience.title}
          description={experience.body}
        />
        <div className="grid gap-4">
          {experience.timeline.map((item) => {
            const Icon =
              item.status === "complete"
                ? CheckCircle2
                : item.status === "blocked"
                  ? AlertCircle
                  : Circle;

            return (
              <div
                className="flex gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4"
                key={item.title}
              >
                <Icon className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
            <p className="text-sm font-semibold text-[var(--ink)]">{experience.noteLabel}</p>
            <p className="text-sm text-[var(--ink-soft)]">
              {viewer.membership.approvalNote ?? "No admin note yet."}
            </p>
          </div>
        </div>
        {experience.primaryHref && experience.primaryLabel ? (
          <LinkButton className="w-fit" href={`/org/${slug}/${experience.primaryHref}`}>
            {experience.primaryLabel}
          </LinkButton>
        ) : null}
        <SignOutButton
          callbackUrl={`/org/${slug}/feed`}
          mode={isClerkConfigured() ? "clerk" : "local"}
          tone="light"
        />
      </Card>
    </main>
  );
}

import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { saveOnboardingAction } from "@/actions/member";
import { getViewerContext } from "@/lib/auth";
import { emptyProfileForMember } from "@/lib/profile-form";
import { getProfileLinks } from "@/server/view-models";
import type { CSSProperties } from "react";

export default async function OnboardingPage({
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

  const profile =
    viewer.profile ?? emptyProfileForMember(viewer.user, viewer.membership);
  const links = viewer.profile ? await getProfileLinks(viewer.profile.id) : [];
  const action = saveOnboardingAction.bind(null, slug, viewer.membership.id);
  const status = Array.isArray(query.status) ? query.status[0] : query.status;
  const requestedStep = Number(Array.isArray(query.step) ? query.step[0] : query.step);
  const missing = Array.isArray(query.missing) ? query.missing[0] : query.missing;

  return (
    <main
      className="min-h-screen bg-[var(--canvas)]"
      style={
        {
          "--accent": viewer.org.theme.accent,
          "--accent-soft": viewer.org.theme.accentSoft,
          "--canvas": viewer.org.theme.canvas,
          "--ink": viewer.org.theme.ink,
        } as CSSProperties
      }
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="ws-hero-art rounded-lg p-5 text-[var(--surface)] shadow-sm">
          <SectionHeading
            eyebrow="Onboarding"
            level={1}
            title="Build a profile strong enough for serious intros"
            description="This profile powers the feed, match ranking, credibility cues, and admin review. Contact details stay hidden from members until an intro is accepted."
            tone="inverse"
          />
        </section>

        <section className="space-y-6">
          <StatusBanner status={status} />
          {missing ? (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--ink)]">
              <p className="font-semibold">Still required</p>
              <p className="mt-1 text-[var(--ink-soft)]">{missing}</p>
            </div>
          ) : null}
          <SectionHeading
            title={viewer.profile ? "Refresh your profile" : "Complete your profile"}
            description="The more specific this is, the more useful your match cards and intro requests become."
          />
          <OnboardingForm
            action={action}
            initialStep={Number.isInteger(requestedStep) ? requestedStep : 0}
            links={links}
            profile={profile}
          />
        </section>
      </div>
    </main>
  );
}

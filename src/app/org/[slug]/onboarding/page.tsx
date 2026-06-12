import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { SectionHeading } from "@/components/ui/section-heading";
import { saveOnboardingAction } from "@/actions/member";
import { getViewerContext } from "@/lib/auth";
import { emptyProfileForMember } from "@/lib/profile-form";
import { getProfileLinks } from "@/server/view-models";
import type { CSSProperties } from "react";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const viewer = await getViewerContext(slug, { requireAuth: true });

  if (!viewer) {
    return null;
  }

  const profile =
    viewer.profile ?? emptyProfileForMember(viewer.user, viewer.membership);
  const links = viewer.profile ? await getProfileLinks(viewer.profile.id) : [];
  const action = saveOnboardingAction.bind(null, slug, viewer.membership.id);

  return (
    <main
      className="min-h-screen bg-[var(--canvas)]"
      style={
        {
          "--accent": viewer.org.theme.accent,
          "--accent-soft": viewer.org.theme.accentSoft,
          "--canvas": "#f6f7fb",
          "--ink": viewer.org.theme.ink,
        } as CSSProperties
      }
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-lg bg-[#111827] p-5 text-white shadow-sm">
          <SectionHeading
            eyebrow="Onboarding"
            level={1}
            title="Build a profile strong enough for serious intros"
            description="This profile powers the feed, match ranking, credibility cues, and admin review. Contact details stay hidden from members until an intro is accepted."
            tone="inverse"
          />
        </section>

        <section className="space-y-6">
          <SectionHeading
            title={viewer.profile ? "Refresh your profile" : "Complete your profile"}
            description="The more specific this is, the more useful your match cards and intro requests become."
          />
          <OnboardingForm action={action} links={links} profile={profile} />
        </section>
      </div>
    </main>
  );
}

import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { saveOnboardingAction } from "@/actions/member";
import { getViewerContext } from "@/lib/auth";
import { emptyProfileForMember } from "@/lib/profile-form";
import { getProfileLinks } from "@/server/view-models";
import { listMatchTypeConfigsForOrg } from "@/server/store";
import type { CSSProperties } from "react";

const validationFieldMeta: Record<string, { label: string; step: number }> = {
  linkedin_url: { label: "LinkedIn", step: 0 },
  github_url: { label: "GitHub", step: 0 },
  website_url: { label: "Website", step: 0 },
  x_url: { label: "X", step: 0 },
  years_of_experience: { label: "Years of experience", step: 2 },
  email_for_intro: { label: "Email for intro", step: 3 },
  ambition_level: { label: "Ambition level", step: 3 },
  risk_tolerance: { label: "Risk tolerance", step: 3 },
  structure_vs_chaos: { label: "Structure vs chaos", step: 3 },
  max_mentees: { label: "Max mentees", step: 3 },
};

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const viewer = await getViewerContext(slug, {
    requireAuth: true,
    requireConnected: true,
  });

  if (!viewer) {
    return null;
  }

  const profile =
    viewer.profile ?? emptyProfileForMember(viewer.user, viewer.membership);
  const [links, matchTypeConfigs] = await Promise.all([
    viewer.profile ? getProfileLinks(viewer.profile.id) : Promise.resolve([]),
    listMatchTypeConfigsForOrg(viewer.org.id),
  ]);
  const action = saveOnboardingAction.bind(null, slug, viewer.membership.id);
  const status = Array.isArray(query.status) ? query.status[0] : query.status;
  const requestedStep = Number(Array.isArray(query.step) ? query.step[0] : query.step);
  const missing = Array.isArray(query.missing) ? query.missing[0] : query.missing;
  const fields = Array.isArray(query.fields) ? query.fields[0] : query.fields;
  const requestedSpace = Array.isArray(query.space) ? query.space[0] : query.space;
  const returnTo =
    requestedSpace && /^[a-z0-9][a-z0-9-]{0,127}$/.test(requestedSpace)
      ? `/org/${slug}/s/${requestedSpace}/feed`
      : `/org/${slug}/profile`;
  const invalidFields = (fields ?? "")
    .split(",")
    .map((field) => validationFieldMeta[field])
    .filter((field): field is { label: string; step: number } => Boolean(field));
  const validationStep = invalidFields.length
    ? Math.min(...invalidFields.map((field) => field.step))
    : 0;
  const initialStep = Number.isInteger(requestedStep) ? requestedStep : validationStep;

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
            description="This is your global profile across every Community and Event Space. Contact details stay hidden until an intro is accepted; each Space keeps its own goals and matching preference."
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
          {invalidFields.length ? (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--ink)]">
              <p className="font-semibold">Fields to fix before saving</p>
              <p className="mt-1 text-[var(--ink-soft)]">
                {invalidFields.map((field) => field.label).join(", ")}
              </p>
            </div>
          ) : null}
          <SectionHeading
            title={viewer.profile ? "Refresh your profile" : "Complete your profile"}
            description="These core details appear in every Space you join. You will set event-specific goals and offers inside each Space."
          />
          <OnboardingForm
            action={action}
            initialStep={initialStep}
            links={links}
            matchTypeConfigs={matchTypeConfigs}
            profile={profile}
            returnTo={returnTo}
          />
        </section>
      </div>
    </main>
  );
}

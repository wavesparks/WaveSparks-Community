import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { updateProfileFlagsAction } from "@/actions/admin";
import { AppShell } from "@/components/layout/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBanner } from "@/components/ui/status-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { getViewerContext } from "@/lib/auth";
import { singleQueryValue } from "@/lib/feed-filters";
import { listMembershipProfileRecordsForOrg } from "@/server/store";
import { toFullAdminProfile } from "@/server/view-models";
import type { FullAdminProfile } from "@/lib/domain";

const profileQueues = [
  { label: "All", flag: undefined },
  { label: "Featured", flag: "featured" },
  { label: "Needs review", flag: "stale" },
] satisfies Array<{
  label: string;
  flag?: "featured" | "stale";
}>;

function profileFlagFromQuery(value?: string) {
  return value === "featured" || value === "stale" ? value : undefined;
}

function profileQueueHref(slug: string, queue: (typeof profileQueues)[number]) {
  const params = new URLSearchParams();
  if (queue.flag) {
    params.set("profile_flag", queue.flag);
  }

  const query = params.toString();
  return `/org/${slug}/admin/profiles${query ? `?${query}` : ""}`;
}

function cleanValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function humanizeValue(value: string) {
  const words = value.trim().replaceAll("_", " ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

function distinctText(value: string, ...duplicates: string[]) {
  const text = value.trim();
  if (!text) return "";
  const normalized = text.toLocaleLowerCase();
  return duplicates.some((duplicate) => duplicate.trim().toLocaleLowerCase() === normalized)
    ? ""
    : text;
}

function ProfileField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value?: number | string | null;
  wide?: boolean;
}) {
  const text = value === null || value === undefined ? "" : String(value).trim();
  if (!text) return null;

  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">{text}</dd>
    </div>
  );
}

function ProfileTags({ label, values }: { label: string; values: string[] }) {
  const tags = cleanValues(values);
  if (!tags.length) return null;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-soft)]">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={`${label}-${tag}`} variant="muted">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function InspectorSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-4">
      <h4 className="text-base font-semibold text-[var(--ink)]">{title}</h4>
      {children}
    </section>
  );
}

function ProfileInspector({ profile }: { profile: FullAdminProfile }) {
  const startupOneLiner = distinctText(profile.startupOneLiner, profile.currentFocus);
  const startupDescription = distinctText(
    profile.startupDescription,
    profile.problemInterest,
  );
  const currentProgress = distinctText(profile.currentProgress, profile.currentFocus);
  const priorProjects = distinctText(profile.priorProjects, profile.currentFocus);
  const hasProjectDetails = Boolean(
    profile.startupName.trim() ||
      startupOneLiner ||
      startupDescription ||
      profile.stage.trim() ||
      currentProgress ||
      profile.tractionSummary.trim() ||
      profile.regionFocus.trim() ||
      priorProjects ||
      profile.notableWins.trim() ||
      profile.industryTags.length ||
      profile.problemSpaceTags.length ||
      profile.businessModelTags.length,
  );
  const hasMentorDetails = Boolean(
    profile.mentorExpertiseTags.length ||
      profile.mentorStageExperience.length ||
      profile.mentorFunctionalStrengths.length ||
      profile.mentorOffers.length ||
      profile.mentorAvailability.trim() ||
      profile.maxMentees !== null ||
      profile.mentorshipPreferences.trim(),
  );

  return (
    <details className="group rounded-lg border border-[var(--line)] bg-[var(--surface)]">
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--ink)] marker:content-none"
      >
        <span>View complete profile</span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-[var(--ink-soft)] transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-7 border-t border-[var(--line)] p-4 md:p-5">
        <InspectorSection title="Background and current focus">
          <dl className="grid gap-4 md:grid-cols-2">
            <ProfileField label="About" value={profile.bio} wide />
            <ProfileField label="Current status" value={humanizeValue(profile.currentStatus)} />
            <ProfileField label="School or company" value={profile.schoolOrCompany} />
            <ProfileField label="Location" value={profile.location} />
            <ProfileField label="Timezone" value={profile.timezone} />
            <ProfileField label="Current focus" value={profile.currentFocus} wide />
            <ProfileField
              label="Problem, topic, or opportunity"
              value={profile.problemInterest}
              wide
            />
            <ProfileField
              label="Technical experience level"
              value={
                profile.technicalExperienceLevel === "not_sure"
                  ? undefined
                  : humanizeValue(profile.technicalExperienceLevel)
              }
            />
            <ProfileField
              label="Years of experience"
              value={profile.yearsOfExperience > 0 ? profile.yearsOfExperience : undefined}
            />
            <ProfileField
              label="Technical and product experience"
              value={profile.technicalExperience}
              wide
            />
          </dl>
        </InspectorSection>

        {hasProjectDetails ? (
          <InspectorSection title="Project and experience">
            <dl className="grid gap-4 md:grid-cols-2">
              <ProfileField label="Project or startup" value={profile.startupName} />
              <ProfileField label="Stage" value={humanizeValue(profile.stage)} />
              <ProfileField label="Project in one line" value={startupOneLiner} wide />
              <ProfileField label="Project description" value={startupDescription} wide />
              <ProfileField label="Current progress" value={currentProgress} wide />
              <ProfileField label="Traction" value={profile.tractionSummary} wide />
              <ProfileField label="Region focus" value={profile.regionFocus} />
              <ProfileField label="Prior projects" value={priorProjects} wide />
              <ProfileField label="Notable wins" value={profile.notableWins} wide />
            </dl>
            <div className="grid gap-4 md:grid-cols-3">
              <ProfileTags label="Industries" values={profile.industryTags} />
              <ProfileTags label="Problem spaces" values={profile.problemSpaceTags} />
              <ProfileTags label="Business models" values={profile.businessModelTags} />
            </div>
          </InspectorSection>
        ) : null}

        <InspectorSection title="Matching intent and contribution">
          <div className="grid gap-4 md:grid-cols-2">
            <ProfileTags label="Generally looking for" values={profile.lookingForTypes} />
            <ProfileTags
              label="Seeking match types"
              values={profile.seekingMatchTypes.map(humanizeValue)}
            />
            <ProfileTags
              label="Offering match types"
              values={profile.offeringMatchTypes.map(humanizeValue)}
            />
            <ProfileTags label="People they want to meet" values={profile.desiredRoles} />
            <ProfileTags label="Help needed" values={profile.helpNeededTags} />
            <ProfileTags label="Skills" values={profile.skillTags} />
            <ProfileTags label="Top strengths" values={profile.topStrengths} />
            <ProfileTags label="Can contribute" values={profile.canContribute} />
          </div>
          <dl className="grid gap-4 md:grid-cols-2">
            <ProfileField
              label="Ideal connection"
              value={profile.idealMatchDescription}
              wide
            />
            <ProfileField
              label="Visible in matching"
              value={profile.profileVisibleInMatching ? "Yes" : "No"}
            />
            <ProfileField
              label="Open to introductions"
              value={profile.introOptIn ? "Yes" : "No"}
            />
          </dl>
        </InspectorSection>

        <InspectorSection title="Availability and collaboration style">
          <dl className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ProfileField label="Time commitment" value={profile.timeCommitment} />
            <ProfileField label="Available from" value={profile.availabilityStart} />
            <ProfileField label="Remote preference" value={profile.remotePreference} />
            <ProfileField
              label="Preferred geographies"
              value={cleanValues(profile.preferredGeographies).join(", ")}
            />
            <ProfileField
              label="Meeting frequency"
              value={profile.meetingFrequencyPreference}
            />
            <ProfileField label="Work style" value={profile.workStyle} />
            <ProfileField label="Communication style" value={profile.communicationStyle} />
            <ProfileField label="Decision style" value={profile.decisionStyle} />
            <ProfileField label="Conflict style" value={profile.conflictStyle} />
            <ProfileField label="Speed preference" value={profile.speedPreference} />
            <ProfileField label="Commitment horizon" value={profile.commitmentHorizon} />
            <ProfileField
              label="Mission vs market"
              value={profile.missionVsMarketOrientation}
            />
            <ProfileField
              label="Ambition level"
              value={profile.ambitionLevel > 0 ? `${profile.ambitionLevel} / 5` : undefined}
            />
            <ProfileField
              label="Risk tolerance"
              value={profile.riskTolerance > 0 ? `${profile.riskTolerance} / 5` : undefined}
            />
            <ProfileField
              label="Structure vs chaos"
              value={profile.structureVsChaos > 0 ? `${profile.structureVsChaos} / 5` : undefined}
            />
          </dl>
        </InspectorSection>

        {hasMentorDetails ? (
          <InspectorSection title="Mentoring">
            <div className="grid gap-4 md:grid-cols-2">
              <ProfileTags label="Mentor expertise" values={profile.mentorExpertiseTags} />
              <ProfileTags
                label="Stages they know"
                values={profile.mentorStageExperience}
              />
              <ProfileTags
                label="Functional strengths"
                values={profile.mentorFunctionalStrengths}
              />
              <ProfileTags label="Mentor offers" values={profile.mentorOffers} />
            </div>
            <dl className="grid gap-4 md:grid-cols-2">
              <ProfileField label="Mentor availability" value={profile.mentorAvailability} />
              <ProfileField label="Maximum mentees" value={profile.maxMentees} />
              <ProfileField
                label="Mentorship preferences"
                value={profile.mentorshipPreferences}
                wide
              />
            </dl>
          </InspectorSection>
        ) : null}
      </div>
    </details>
  );
}

function AdminProfileCard({ profile, slug }: { profile: FullAdminProfile; slug: string }) {
  const hasContact = Boolean(profile.emailForIntro.trim() || profile.whatsappNumber.trim());
  const hasInterests = Boolean(profile.desiredRoles.length || profile.mentorOffers.length);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar className="size-12" name={profile.displayName} src={profile.photo} />
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-[var(--ink)]">{profile.displayName}</h3>
            {profile.headline ? (
              <p className="text-sm leading-6 text-[var(--ink-soft)]">{profile.headline}</p>
            ) : null}
            {profile.location ? (
              <p className="mt-1 text-xs text-[var(--ink-soft)]">{profile.location}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="muted">{profile.affiliationLabel}</Badge>
          <Badge
            variant={profile.profileCompletionPercent === 100 ? "accent" : "default"}
          >
            {profile.profileCompletionPercent === 100
              ? "Profile complete"
              : `${profile.profileCompletionPercent}% complete`}
          </Badge>
        </div>
      </div>

      {hasContact || hasInterests ? (
        <div className="grid gap-4 md:grid-cols-2">
          {hasContact ? (
            <div
              className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--ink-soft)]"
            >
              <p className="font-semibold text-[var(--ink)]">Contact</p>
              {profile.emailForIntro ? <p className="mt-2 break-words">{profile.emailForIntro}</p> : null}
              {profile.whatsappNumber ? <p>{profile.whatsappNumber}</p> : null}
            </div>
          ) : null}
          {hasInterests ? (
            <div
              className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--ink-soft)]"
            >
              <p className="font-semibold text-[var(--ink)]">Interests and ways to help</p>
              {profile.desiredRoles.length ? (
                <p className="mt-2">Wants to meet: {profile.desiredRoles.join(", ")}</p>
              ) : null}
              {profile.mentorOffers.length ? (
                <p>Can mentor on: {profile.mentorOffers.join(", ")}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {profile.startupDescription ? (
        <p className="text-sm leading-6 text-[var(--ink-soft)]">{profile.startupDescription}</p>
      ) : null}

      <ProfileInspector profile={profile} />

      <div className="flex flex-wrap gap-3">
        <form action={updateProfileFlagsAction.bind(null, slug, profile.profileId)}>
          <input name="featured" type="hidden" value={String(!profile.featured)} />
          <input name="stale" type="hidden" value={String(profile.stale)} />
          <SubmitButton pendingLabel="Updating" variant="secondary">
            {profile.featured ? "Unfeature" : "Feature"}
          </SubmitButton>
        </form>
        <form action={updateProfileFlagsAction.bind(null, slug, profile.profileId)}>
          <input name="featured" type="hidden" value={String(profile.featured)} />
          <input name="stale" type="hidden" value={String(!profile.stale)} />
          <SubmitButton pendingLabel="Updating" variant="secondary">
            {profile.stale ? "Mark as reviewed" : "Mark as needs review"}
          </SubmitButton>
        </form>
      </div>
    </Card>
  );
}

export default async function AdminProfilesPage({
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
    requireAdmin: true,
  });

  if (!viewer) {
    return null;
  }

  const selectedProfileFlag = profileFlagFromQuery(singleQueryValue(query.profile_flag));
  const profiles = (await listMembershipProfileRecordsForOrg(viewer.org.id, {
    featured: selectedProfileFlag === "featured" ? true : undefined,
    limit: 100,
    profileRequired: true,
    stale: selectedProfileFlag === "stale" ? true : undefined,
  }))
    .map(({ membership, profile }) =>
      profile ? toFullAdminProfile(profile, membership) : null,
    )
    .filter((profile): profile is FullAdminProfile => Boolean(profile));

  return (
    <AppShell currentPath={`/org/${slug}/admin/profiles`} viewer={viewer}>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SectionHeading
            eyebrow="Admin · Profiles"
            level={1}
            title="Member profiles"
            description="Review member details, contact information, and profiles that need attention."
          />
          <LinkButton href={`/org/${slug}/admin/profiles/export`}>Export CSV</LinkButton>
        </div>
        <StatusBanner status={singleQueryValue(query.status)} />

        <div className="space-y-6">
          <div className="space-y-4">
            <SectionHeading eyebrow="Members" title="Profiles" />
            <div className="flex flex-wrap gap-2">
              {profileQueues.map((queue) => {
                const active = queue.flag === selectedProfileFlag;

                return (
                  <LinkButton
                    href={profileQueueHref(slug, queue)}
                    key={queue.label}
                    size="sm"
                    variant={active ? "primary" : "secondary"}
                  >
                    {queue.label}
                  </LinkButton>
                );
              })}
            </div>
          </div>
          {profiles.map((profile) => (
            <AdminProfileCard key={profile.profileId} profile={profile} slug={slug} />
          ))}
          {!profiles.length ? (
            <Card>
              <p className="text-sm font-semibold text-[var(--ink)]">No profiles found yet</p>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Completed member profiles will appear here. You can also download them as a CSV.
              </p>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

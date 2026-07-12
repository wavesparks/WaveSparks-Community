"use client";

import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import {
  getProfileReadiness,
  getProfileReadinessFromFormData,
} from "@/lib/activation";
import { onboardingSteps } from "@/lib/constants";
import { AvatarUploadField } from "@/components/onboarding/avatar-upload-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import type { Profile, ProfileLink } from "@/lib/domain";

function linkValue(links: ProfileLink[], type: ProfileLink["type"]) {
  return links.find((link) => link.type === type)?.url ?? "";
}

const stepByReadinessField: Record<string, number> = {
  preferred_name: 0,
  headline: 0,
  startup_one_liner: 1,
  startup_description: 1,
  looking_for_types: 2,
  desired_roles: 2,
  skill_tags: 2,
  email_for_intro: 3,
};

export function OnboardingForm({
  action,
  profile,
  links,
  initialStep = 0,
}: {
  action: (formData: FormData) => void;
  profile: Profile;
  links: ProfileLink[];
  initialStep?: number;
}) {
  const [step, setStep] = useState(Math.max(0, Math.min(initialStep, onboardingSteps.length - 1)));
  const [readiness, setReadiness] = useState(() => getProfileReadiness(profile));
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const stepPanelClass =
    "grid gap-5 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm md:grid-cols-2";

  function updateReadiness(form: HTMLFormElement) {
    const next = getProfileReadinessFromFormData(new FormData(form), profile);
    setReadiness(next);
    return next;
  }

  return (
    <form
      action={action}
      className="space-y-6"
      onInput={(event) => {
        setValidationNotice(null);
        updateReadiness(event.currentTarget);
      }}
      onSubmit={(event) => {
        const submitter = event.nativeEvent.submitter as HTMLButtonElement | null;
        if (submitter?.value === "draft") {
          return;
        }
        const next = updateReadiness(event.currentTarget);

        if (next.isReady) {
          return;
        }

        event.preventDefault();
        setValidationNotice(
          `Add ${next.missingFields.map((field) => field.label).join(", ")} before completing onboarding.`,
        );
        setStep(
          Math.min(
            ...next.missingFields.map((field) => stepByReadinessField[field.key] ?? 0),
          ),
        );
      }}
    >
      <div
        aria-live="polite"
        className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--accent)]">
              Profile readiness
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--ink)]">
              {readiness.isReady
                ? "Ready for matching and intros"
                : "Add the minimum context before saving"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
              Saving updates your match ranking, feed recommendations, and intro context.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-right">
            <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">
              Complete
            </p>
            <p className="text-2xl font-semibold text-[var(--ink)]">
              {readiness.completionPercent}%
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
          <div className="flex gap-3">
            {readiness.isReady ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
            ) : (
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
            )}
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">
                {readiness.isReady
                  ? "All required activation fields are filled."
                  : "Required before final save"}
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                {readiness.isReady
                  ? "You can still add more detail, but the profile has enough signal to activate."
                  : readiness.missingFields.map((field) => field.label).join(", ")}
              </p>
              {validationNotice ? (
                <p className="mt-2 text-sm font-medium text-[var(--accent)]">{validationNotice}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        {onboardingSteps.map((item, index) => (
          <button
            aria-current={index === step ? "step" : undefined}
            className={
              index === step
                ? "rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-left shadow-sm transition duration-150 ease-out active:translate-y-px active:scale-[0.99]"
                : "rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-left transition duration-150 ease-out hover:border-[var(--line)] hover:bg-[var(--surface-muted)] active:translate-y-px active:scale-[0.99]"
            }
            key={item.key}
            onClick={() => setStep(index)}
            type="button"
          >
            <p className="text-xs font-semibold uppercase text-[var(--ink-soft)]">
              Step {index + 1}
            </p>
            <h3 className="mt-2 text-sm font-semibold text-[var(--ink)]">{item.title}</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">{item.description}</p>
          </button>
        ))}
      </div>

      <div className={step === 0 ? stepPanelClass : "hidden"}>
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input defaultValue={profile.fullName} id="full_name" name="full_name" />
        </div>
        <div>
          <Label htmlFor="preferred_name">Preferred name</Label>
          <Input
            defaultValue={profile.preferredName}
            id="preferred_name"
            name="preferred_name"
          />
        </div>
        <div>
          <Label htmlFor="display_name_preference">Display style</Label>
          <Select
            defaultValue={profile.displayNamePreference}
            id="display_name_preference"
            name="display_name_preference"
          >
            <option value="preferred_name">Preferred name</option>
            <option value="first_name_last_initial">First name + last initial</option>
          </Select>
        </div>
        <AvatarUploadField
          defaultValue={profile.profilePhoto}
          displayName={profile.preferredName || profile.fullName}
        />
        <div>
          <Label htmlFor="city">City</Label>
          <Input defaultValue={profile.city} id="city" name="city" />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input defaultValue={profile.country} id="country" name="country" />
        </div>
        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <Input defaultValue={profile.timezone} id="timezone" name="timezone" />
        </div>
        <div>
          <Label htmlFor="school_or_company">School or company</Label>
          <Input
            defaultValue={profile.schoolOrCompany}
            id="school_or_company"
            name="school_or_company"
          />
        </div>
        <div>
          <Label htmlFor="current_status">Current status</Label>
          <Select defaultValue={profile.currentStatus} id="current_status" name="current_status">
            <option value="student">Student</option>
            <option value="alumni">Alumni</option>
            <option value="founder">Founder</option>
            <option value="operator">Operator</option>
            <option value="mentor">Mentor</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="headline">Headline</Label>
          <Input defaultValue={profile.headline} id="headline" name="headline" />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="short_bio">Short bio</Label>
          <Textarea defaultValue={profile.shortBio} id="short_bio" name="short_bio" />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="long_bio">Long bio</Label>
          <Textarea defaultValue={profile.longBio} id="long_bio" name="long_bio" />
        </div>
        <div>
          <Label htmlFor="linkedin_url">LinkedIn</Label>
          <Input defaultValue={linkValue(links, "linkedin")} id="linkedin_url" name="linkedin_url" type="url" />
        </div>
        <div>
          <Label htmlFor="github_url">GitHub</Label>
          <Input defaultValue={linkValue(links, "github")} id="github_url" name="github_url" type="url" />
        </div>
        <div>
          <Label htmlFor="website_url">Website</Label>
          <Input defaultValue={linkValue(links, "website")} id="website_url" name="website_url" type="url" />
        </div>
        <div>
          <Label htmlFor="x_url">X</Label>
          <Input defaultValue={linkValue(links, "x")} id="x_url" name="x_url" type="url" />
        </div>
      </div>

      <div className={step === 1 ? stepPanelClass : "hidden"}>
        <div>
          <Label htmlFor="startup_name">Startup name</Label>
          <Input defaultValue={profile.startupName} id="startup_name" name="startup_name" />
        </div>
        <div>
          <Label htmlFor="stage">Stage</Label>
          <Select defaultValue={profile.stage} id="stage" name="stage">
            <option value="exploring">Exploring</option>
            <option value="idea">Idea</option>
            <option value="pre-MVP">Pre-MVP</option>
            <option value="MVP">MVP</option>
            <option value="early traction">Early traction</option>
            <option value="scaling">Scaling</option>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="startup_one_liner">What are you building?</Label>
          <Input
            defaultValue={profile.startupOneLiner}
            id="startup_one_liner"
            name="startup_one_liner"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="startup_description">Longer description</Label>
          <Textarea
            defaultValue={profile.startupDescription}
            id="startup_description"
            name="startup_description"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="current_progress">Current progress</Label>
          <Textarea
            defaultValue={profile.currentProgress}
            id="current_progress"
            name="current_progress"
          />
        </div>
        <div>
          <Label htmlFor="traction_summary">Traction summary</Label>
          <Textarea
            defaultValue={profile.tractionSummary}
            id="traction_summary"
            name="traction_summary"
          />
        </div>
        <div>
          <Label htmlFor="region_focus">Region focus</Label>
          <Input defaultValue={profile.regionFocus} id="region_focus" name="region_focus" />
        </div>
        <div>
          <Label htmlFor="industry_tags">Industry tags</Label>
          <Input
            defaultValue={profile.industryTags.join(", ")}
            id="industry_tags"
            name="industry_tags"
            placeholder="climate, fintech"
          />
        </div>
        <div>
          <Label htmlFor="problem_space_tags">Problem space tags</Label>
          <Input
            defaultValue={profile.problemSpaceTags.join(", ")}
            id="problem_space_tags"
            name="problem_space_tags"
            placeholder="trust, workflow automation"
          />
        </div>
        <div>
          <Label htmlFor="business_model_tags">Business model tags</Label>
          <Input
            defaultValue={profile.businessModelTags.join(", ")}
            id="business_model_tags"
            name="business_model_tags"
            placeholder="B2B SaaS, enterprise"
          />
        </div>
      </div>

      <div className={step === 2 ? stepPanelClass : "hidden"}>
        <div>
          <Label htmlFor="looking_for_types">Looking for</Label>
          <Input
            defaultValue={profile.lookingForTypes.join(", ")}
            id="looking_for_types"
            name="looking_for_types"
            placeholder="cofounder, mentor, teammate"
          />
        </div>
        <div>
          <Label htmlFor="desired_roles">Desired roles</Label>
          <Input
            defaultValue={profile.desiredRoles.join(", ")}
            id="desired_roles"
            name="desired_roles"
            placeholder="technical, design, GTM"
          />
        </div>
        <div>
          <Label htmlFor="help_needed_tags">Help needed</Label>
          <Input
            defaultValue={profile.helpNeededTags.join(", ")}
            id="help_needed_tags"
            name="help_needed_tags"
            placeholder="enterprise sales, onboarding"
          />
        </div>
        <div>
          <Label htmlFor="skill_tags">Skill tags</Label>
          <Input
            defaultValue={profile.skillTags.join(", ")}
            id="skill_tags"
            name="skill_tags"
            placeholder="backend, product, research"
          />
        </div>
        <div>
          <Label htmlFor="top_strengths">Top strengths</Label>
          <Input
            defaultValue={profile.topStrengths.join(", ")}
            id="top_strengths"
            name="top_strengths"
          />
        </div>
        <div>
          <Label htmlFor="can_contribute">Can contribute</Label>
          <Input
            defaultValue={profile.canContribute.join(", ")}
            id="can_contribute"
            name="can_contribute"
          />
        </div>
        <div>
          <Label htmlFor="years_of_experience">Years of experience</Label>
          <Input
            defaultValue={profile.yearsOfExperience}
            id="years_of_experience"
            name="years_of_experience"
            type="number"
            min={0}
            max={80}
          />
        </div>
        <div>
          <Label htmlFor="time_commitment">Time commitment</Label>
          <Select
            defaultValue={profile.timeCommitment}
            id="time_commitment"
            name="time_commitment"
          >
            <option value="full time">Full time</option>
            <option value="part time serious">Part time serious</option>
            <option value="exploratory">Exploratory</option>
            <option value="mentor only">Mentor only</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="availability_start">Availability start</Label>
          <Input
            defaultValue={profile.availabilityStart}
            id="availability_start"
            name="availability_start"
          />
        </div>
        <div>
          <Label htmlFor="remote_preference">Remote preference</Label>
          <Select
            defaultValue={profile.remotePreference}
            id="remote_preference"
            name="remote_preference"
          >
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="in person">In person</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="preferred_geographies">Preferred geographies</Label>
          <Input
            defaultValue={profile.preferredGeographies.join(", ")}
            id="preferred_geographies"
            name="preferred_geographies"
          />
        </div>
        <div>
          <Label htmlFor="meeting_frequency_preference">Meeting frequency</Label>
          <Input
            defaultValue={profile.meetingFrequencyPreference}
            id="meeting_frequency_preference"
            name="meeting_frequency_preference"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="ideal_match_description">Ideal match description</Label>
          <Textarea
            defaultValue={profile.idealMatchDescription}
            id="ideal_match_description"
            name="ideal_match_description"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="prior_projects">Prior projects</Label>
          <Textarea defaultValue={profile.priorProjects} id="prior_projects" name="prior_projects" />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="notable_wins">Notable wins</Label>
          <Textarea defaultValue={profile.notableWins} id="notable_wins" name="notable_wins" />
        </div>
      </div>

      <div className={step === 3 ? stepPanelClass : "hidden"}>
        <div>
          <Label htmlFor="ambition_level">Ambition level (1-5)</Label>
          <Input defaultValue={profile.ambitionLevel} id="ambition_level" name="ambition_level" type="number" min={1} max={5} />
        </div>
        <div>
          <Label htmlFor="risk_tolerance">Risk tolerance (1-5)</Label>
          <Input defaultValue={profile.riskTolerance} id="risk_tolerance" name="risk_tolerance" type="number" min={1} max={5} />
        </div>
        <div>
          <Label htmlFor="speed_preference">Speed preference</Label>
          <Select defaultValue={profile.speedPreference} id="speed_preference" name="speed_preference">
            <option value="move fast">Move fast</option>
            <option value="balanced">Balanced</option>
            <option value="careful">Careful</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="decision_style">Decision style</Label>
          <Select defaultValue={profile.decisionStyle} id="decision_style" name="decision_style">
            <option value="intuition-heavy">Intuition-heavy</option>
            <option value="balanced">Balanced</option>
            <option value="analytical">Analytical</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="work_style">Work style</Label>
          <Select defaultValue={profile.workStyle} id="work_style" name="work_style">
            <option value="maker">Maker</option>
            <option value="operator">Operator</option>
            <option value="seller">Seller</option>
            <option value="researcher">Researcher</option>
            <option value="hybrid">Hybrid</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="commitment_horizon">Commitment horizon</Label>
          <Select
            defaultValue={profile.commitmentHorizon}
            id="commitment_horizon"
            name="commitment_horizon"
          >
            <option value="side project">Side project</option>
            <option value="serious experiment">Serious experiment</option>
            <option value="startup attempt">Startup attempt</option>
            <option value="company-building">Company-building</option>
            <option value="mentor only">Mentor only</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="communication_style">Communication style</Label>
          <Input
            defaultValue={profile.communicationStyle}
            id="communication_style"
            name="communication_style"
          />
        </div>
        <div>
          <Label htmlFor="conflict_style">Conflict style</Label>
          <Input defaultValue={profile.conflictStyle} id="conflict_style" name="conflict_style" />
        </div>
        <div>
          <Label htmlFor="mission_vs_market_orientation">Mission vs market orientation</Label>
          <Input
            defaultValue={profile.missionVsMarketOrientation}
            id="mission_vs_market_orientation"
            name="mission_vs_market_orientation"
          />
        </div>
        <div>
          <Label htmlFor="structure_vs_chaos">Structure vs chaos (1-5)</Label>
          <Input
            defaultValue={profile.structureVsChaos}
            id="structure_vs_chaos"
            name="structure_vs_chaos"
            type="number"
            min={1}
            max={5}
          />
        </div>
        <div>
          <Label htmlFor="mentor_expertise_tags">Mentor expertise tags</Label>
          <Input
            defaultValue={profile.mentorExpertiseTags.join(", ")}
            id="mentor_expertise_tags"
            name="mentor_expertise_tags"
          />
        </div>
        <div>
          <Label htmlFor="mentor_stage_experience">Mentor stage experience</Label>
          <Input
            defaultValue={profile.mentorStageExperience.join(", ")}
            id="mentor_stage_experience"
            name="mentor_stage_experience"
          />
        </div>
        <div>
          <Label htmlFor="mentor_functional_strengths">Mentor strengths</Label>
          <Input
            defaultValue={profile.mentorFunctionalStrengths.join(", ")}
            id="mentor_functional_strengths"
            name="mentor_functional_strengths"
          />
        </div>
        <div>
          <Label htmlFor="mentor_availability">Mentor availability</Label>
          <Input
            defaultValue={profile.mentorAvailability}
            id="mentor_availability"
            name="mentor_availability"
          />
        </div>
        <div>
          <Label htmlFor="mentor_offers">Mentor offers</Label>
          <Input
            defaultValue={profile.mentorOffers.join(", ")}
            id="mentor_offers"
            name="mentor_offers"
          />
        </div>
        <div>
          <Label htmlFor="max_mentees">Max mentees</Label>
          <Input defaultValue={profile.maxMentees ?? ""} id="max_mentees" max={100} min={0} name="max_mentees" type="number" />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="mentorship_preferences">Mentorship preferences</Label>
          <Textarea
            defaultValue={profile.mentorshipPreferences}
            id="mentorship_preferences"
            name="mentorship_preferences"
          />
        </div>
        <div>
          <Label htmlFor="email_for_intro">Email for intro</Label>
          <Input defaultValue={profile.emailForIntro} id="email_for_intro" name="email_for_intro" type="email" />
        </div>
        <div>
          <Label htmlFor="whatsapp_number">WhatsApp</Label>
          <Input
            defaultValue={profile.whatsappNumber}
            id="whatsapp_number"
            name="whatsapp_number"
          />
        </div>
        <div className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--ink-soft)] md:col-span-2">
          {[
            {
              name: "public_contact_enabled",
              label: "Allow admins to note that public contact is enabled",
              checked: profile.publicContactEnabled,
            },
            {
              name: "whatsapp_visible_after_accept",
              label: "Reveal WhatsApp after intro acceptance",
              checked: profile.whatsappVisibleAfterAccept,
            },
            {
              name: "intro_opt_in",
              label: "Stay open to intro requests",
              checked: profile.introOptIn,
            },
            {
              name: "profile_visible_in_matching",
              label: "Allow AI matching to surface my profile",
              checked: profile.profileVisibleInMatching,
            },
          ].map((item) => (
            <label className="flex items-center gap-3" key={item.name}>
              <input defaultChecked={item.checked} name={item.name} type="checkbox" />
              {item.label}
            </label>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] bg-[var(--canvas)]/95 py-4 backdrop-blur">
        <Button
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          type="button"
          variant="secondary"
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <div className="flex gap-3">
          <SubmitButton
            name="intent"
            pendingLabel="Saving draft"
            value="draft"
            variant="secondary"
          >
            Save draft
          </SubmitButton>
          {step < onboardingSteps.length - 1 ? (
            <Button onClick={() => setStep((current) => current + 1)} type="button">
              Next
              <ChevronRight className="size-4" />
            </Button>
          ) : (
            <SubmitButton name="intent" pendingLabel="Completing profile" value="complete">
              Complete onboarding
            </SubmitButton>
          )}
        </div>
      </div>
    </form>
  );
}

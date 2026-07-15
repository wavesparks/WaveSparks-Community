"use client";

import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  getProfileReadiness,
  getProfileReadinessFromFormData,
} from "@/lib/activation";
import { onboardingSteps } from "@/lib/constants";
import { technicalExperienceOptions } from "@/lib/profile-experience";
import { validateProfileFormData } from "@/lib/profile-form-validation";
import { AvatarUploadField } from "@/components/onboarding/avatar-upload-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import type { MatchTypeConfig, Profile, ProfileLink } from "@/lib/domain";

function linkValue(links: ProfileLink[], type: ProfileLink["type"]) {
  return links.find((link) => link.type === type)?.url ?? "";
}

const stepByReadinessField: Record<string, number> = {
  preferred_name: 0,
  headline: 0,
  bio: 0,
  current_focus: 1,
  skill_tags: 1,
  looking_for_types: 2,
  email_for_intro: 3,
};

const focusTargetByReadinessField: Record<string, string> = {
  preferred_name: "preferred_name",
  headline: "headline",
  bio: "bio",
  current_focus: "current_focus",
  skill_tags: "skill_tags",
  looking_for_types: "matching_intent_group",
  email_for_intro: "email_for_intro",
};

const stepByValidatedField: Record<string, number> = {
  linkedin_url: 0,
  github_url: 0,
  website_url: 0,
  x_url: 0,
  technical_experience_level: 1,
  max_mentees: 3,
  email_for_intro: 3,
};

function firstInvalidControl(form: HTMLFormElement) {
  return Array.from(form.elements).find(
    (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      (element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement) &&
      !element.checkValidity(),
  );
}

export function OnboardingForm({
  action,
  profile,
  links,
  matchTypeConfigs,
  initialStep = 0,
  returnTo,
}: {
  action: (formData: FormData) => void;
  profile: Profile;
  links: ProfileLink[];
  matchTypeConfigs: MatchTypeConfig[];
  initialStep?: number;
  returnTo?: string;
}) {
  const [step, setStep] = useState(Math.max(0, Math.min(initialStep, onboardingSteps.length - 1)));
  const [readiness, setReadiness] = useState(() => getProfileReadiness(profile));
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const focusTargetRef = useRef<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const stepPanelClass =
    "grid gap-5 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm md:grid-cols-2";

  function updateReadiness(form: HTMLFormElement) {
    const next = getProfileReadinessFromFormData(new FormData(form), profile);
    setReadiness(next);
    return next;
  }

  function requestFocus(targetId: string) {
    focusTargetRef.current = targetId;
    setFocusRequest((request) => request + 1);
  }

  useEffect(() => {
    const focusTarget = focusTargetRef.current;
    if (!focusTarget) return;

    const target = document.getElementById(focusTarget);
    target?.focus();
    target?.scrollIntoView?.({ block: "center" });
  }, [focusRequest]);

  return (
    <form
      action={action}
      className="space-y-6"
      noValidate
      onInput={(event) => {
        setValidationNotice(null);
        updateReadiness(event.currentTarget);
      }}
      onSubmit={(event) => {
        const sharedValidation = validateProfileFormData(new FormData(event.currentTarget));
        const sharedError = sharedValidation.errors[0];
        const invalidControl = firstInvalidControl(event.currentTarget);
        const invalidField = sharedError?.field ?? invalidControl?.name;
        if (invalidField) {
          event.preventDefault();
          setValidationNotice(
            sharedError?.message ?? "Check the highlighted field before saving.",
          );
          if (invalidField === "max_mentees") {
            const mentoringDetails = document.getElementById("mentoring_details");
            if (mentoringDetails instanceof HTMLDetailsElement) {
              mentoringDetails.open = true;
            }
          }
          setStep(stepByValidatedField[invalidField] ?? step);
          requestFocus(invalidField);
          return;
        }

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
          `Add ${next.missingFields.map((field) => field.label).join(", ")} before completing your profile.`,
        );
        const firstMissing = [...next.missingFields].sort(
          (left, right) =>
            (stepByReadinessField[left.key] ?? 0) -
            (stepByReadinessField[right.key] ?? 0),
        )[0];
        if (firstMissing) {
          setStep(stepByReadinessField[firstMissing.key] ?? 0);
          requestFocus(focusTargetByReadinessField[firstMissing.key]);
        }
      }}
    >
      {returnTo ? <input name="return_to" type="hidden" value={returnTo} /> : null}
      <input name="profile_form_version" type="hidden" value="2" />
      <input name="matching_intent_version" type="hidden" value="2" />
      <div
        aria-live="polite"
        className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--accent)]">
              Profile setup
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--ink)]">
              {readiness.isReady
                ? "Ready for matching and introductions"
                : "Add the essentials before completing your profile"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
              You can save a draft at any time. Your profile is shared across Wavesparks;
              Wavesparks Community and each Event have their own goals and matching preferences.
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
                  ? "All required profile fields are complete."
                  : "Needed before you complete your profile"}
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                {readiness.isReady
                  ? "Your profile is ready. You can add more detail at any time."
                  : readiness.missingFields.map((field) => field.label).join(", ")}
              </p>
              {validationNotice ? (
                <p className="mt-2 text-sm font-medium text-[var(--accent)]" role="alert">
                  {validationNotice}
                </p>
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
            <option value="exploring">Exploring what’s next</option>
            <option value="student">Student</option>
            <option value="alumni">Alumni</option>
            <option value="founder">Founder</option>
            <option value="operator">Operator</option>
            <option value="mentor">Mentor</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="headline">
            Introduce yourself in one line
            <span className="ml-1 text-xs text-[var(--accent)]">Required</span>
          </Label>
          <p className="mb-2 text-xs leading-5 text-[var(--ink-soft)]" id="headline_help">
            For example: A student exploring climate tech and accessible design.
          </p>
          <Input
            aria-describedby="headline_help"
            defaultValue={profile.headline}
            id="headline"
            name="headline"
            placeholder="A student exploring…"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="bio">
            About you
            <span className="ml-1 text-xs text-[var(--accent)]">Required</span>
          </Label>
          <p className="mb-2 text-xs leading-5 text-[var(--ink-soft)]" id="bio_help">
            Share a little personal context: your background, community, or the perspective you
            bring. Your interests and current focus come next. Two or three sentences is enough.
          </p>
          <Textarea
            aria-describedby="bio_help"
            defaultValue={profile.bio}
            id="bio"
            name="bio"
            placeholder="I’m a student, designer, researcher…"
          />
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
        <div className="md:col-span-2">
          <Label htmlFor="problem_interest">
            Is there a problem, topic, or opportunity you’re especially interested in?
            <span className="ml-1 text-xs font-normal text-[var(--ink-soft)]">Optional</span>
          </Label>
          <p
            className="mb-2 text-xs leading-5 text-[var(--ink-soft)]"
            id="problem_interest_help"
          >
            You don’t need a startup idea yet. Tell us what draws you to it and what sparked your
            interest. If you’re still exploring, say so.
          </p>
          <Textarea
            aria-describedby="problem_interest_help"
            defaultValue={profile.problemInterest}
            id="problem_interest"
            name="problem_interest"
            placeholder="I keep noticing… What drew me to this was…"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="current_focus">
            What are you exploring, learning, or making right now?
            <span className="ml-1 text-xs text-[var(--accent)]">Required</span>
          </Label>
          <p className="mb-2 text-xs leading-5 text-[var(--ink-soft)]" id="current_focus_help">
            A course, research topic, side project, community initiative, or early idea all count.
          </p>
          <Textarea
            aria-describedby="current_focus_help"
            defaultValue={profile.currentFocus}
            id="current_focus"
            name="current_focus"
            placeholder="Right now I’m learning about…"
          />
        </div>
        <div>
          <Label htmlFor="technical_experience_level">Technical or product experience level</Label>
          <Select
            defaultValue={profile.technicalExperienceLevel || "not_sure"}
            id="technical_experience_level"
            name="technical_experience_level"
          >
            {technicalExperienceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="skill_tags">
            Skills you have or want to develop
            <span className="ml-1 text-xs text-[var(--accent)]">Required</span>
          </Label>
          <Input
            defaultValue={profile.skillTags.join(", ")}
            id="skill_tags"
            name="skill_tags"
            placeholder="research, Python, product design"
          />
          <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
            Separate a few skills or learning interests with commas.
          </p>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="technical_experience">
            What experience do you have with coding, software development, or product design?
            <span className="ml-1 text-xs font-normal text-[var(--ink-soft)]">Optional</span>
          </Label>
          <p
            className="mb-2 text-xs leading-5 text-[var(--ink-soft)]"
            id="technical_experience_help"
          >
            All levels are welcome—from your first tutorial to a shipped product. Tell us what
            you’ve tried, the tools you know, and what you can do independently. If you’re new,
            share what you’d like to learn.
          </p>
          <Textarea
            aria-describedby="technical_experience_help"
            defaultValue={profile.technicalExperience}
            id="technical_experience"
            name="technical_experience"
            placeholder="I’ve tried… I’m comfortable with… I’d like to learn…"
          />
        </div>
        <div>
          <Label htmlFor="problem_space_tags">Topics or problems that interest you</Label>
          <Input
            defaultValue={profile.problemSpaceTags.join(", ")}
            id="problem_space_tags"
            name="problem_space_tags"
            placeholder="climate, accessibility, education"
          />
        </div>
        <div>
          <Label htmlFor="industry_tags">Areas or industries</Label>
          <Input
            defaultValue={profile.industryTags.join(", ")}
            id="industry_tags"
            name="industry_tags"
            placeholder="health, fintech, social impact"
          />
        </div>
        <div className="md:col-span-2 border-t border-[var(--line)] pt-5">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            Already working on a project or startup?
          </h3>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
            These details are optional. Leave them blank if you are still exploring.
          </p>
        </div>
        <div>
          <Label htmlFor="startup_name">Project or startup name</Label>
          <Input
            defaultValue={profile.startupName}
            id="startup_name"
            name="startup_name"
            placeholder="Optional"
          />
        </div>
        <div>
          <Label htmlFor="stage">Current stage</Label>
          <Select defaultValue={profile.stage} id="stage" name="stage">
            <option value="exploring">Exploring / not started</option>
            <option value="idea">Idea</option>
            <option value="pre-MVP">Pre-MVP</option>
            <option value="MVP">MVP</option>
            <option value="early traction">Early traction</option>
            <option value="scaling">Scaling</option>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="startup_one_liner">Describe the project in one line</Label>
          <Input
            defaultValue={profile.startupOneLiner}
            id="startup_one_liner"
            name="startup_one_liner"
            placeholder="Optional"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="current_progress">What have you tried or made so far?</Label>
          <p className="mb-2 text-xs leading-5 text-[var(--ink-soft)]" id="current_progress_help">
            Class projects, research, volunteering, prototypes, and startup work all count.
          </p>
          <Textarea
            aria-describedby="current_progress_help"
            defaultValue={profile.currentProgress}
            id="current_progress"
            name="current_progress"
            placeholder="Optional"
          />
        </div>
      </div>

      <div className={step === 2 ? stepPanelClass : "hidden"}>
        <fieldset
          className="space-y-4 md:col-span-2"
          id="matching_intent_group"
          tabIndex={-1}
        >
          <legend className="text-sm font-semibold text-[var(--ink)]">
            Connections you are generally open to
          </legend>
          <p className="text-xs leading-5 text-[var(--ink-soft)]">
            Choose at least one under “I am looking for.” You can set a more specific goal for
            Wavesparks Community and each Event.
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[var(--ink)]">I am looking for</p>
              {matchTypeConfigs.map((config) => (
                <label
                  className="flex min-h-11 items-start gap-3 border-b border-[var(--line)] py-2 text-sm text-[var(--ink)]"
                  key={`seeking-${config.slug}`}
                >
                  <input
                    className="mt-1 size-4 accent-[var(--accent)]"
                    defaultChecked={profile.seekingMatchTypes.includes(config.slug)}
                    name="seeking_match_types"
                    type="checkbox"
                    value={config.slug}
                  />
                  <span>
                    <span className="block font-medium">{config.seekerLabel}</span>
                    <span className="mt-1 block text-[var(--ink-soft)]">{config.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[var(--ink)]">I can offer</p>
              {matchTypeConfigs.map((config) => (
                <label
                  className="flex min-h-11 items-start gap-3 border-b border-[var(--line)] py-2 text-sm text-[var(--ink)]"
                  key={`offering-${config.slug}`}
                >
                  <input
                    className="mt-1 size-4 accent-[var(--accent)]"
                    defaultChecked={profile.offeringMatchTypes.includes(config.slug)}
                    name="offering_match_types"
                    type="checkbox"
                    value={config.slug}
                  />
                  <span>
                    <span className="block font-medium">{config.providerLabel}</span>
                    <span className="mt-1 block text-[var(--ink-soft)]">
                      {config.direction === "mutual"
                        ? "We’ll suggest people who chose the same option."
                        : "We’ll suggest you to people looking for this."}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </fieldset>
        <div>
          <Label htmlFor="desired_roles">Who would you be interested in meeting?</Label>
          <Input
            defaultValue={profile.desiredRoles.join(", ")}
            id="desired_roles"
            name="desired_roles"
            placeholder="peers, designers, engineers, mentors"
          />
        </div>
        <div>
          <Label htmlFor="help_needed_tags">Where would another perspective help?</Label>
          <Input
            defaultValue={profile.helpNeededTags.join(", ")}
            id="help_needed_tags"
            name="help_needed_tags"
            placeholder="choosing a problem, user research, prototyping"
          />
        </div>
        <div>
          <Label htmlFor="can_contribute">What would you be happy to help others with?</Label>
          <Input
            defaultValue={profile.canContribute.join(", ")}
            id="can_contribute"
            name="can_contribute"
            placeholder="brainstorming, feedback, research, introductions"
          />
        </div>
        <div>
          <Label htmlFor="time_commitment">How much time can you realistically give?</Label>
          <Select
            defaultValue={profile.timeCommitment}
            id="time_commitment"
            name="time_commitment"
          >
            <option value="exploratory">Occasional / still exploring</option>
            <option value="part time serious">A few focused hours each week</option>
            <option value="full time">Full time</option>
            <option value="mentor only">Mentoring conversations only</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="availability_start">When are you open to connecting?</Label>
          <Input
            defaultValue={profile.availabilityStart}
            id="availability_start"
            name="availability_start"
            placeholder="Now, next month, weekends…"
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
          <Label htmlFor="preferred_geographies">Preferred locations, if any</Label>
          <Input
            defaultValue={profile.preferredGeographies.join(", ")}
            id="preferred_geographies"
            name="preferred_geographies"
            placeholder="Singapore, Southeast Asia"
          />
        </div>
        <div>
          <Label htmlFor="meeting_frequency_preference">How often would you like to connect?</Label>
          <Input
            defaultValue={profile.meetingFrequencyPreference}
            id="meeting_frequency_preference"
            name="meeting_frequency_preference"
            placeholder="Occasionally, monthly, weekly"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="ideal_match_description">What would make a useful connection?</Label>
          <Textarea
            defaultValue={profile.idealMatchDescription}
            id="ideal_match_description"
            name="ideal_match_description"
            placeholder="I’d enjoy meeting someone who…"
          />
        </div>
      </div>

      <div className={step === 3 ? stepPanelClass : "hidden"}>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 md:col-span-2">
          <h3 className="text-sm font-semibold text-[var(--ink)]">How you like to work</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">
            Contact details stay private until an introduction is accepted. The working-style
            questions are optional and simply help people understand how you collaborate.
          </p>
        </div>
        <div>
          <Label htmlFor="work_style">Work style</Label>
          <Select defaultValue={profile.workStyle} id="work_style" name="work_style">
            <option value="figuring it out">Still figuring it out</option>
            <option value="maker">Maker</option>
            <option value="operator">Operator</option>
            <option value="seller">Seller</option>
            <option value="researcher">Researcher</option>
            <option value="hybrid">Hybrid</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="communication_style">How do you like to communicate?</Label>
          <Input
            defaultValue={profile.communicationStyle}
            id="communication_style"
            name="communication_style"
            placeholder="Async messages, direct feedback, regular calls…"
          />
        </div>
        <details
          className="rounded-lg border border-[var(--line)] p-4 md:col-span-2"
          id="mentoring_details"
        >
          <summary className="cursor-pointer text-sm font-semibold text-[var(--ink)]">
            Mentoring details (optional)
          </summary>
          <p className="mt-2 text-xs leading-5 text-[var(--ink-soft)]">
            Open this only if you want to offer structured mentoring.
          </p>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <Label htmlFor="mentor_expertise_tags">Topics you can mentor on</Label>
              <Input
                defaultValue={profile.mentorExpertiseTags.join(", ")}
                id="mentor_expertise_tags"
                name="mentor_expertise_tags"
              />
            </div>
            <div>
              <Label htmlFor="mentor_stage_experience">Stages you know well</Label>
              <Input
                defaultValue={profile.mentorStageExperience.join(", ")}
                id="mentor_stage_experience"
                name="mentor_stage_experience"
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
              <Label htmlFor="max_mentees">Maximum number of mentees</Label>
              <Input
                defaultValue={profile.maxMentees ?? ""}
                id="max_mentees"
                max={100}
                min={0}
                name="max_mentees"
                type="number"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="mentorship_preferences">How you prefer to mentor</Label>
              <Textarea
                defaultValue={profile.mentorshipPreferences}
                id="mentorship_preferences"
                name="mentorship_preferences"
              />
            </div>
          </div>
        </details>
        <div>
          <Label htmlFor="email_for_intro">
            Email for accepted introductions
            <span className="ml-1 text-xs text-[var(--accent)]">Required</span>
          </Label>
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
              name: "whatsapp_visible_after_accept",
              label: "Share my WhatsApp after I accept an introduction",
              checked: profile.whatsappVisibleAfterAccept,
            },
            {
              name: "intro_opt_in",
              label: "Stay open to intro requests",
              checked: profile.introOptIn,
            },
          ].map((item) => (
            <label className="flex items-center gap-3" key={item.name}>
              <input
                defaultChecked={item.checked}
                name={item.name}
                type="checkbox"
                value="true"
              />
              <input name={item.name} type="hidden" value="false" />
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
            <SubmitButton name="intent" pendingLabel="Saving profile" value="complete">
              Save profile
            </SubmitButton>
          )}
        </div>
      </div>
    </form>
  );
}

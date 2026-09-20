import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { seedMatchTypeConfigs, seedProfiles } from "@/data/seed-data";
import type { ProfileLink } from "@/lib/domain";

const invalidLinks: ProfileLink[] = [
  {
    id: "lnk_invalid_linkedin",
    profileId: seedProfiles[0].id,
    type: "linkedin",
    url: "ftp://example.com/profile",
  },
];

afterEach(() => {
  cleanup();
});

describe("OnboardingForm", () => {
  it("uses programme or cohort language and sentence case for missing fields", () => {
    render(
      <OnboardingForm
        action={vi.fn()}
        links={[]}
        matchTypeConfigs={seedMatchTypeConfigs}
        profile={{
          ...seedProfiles[0],
          preferredName: "",
          headline: "",
          bio: "",
          currentFocus: "",
          seekingMatchTypes: [],
          skillTags: [],
          emailForIntro: "",
        }}
      />,
    );

    expect(screen.getAllByText(/each programme or cohort/i)).toHaveLength(2);
    expect(document.body.textContent).not.toContain("each Event");
    expect(
      screen.getByText(
        "Preferred name, one-line introduction, about you, what you’re exploring, matching intent, skills or learning interests, email for accepted introductions",
      ),
    ).toBeInTheDocument();
  });

  it("uses one inclusive bio and asks interest-led experience questions", () => {
    render(
      <OnboardingForm
        action={vi.fn()}
        links={[]}
        matchTypeConfigs={seedMatchTypeConfigs}
        profile={seedProfiles[0]}
      />,
    );

    expect(screen.getByLabelText(/About you/i)).toHaveAttribute("name", "bio");
    expect(screen.getByText(/your background, community, or the perspective you bring/i))
      .toBeInTheDocument();
    expect(screen.queryByLabelText("Short bio")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Long bio")).not.toBeInTheDocument();

    expect(
      screen.getByLabelText(/problem, topic, or opportunity you’re especially interested in/i),
    ).toHaveAttribute("name", "problem_interest");
    expect(
      screen.getByLabelText(/experience do you have with coding, software development/i),
    ).toHaveAttribute("name", "technical_experience");
    expect(screen.getByLabelText("Technical or product experience level")).toHaveValue(
      "not_sure",
    );
  });

  it("keeps a draft in place and focuses a malformed field from another step", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (formData: FormData) => {
      void formData;
    });
    const { container } = render(
      <OnboardingForm
        action={action}
        initialStep={3}
        links={invalidLinks}
        matchTypeConfigs={seedMatchTypeConfigs}
        profile={seedProfiles[0]}
      />,
    );
    const form = container.querySelector("form");

    expect(form).not.toBeNull();
    expect(form?.checkValidity()).toBe(true);
    expect(form).toHaveAttribute("novalidate");

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(screen.getByLabelText("LinkedIn")).toHaveFocus());
    expect(screen.getByText("Links must use http:// or https://.")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("opens optional mentoring details before focusing an invalid mentee limit", async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(
      <OnboardingForm
        action={action}
        canMentor
        initialStep={0}
        links={[]}
        matchTypeConfigs={seedMatchTypeConfigs}
        profile={{ ...seedProfiles[0], maxMentees: 101 }}
      />,
    );

    const details = document.getElementById("mentoring_details") as HTMLDetailsElement;
    expect(details.open).toBe(false);

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(screen.getByLabelText("Preferred number of mentees")).toHaveFocus());
    expect(details.open).toBe(true);
    expect(screen.getByText("Enter a whole number from 0 to 100.")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("opens mentoring details immediately for the mentor edit entry point", () => {
    render(
      <OnboardingForm
        action={vi.fn()}
        canMentor
        initialStep={3}
        links={[]}
        matchTypeConfigs={seedMatchTypeConfigs}
        openMentoringDetails
        profile={seedProfiles[0]}
        returnTo="/org/wavesparks/mentoring#mentor-profile"
      />,
    );

    expect(document.getElementById("mentoring_details")).toHaveAttribute("open");
    expect(document.querySelector('input[name="return_to"]')).toHaveValue(
      "/org/wavesparks/mentoring#mentor-profile",
    );
  });

  it("serializes checked and unchecked privacy controls unambiguously", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <OnboardingForm
        action={vi.fn()}
        initialStep={3}
        links={[]}
        matchTypeConfigs={seedMatchTypeConfigs}
        profile={{ ...seedProfiles[0], introOptIn: true }}
      />,
    );
    const form = container.querySelector("form")!;
    const checkbox = screen.getByLabelText("Stay open to intro requests");

    expect(new FormData(form).get("intro_opt_in")).toBe("true");
    await user.click(checkbox);
    expect(new FormData(form).get("intro_opt_in")).toBe("false");
  });

  it("moves completion focus to the first missing readiness field", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async (formData: FormData) => {
      void formData;
    });
    const profileMissingIntent = {
      ...seedProfiles[0],
      lookingForTypes: [],
      seekingMatchTypes: [],
    };
    const { container } = render(
      <OnboardingForm
        action={action}
        initialStep={3}
        links={[]}
        matchTypeConfigs={seedMatchTypeConfigs}
        profile={profileMissingIntent}
      />,
    );

    expect(container.querySelector("form")?.checkValidity()).toBe(true);

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Step 3/ })).toHaveAttribute(
        "aria-current",
        "step",
      ),
    );
    expect(
      screen.getByText("Add matching intent before completing your profile."),
    ).toBeInTheDocument();
    expect(document.getElementById("matching_intent_group")).toHaveFocus();
    expect(action).not.toHaveBeenCalled();
  });
});

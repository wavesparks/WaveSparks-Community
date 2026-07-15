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
    url: "not-a-url",
  },
];

afterEach(() => {
  cleanup();
});

describe("OnboardingForm", () => {
  it("dispatches a draft for server validation when a hidden step contains an invalid URL", async () => {
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
    expect(form?.checkValidity()).toBe(false);
    expect(form).toHaveAttribute("novalidate");

    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0]?.[0].get("intent")).toBe("draft");
  });

  it("runs completion readiness logic despite an invalid URL in a hidden step", async () => {
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
        links={invalidLinks}
        matchTypeConfigs={seedMatchTypeConfigs}
        profile={profileMissingIntent}
      />,
    );

    expect(container.querySelector("form")?.checkValidity()).toBe(false);

    await user.click(screen.getByRole("button", { name: "Complete onboarding" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Step 3/ })).toHaveAttribute(
        "aria-current",
        "step",
      ),
    );
    expect(
      screen.getByText("Add Matching intent before completing onboarding."),
    ).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ActivationChecklistCard } from "@/components/community/activation-checklist-card";
import type { MemberActivationState } from "@/lib/domain";

const activation: MemberActivationState = {
  completedCount: 1,
  isComplete: false,
  items: [
    {
      complete: true,
      cta: "Review profile",
      description: "Founder context is ready.",
      href: "/profile",
      id: "profile",
      label: "Profile context",
    },
    {
      complete: false,
      cta: "Create post",
      description: "Publish your first signal.",
      href: "/compose",
      id: "post",
      label: "First signal",
    },
    {
      complete: false,
      cta: "Open matches",
      description: "Review surfaced members.",
      href: "/matches",
      id: "matches",
      label: "Match surface",
    },
    {
      complete: false,
      cta: "Request intro",
      description: "Start a high-context intro.",
      href: "/requests",
      id: "intro",
      label: "Intro flow",
    },
  ],
  totalCount: 4,
};

describe("ActivationChecklistCard member copy", () => {
  afterEach(() => cleanup());

  it("turns internal activation language into clear next steps", () => {
    render(<ActivationChecklistCard activation={activation} />);

    expect(screen.getByRole("heading", { name: "Your next steps" })).toBeInTheDocument();
    expect(screen.getByText("Share your first post")).toBeInTheDocument();
    expect(screen.getByText("Explore your matches")).toBeInTheDocument();
    expect(screen.getByText("Ask for an introduction")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /activation|activated|first loop|signal|context|surface|surfaced/i,
    );
  });
});

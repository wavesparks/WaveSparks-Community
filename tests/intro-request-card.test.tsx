import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IntroRequestCard } from "@/components/community/intro-request-card";
import type { IntroRequestView } from "@/lib/domain";

const request: IntroRequestView = {
  createdAt: "2026-07-15T00:00:00.000Z",
  id: "intro-admin",
  introPurpose: "Meet a potential adviser",
  isIncoming: true,
  kind: "general",
  note: "The team thought you should meet.",
  otherParty: {
    affiliationLabel: "Mentor",
    currentStatus: "active",
    displayName: "Morgan Lee",
    headline: "Operator and adviser",
    keyTags: ["growth"],
    location: "Singapore",
    membershipId: "membership-morgan",
    photo: "",
    profileId: "profile-morgan",
    whatTheyAreBuilding: "",
    whatTheyNeed: [],
  },
  sourceType: "admin_manual",
  spaceId: "main-community",
  spaceName: "Main Community",
  status: "pending",
  suggestedFirstMessage: "I’d love to compare notes.",
};

describe("IntroRequestCard member copy", () => {
  afterEach(() => cleanup());

  it("uses natural source and status labels", () => {
    render(
      <IntroRequestCard
        request={request}
        sourceName="Wavesparks Community"
      />,
    );

    expect(
      screen.getByText("Received · Introduced by the Wavesparks team"),
    ).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Wavesparks Community")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("admin manual");
    expect(document.body.textContent).not.toContain("Main Community");
    expect(screen.getByText("Opening message")).toBeInTheDocument();
  });

  it("labels mentoring requests without changing contact privacy", () => {
    render(<IntroRequestCard request={{ ...request, kind: "mentoring" }} />);

    expect(screen.getByText("Mentoring")).toBeInTheDocument();
    expect(screen.queryByText("Contact details")).not.toBeInTheDocument();
  });
});

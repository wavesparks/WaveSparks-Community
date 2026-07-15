import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/member", () => ({
  followMembershipAction: vi.fn(),
  followMembershipInSpaceAction: vi.fn(),
  unfollowMembershipAction: vi.fn(),
  unfollowMembershipInSpaceAction: vi.fn(),
}));

import { MatchCard } from "@/components/community/match-card";
import { MemberDirectoryCard } from "@/components/community/member-directory-card";
import type { MatchCardView, MemberDirectoryProfileView } from "@/lib/domain";

const profile: MemberDirectoryProfileView = {
  affiliationLabel: "Participant",
  bio: "Building better tools for community organizers.",
  currentFocus: "Interviewing event hosts",
  currentProgress: "Early research",
  currentStatus: "active",
  desiredRoles: ["Designer"],
  displayName: "Morgan Lee",
  headline: "Product designer and community builder",
  industryTags: ["Community"],
  introStatus: undefined,
  isFollowing: false,
  keyTags: ["Design", "Community"],
  location: "Singapore",
  membershipId: "membership-morgan",
  mentorOffers: [],
  photo: "",
  problemInterest: "Helping groups stay connected",
  problemSpaceTags: ["Communities"],
  profileId: "profile-morgan",
  profileLinks: [],
  skillTags: [],
  stage: "exploring",
  startupDescription: "",
  startupName: "Gather",
  technicalExperience: "",
  technicalExperienceLevel: "beginner",
  tractionSummary: "",
  whatTheyAreBuilding: "Tools for community organizers",
  whatTheyNeed: ["Introductions to event hosts"],
};

const match: MatchCardView = {
  confidence: "high",
  explanationText:
    "Morgan may be a good person to meet. You have startup interests and relevant roles and skills in common.",
  id: "match-morgan",
  matchType: "collaborator_match",
  matchTypeLabel: "Collaborator",
  overlapTags: ["Community"],
  score: 98,
  scoreBand: "high",
  target: profile,
};

describe("member experience copy", () => {
  afterEach(() => cleanup());

  it("opens the explicit introduction form from a directory card", () => {
    render(
      <MemberDirectoryCard
        profile={profile}
        returnPath="/org/wavesparks/s/event-alpha/people"
        slug="wavesparks"
        spaceId="space-event-alpha"
        spaceSlug="event-alpha"
        viewerMembershipId="membership-viewer"
      />,
    );

    expect(screen.getByRole("link", { name: "Request introduction" })).toHaveAttribute(
      "href",
      "/org/wavesparks/s/event-alpha/people/membership-morgan#request-introduction",
    );
    expect(document.querySelector('input[name="note"]')).toBeNull();
    expect(document.querySelector('input[name="suggested_first_message"]')).toBeNull();
    expect(screen.getByText("Not added yet")).toBeInTheDocument();
  });

  it.each([
    ["high", "Strong match"],
    ["good", "Good match"],
    ["emerging", "Possible match"],
  ] as const)("shows a %s match without a numeric score", (scoreBand, label) => {
    render(<MatchCard match={{ ...match, scoreBand }} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("98");
    expect(document.body.textContent).not.toMatch(/confidence|fit score/i);
  });
});

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
  acceptingMentoringRequests: false,
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
  isApprovedMentor: false,
  isFollowing: false,
  keyTags: ["Design", "Community"],
  location: "Singapore",
  membershipId: "membership-morgan",
  maxMentees: null,
  mentorAvailability: "",
  mentorExpertiseTags: [],
  mentorFunctionalStrengths: [],
  mentorOffers: [],
  mentorStageExperience: [],
  mentorshipPreferences: "",
  openToIntroductions: true,
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

  it("shows an approved mentor badge independently from affiliation", () => {
    render(
      <MemberDirectoryCard
        profile={{
          ...profile,
          acceptingMentoringRequests: true,
          affiliationLabel: "Alumni",
          isApprovedMentor: true,
          mentorOffers: ["Office hours"],
        }}
        returnPath="/org/wavesparks/s/event-alpha/people?mentor_status=approved"
        slug="wavesparks"
        spaceId="space-event-alpha"
        spaceSlug="event-alpha"
        viewerMembershipId="membership-viewer"
      />,
    );

    expect(screen.getByText("Alumni")).toBeInTheDocument();
    expect(screen.getByText("Approved mentor")).toBeInTheDocument();
    expect(screen.getByText(/Office hours/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request mentoring" })).toHaveAttribute(
      "href",
      "/org/wavesparks/s/event-alpha/people/membership-morgan?connection=mentoring#request-introduction",
    );
  });

  it("keeps general introductions available when an approved mentor pauses mentoring", () => {
    render(
      <MemberDirectoryCard
        profile={{
          ...profile,
          acceptingMentoringRequests: false,
          isApprovedMentor: true,
        }}
        returnPath="/org/wavesparks/s/event-alpha/people"
        slug="wavesparks"
        spaceId="space-event-alpha"
        spaceSlug="event-alpha"
        viewerMembershipId="membership-viewer"
      />,
    );

    expect(screen.getByText("Approved mentor")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Request mentoring" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request introduction" })).toHaveAttribute(
      "href",
      "/org/wavesparks/s/event-alpha/people/membership-morgan#request-introduction",
    );
  });

  it("does not expose a dead request CTA when a member opts out of introductions", () => {
    render(
      <MemberDirectoryCard
        profile={{ ...profile, openToIntroductions: false }}
        returnPath="/org/wavesparks/s/event-alpha/people"
        slug="wavesparks"
        spaceId="space-event-alpha"
        spaceSlug="event-alpha"
        viewerMembershipId="membership-viewer"
      />,
    );

    expect(screen.getByText("Not accepting introductions")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Request/ })).not.toBeInTheDocument();
  });

  it.each(["accepted", "declined", "expired"] as const)(
    "keeps resolved %s introductions as history without blocking a new request",
    (introStatus) => {
      render(
        <MemberDirectoryCard
          profile={{ ...profile, introStatus }}
          returnPath="/org/wavesparks/s/event-alpha/people"
          slug="wavesparks"
          spaceId="space-event-alpha"
          spaceSlug="event-alpha"
          viewerMembershipId="membership-viewer"
        />,
      );

      expect(screen.getByRole("link", { name: "Request introduction" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "View introduction" })).not.toBeInTheDocument();
    },
  );

  it("keeps an existing pending request visible after the recipient opts out", () => {
    render(
      <MemberDirectoryCard
        profile={{ ...profile, introStatus: "pending", openToIntroductions: false }}
        returnPath="/org/wavesparks/s/event-alpha/people"
        slug="wavesparks"
        spaceId="space-event-alpha"
        spaceSlug="event-alpha"
        viewerMembershipId="membership-viewer"
      />,
    );

    expect(screen.getByRole("link", { name: "View introduction" })).toBeInTheDocument();
    expect(screen.queryByText("Not accepting introductions")).not.toBeInTheDocument();
  });

  it.each([
    ["high", "bg-[var(--accent-soft)]"],
    ["good", "bg-[var(--surface)]"],
    ["emerging", "bg-[var(--surface-muted)]"],
  ] as const)("shows a numeric %s match score", (scoreBand, variantClass) => {
    render(<MatchCard match={{ ...match, scoreBand }} />);

    const score = screen.getByRole("meter", { name: "Match score" });
    expect(score).toHaveTextContent("98/100 match");
    expect(score).toHaveAttribute("aria-valuemin", "1");
    expect(score).toHaveAttribute("aria-valuemax", "100");
    expect(score).toHaveAttribute("aria-valuenow", "98");
    expect(score).toHaveAttribute("aria-valuetext", "98 out of 100");
    expect(score).toHaveClass(variantClass);
    expect(screen.queryByText("Possible match")).not.toBeInTheDocument();
    expect(score).not.toHaveTextContent("98%");
  });

  it.each([1, 100])("renders the %i/100 score boundary", (scoreValue) => {
    render(<MatchCard match={{ ...match, score: scoreValue }} />);

    const score = screen.getByRole("meter", { name: "Match score" });
    expect(score).toHaveTextContent(`${scoreValue}/100 match`);
    expect(score).toHaveAttribute("aria-valuenow", String(scoreValue));
    expect(score).toHaveAttribute("aria-valuetext", `${scoreValue} out of 100`);
  });
});

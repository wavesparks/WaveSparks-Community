import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SpaceShellSpace } from "@/components/layout/space-shell-navigation";
import type { ViewerContext } from "@/lib/domain";

vi.mock("@clerk/nextjs", () => ({ UserButton: () => null }));
vi.mock("@/lib/env", () => ({ isClerkConfigured: () => false }));
vi.mock("@/components/layout/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));

import { MySpacesView } from "@/components/community/my-spaces-view";
import { AppShell } from "@/components/layout/app-shell";

const mainCommunity: SpaceShellSpace = {
  endsAt: undefined,
  eventLabel: "Permanent community",
  id: "community-main",
  kind: "main",
  lifecycle: "active",
  name: "Main Community",
  slug: "main",
  startsAt: undefined,
};

const event: SpaceShellSpace = {
  endsAt: "2026-08-16T00:00:00.000Z",
  eventLabel: "August 2026",
  id: "event-founder-lab",
  kind: "event",
  lifecycle: "active",
  name: "Founder Lab Singapore",
  slug: "founder-lab-singapore",
  startsAt: "2026-08-14T00:00:00.000Z",
};

const viewer: ViewerContext = {
  canAdmin: false,
  isApprovedMentor: false,
  canMentor: false,
  membership: {
    accountStatus: "connected",
    affiliationType: "current participant",
    archetypes: ["founder"],
    clerkMembershipId: "clerk-membership",
    cohortNameOrYear: "2026",
    createdAt: "2026-07-01T00:00:00.000Z",
    id: "membership-alex",
    orgId: "org-wavesparks",
    programName: "Founder Lab",
    role: "member",
    mentorStatus: "not_mentor",
    status: "approved",
    updatedAt: "2026-07-01T00:00:00.000Z",
    userId: "user-alex",
  },
  org: {
    allowedDomains: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    description: "",
    id: "org-wavesparks",
    inviteSettings: "",
    logoUrl: "",
    membershipRules: [],
    name: "Wavesparks",
    slug: "wavesparks",
    status: "active",
    tagline: "The warm founder network.",
    theme: {
      accent: "#8958f0",
      accentSoft: "#f0e9ff",
      canvas: "#f7f9ff",
      ink: "#221b44",
    },
  },
  scopes: ["org:member"],
  user: {
    createdAt: "2026-07-01T00:00:00.000Z",
    email: "alex.chen+event@example.com",
    id: "user-alex",
    imageUrl: "",
    name: "alex.chen+event@example.com",
    platformRole: "standard",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
};

describe("MySpacesView member copy", () => {
  afterEach(() => cleanup());

  it("uses the product glossary and a natural email fallback", () => {
    render(
      <MySpacesView
        accessibleSpaces={[event]}
        mainSpace={mainCommunity}
        viewer={viewer}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Welcome back, Alex Chen" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Wavesparks Community")).not.toHaveLength(0);
    expect(
      screen.getByText("A private community for Wavesparks members."),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your events" })).toBeInTheDocument();
    expect(screen.getByText("View event")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\bAI\b/i);
    expect(document.body.textContent).not.toMatch(/\bMain Community\b/i);
    expect(document.body.textContent).not.toMatch(/\bspaces?\b/i);
    expect(document.body.textContent).not.toMatch(/\bnetwork\b/i);
  });

  it("exposes the mentoring workspace only to approved mentors", () => {
    const { rerender } = render(
      <MySpacesView
        accessibleSpaces={[mainCommunity, event]}
        mainSpace={mainCommunity}
        viewer={viewer}
      />,
    );

    expect(screen.queryByRole("link", { name: "Mentoring" })).not.toBeInTheDocument();

    rerender(
      <MySpacesView
        accessibleSpaces={[mainCommunity, event]}
        mainSpace={mainCommunity}
        viewer={{
          ...viewer,
          isApprovedMentor: true,
          canMentor: true,
          membership: { ...viewer.membership, mentorStatus: "approved" },
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Mentoring" })).toHaveAttribute(
      "href",
      "/org/wavesparks/mentoring",
    );
  });
});

describe("AppShell member copy", () => {
  afterEach(() => cleanup());

  it("uses Home and community language without exposing the email fallback", () => {
    render(
      <AppShell
        currentPath="/org/wavesparks"
        viewer={{ ...viewer, canAdmin: true }}
      >
        <p>Account content</p>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Wavesparks Community")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Community & events/ })).toHaveAttribute(
      "href",
      "/org/wavesparks/admin/spaces",
    );
    expect(screen.getByText("Alex Chen")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("alex.chen+event@example.com");
    expect(document.body.textContent).not.toMatch(/\bnetwork\b/i);
  });

  it("shows the mentoring workspace only to approved mentors", () => {
    const { rerender } = render(
      <AppShell currentPath="/org/wavesparks" viewer={viewer}>
        <p>Account content</p>
      </AppShell>,
    );

    expect(screen.queryByRole("link", { name: /Mentoring/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Approved mentor")).not.toBeInTheDocument();

    rerender(
      <AppShell
        currentPath="/org/wavesparks/mentoring"
        viewer={{
          ...viewer,
          isApprovedMentor: true,
          canMentor: true,
          membership: { ...viewer.membership, mentorStatus: "approved" },
        }}
      >
        <p>Mentor account content</p>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: /Mentoring/ })).toHaveAttribute(
      "href",
      "/org/wavesparks/mentoring",
    );
    expect(screen.getByRole("link", { name: /Mentoring/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Approved mentor")).toBeInTheDocument();
  });
});

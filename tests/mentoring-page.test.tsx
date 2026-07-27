import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({ UserButton: () => null }));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  isClerkConfigured: () => false,
}));
vi.mock("@/components/layout/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}));
vi.mock("@/lib/auth", () => ({ getViewerContext: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

import { getViewerContext } from "@/lib/auth";
import type { ViewerContext } from "@/lib/domain";
import { redirect } from "next/navigation";
import MentoringPage from "@/app/org/[slug]/mentoring/page";
import {
  createIntroRequestInSpace,
  getMembershipById,
  getOrganizationBySlug,
  getProfileByMembershipId,
  getUserById,
  listVisibleSpacesForMembership,
  resetStore,
} from "@/server/store";

async function mentorViewer(): Promise<ViewerContext> {
  const membership = (await getMembershipById("mem_kai"))!;
  const [org, profile, user] = await Promise.all([
    getOrganizationBySlug("wavesparks"),
    getProfileByMembershipId(membership.id),
    getUserById(membership.userId),
  ]);
  return {
    org: org!,
    profile,
    user: user!,
    membership,
    canAdmin: false,
    isApprovedMentor: true,
    canMentor: true,
    scopes: ["org:member"],
  };
}

describe("mentor workspace", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("shows only the mentor's incoming mentoring queue with contact details private", async () => {
    const viewer = await mentorViewer();
    const [{ space }] = await listVisibleSpacesForMembership(viewer.membership.id);
    const otherMentorProfile = (await getProfileByMembershipId("mem_marcus"))!;
    await Promise.all([
      createIntroRequestInSpace({
        orgId: viewer.org.id,
        spaceId: space.id,
        requesterMembershipId: "mem_jules",
        receiverMembershipId: viewer.membership.id,
        kind: "mentoring",
        sourceType: "profile",
        sourceId: viewer.profile!.id,
        introPurpose: "Mentoring queue marker",
        note: "I would value your guidance.",
        status: "pending",
        suggestedFirstMessage: "Could we discuss my next experiment?",
      }),
      createIntroRequestInSpace({
        orgId: viewer.org.id,
        spaceId: space.id,
        requesterMembershipId: viewer.membership.id,
        receiverMembershipId: "mem_marcus",
        kind: "mentoring",
        sourceType: "profile",
        sourceId: otherMentorProfile.id,
        introPurpose: "Outgoing mentoring marker",
        note: "This must not enter the mentor's incoming queue.",
        status: "pending",
        suggestedFirstMessage: "Hello.",
      }),
      createIntroRequestInSpace({
        orgId: viewer.org.id,
        spaceId: space.id,
        requesterMembershipId: "mem_jules",
        receiverMembershipId: viewer.membership.id,
        kind: "general",
        sourceType: "profile",
        sourceId: viewer.profile!.id,
        introPurpose: "General queue marker",
        note: "This belongs in Introductions.",
        status: "pending",
        suggestedFirstMessage: "Hello.",
      }),
    ]);
    vi.mocked(getViewerContext).mockResolvedValue(viewer);

    render(
      await MentoringPage({
        params: Promise.resolve({ slug: "wavesparks" }),
        searchParams: Promise.resolve({ request_status: "pending" }),
      }),
    );

    expect(screen.getByRole("heading", { level: 1, name: "Mentoring" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View my profile" })).toHaveAttribute(
      "href",
      "/org/wavesparks/profile",
    );
    expect(screen.getByRole("link", { name: "Edit mentor details" })).toHaveAttribute(
      "href",
      "/org/wavesparks/onboarding?step=3&return_to=%2Forg%2Fwavesparks%2Fmentoring%23mentor-profile#mentoring_details",
    );
    expect(screen.getByText("Accepting", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage request availability" })).toHaveAttribute(
      "href",
      "/org/wavesparks/onboarding?step=2&return_to=%2Forg%2Fwavesparks%2Fmentoring%23mentor-profile#matching_intent_group",
    );
    expect(screen.getByRole("link", { name: "Needs response" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "All" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByText("Mentoring queue marker")).toBeInTheDocument();
    expect(screen.queryByText("Outgoing mentoring marker")).not.toBeInTheDocument();
    expect(screen.queryByText("General queue marker")).not.toBeInTheDocument();
    expect(screen.queryByText("Contact details")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Respond in/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/requests"),
    );
  });

  it("redirects a connected member without mentor approval", async () => {
    const viewer = await mentorViewer();
    vi.mocked(getViewerContext).mockResolvedValue({
      ...viewer,
      isApprovedMentor: false,
      canMentor: false,
      membership: { ...viewer.membership, mentorStatus: "needs_review" },
    });

    await expect(
      MentoringPage({
        params: Promise.resolve({ slug: "wavesparks" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("REDIRECT:/org/wavesparks");
    expect(redirect).toHaveBeenCalledWith("/org/wavesparks");
  });

  it("explains when all new requests are paused and links to the right setting", async () => {
    const viewer = await mentorViewer();
    viewer.profile!.introOptIn = false;
    vi.mocked(getViewerContext).mockResolvedValue(viewer);

    render(
      await MentoringPage({
        params: Promise.resolve({ slug: "wavesparks" }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText("Paused", { exact: true })).toBeInTheDocument();
    expect(
      screen.getAllByText(/All new introduction requests are paused/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Manage request availability" })).toHaveAttribute(
      "href",
      "/org/wavesparks/onboarding?step=3&return_to=%2Forg%2Fwavesparks%2Fmentoring%23mentor-profile#intro_opt_in",
    );
  });
});

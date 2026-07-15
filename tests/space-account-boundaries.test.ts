import { beforeEach, describe, expect, it, vi } from "vitest";

import { seedOrganization } from "@/data/seed-data";
import type { ViewerContext } from "@/lib/domain";

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
const revalidatePathMock = vi.hoisted(() => vi.fn());
const afterMock = vi.hoisted(() => vi.fn());
const viewerRef = vi.hoisted(() => ({ current: null as ViewerContext | null }));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/server", () => ({
  after: afterMock,
}));

vi.mock("@/lib/auth", () => ({
  getViewerContext: vi.fn(() => viewerRef.current),
  getViewerContextForAction: vi.fn(() => viewerRef.current),
}));

import {
  markAccountNotificationsReadAction,
  saveSpaceIntentAction,
} from "@/actions/member";
import { getLegacySpaceDestination } from "@/lib/space-auth";
import { buildNotification } from "@/server/notifications";
import {
  addNotification,
  createEventSpace,
  createIntroRequestInSpace,
  getMembershipById,
  getProfileByMembershipId,
  getSpaceIntent,
  getStore,
  getUserById,
  grantSpaceMembership,
  listSpacesForOrg,
  listVisibleSpacesForMembership,
  resetStore,
  respondToIntroRequestInSpace,
  setSpaceMembershipAccessStatus,
} from "@/server/store";
import {
  getAccountInboxNotificationViews,
  getAccountIntroHistoryViews,
} from "@/server/view-models";

async function setViewer(membershipId: string) {
  const membership = (await getMembershipById(membershipId))!;
  const user = (await getUserById(membership.userId))!;
  const profile = await getProfileByMembershipId(membership.id);
  viewerRef.current = {
    org: seedOrganization,
    user,
    membership,
    profile,
    canAdmin: false,
    scopes: ["org:member"],
  };
}

async function createEvent(name: string) {
  return createEventSpace({
    orgId: seedOrganization.id,
    name,
    lifecycle: "active",
  });
}

async function grant(spaceId: string, membershipId: string) {
  return grantSpaceMembership({
    orgId: seedOrganization.id,
    spaceId,
    membershipId,
    joinedVia: "direct",
  });
}

describe("account Inbox and private history boundaries", () => {
  beforeEach(async () => {
    resetStore();
    vi.clearAllMocks();
    await setViewer("mem_jules");
  });

  it("shows and marks account notifications plus only currently accessible Spaces", async () => {
    const currentEvent = await createEvent("Current Inbox Event");
    const removedEvent = await createEvent("Removed Inbox Event");
    await Promise.all([
      grant(currentEvent.id, "mem_jules"),
      grant(removedEvent.id, "mem_jules"),
    ]);

    await Promise.all([
      addNotification(
        buildNotification(
          "ntf_account_boundary",
          seedOrganization.id,
          "mem_jules",
          "admin_note",
          "Account notification",
          "Visible regardless of Space access.",
          "/org/wavesparks/profile",
        ),
      ),
      addNotification(
        buildNotification(
          "ntf_current_boundary",
          seedOrganization.id,
          "mem_jules",
          "admin_note",
          "Current Event notification",
          "Visible while this Event is accessible.",
          `/org/wavesparks/s/${currentEvent.slug}/requests`,
          currentEvent.id,
        ),
      ),
      addNotification(
        buildNotification(
          "ntf_removed_boundary",
          seedOrganization.id,
          "mem_jules",
          "admin_note",
          "Removed Event notification",
          "Must be hidden and remain unread after access is removed.",
          `/org/wavesparks/s/${removedEvent.slug}/requests`,
          removedEvent.id,
        ),
      ),
    ]);
    await setSpaceMembershipAccessStatus({
      orgId: seedOrganization.id,
      spaceId: removedEvent.id,
      membershipId: "mem_jules",
      accessStatus: "removed",
    });

    const accessibleSpaces = (
      await listVisibleSpacesForMembership("mem_jules")
    ).map(({ space }) => space);
    expect(accessibleSpaces.map((space) => space.id)).toContain(currentEvent.id);
    expect(accessibleSpaces.map((space) => space.id)).not.toContain(removedEvent.id);

    const inbox = await getAccountInboxNotificationViews(
      "mem_jules",
      accessibleSpaces,
    );
    const visibleIds = inbox.map((notification) => notification.id);
    expect(visibleIds).toEqual(
      expect.arrayContaining(["ntf_account_boundary", "ntf_current_boundary"]),
    );
    expect(visibleIds).not.toContain("ntf_removed_boundary");

    await expect(
      markAccountNotificationsReadAction("wavesparks", "mem_jules"),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavesparks/requests?status=notifications_read",
    );

    const notificationById = new Map(
      getStore().notifications.map((notification) => [notification.id, notification]),
    );
    expect(notificationById.get("ntf_account_boundary")?.readAt).toEqual(
      expect.any(String),
    );
    expect(notificationById.get("ntf_current_boundary")?.readAt).toEqual(
      expect.any(String),
    );
    expect(notificationById.get("ntf_removed_boundary")?.readAt).toBeUndefined();
  });

  it("retains completed Intro history after removal but hides pending requests", async () => {
    const event = await createEvent("Private History Event");
    await Promise.all([
      grant(event.id, "mem_jules"),
      grant(event.id, "mem_leila"),
      grant(event.id, "mem_kai"),
    ]);
    const leilaProfile = (await getProfileByMembershipId("mem_leila"))!;
    const kaiProfile = (await getProfileByMembershipId("mem_kai"))!;
    const completed = await createIntroRequestInSpace({
      orgId: seedOrganization.id,
      spaceId: event.id,
      requesterMembershipId: "mem_jules",
      receiverMembershipId: "mem_leila",
      sourceType: "profile",
      sourceId: leilaProfile.id,
      introPurpose: "completed private history",
      note: "Retain this after Event removal.",
      status: "pending",
      suggestedFirstMessage: "Hello Leila.",
    });
    await respondToIntroRequestInSpace(event.id, completed.id, "accepted", {
      recordAnalytics: false,
    });
    const pending = await createIntroRequestInSpace({
      orgId: seedOrganization.id,
      spaceId: event.id,
      requesterMembershipId: "mem_jules",
      receiverMembershipId: "mem_kai",
      sourceType: "profile",
      sourceId: kaiProfile.id,
      introPurpose: "pending private history",
      note: "Hide this after Event removal.",
      status: "pending",
      suggestedFirstMessage: "Hello Kai.",
    });

    await setSpaceMembershipAccessStatus({
      orgId: seedOrganization.id,
      spaceId: event.id,
      membershipId: "mem_jules",
      accessStatus: "removed",
    });
    const accessibleSpaces = (
      await listVisibleSpacesForMembership("mem_jules")
    ).map(({ space }) => space);
    const history = await getAccountIntroHistoryViews(
      "mem_jules",
      seedOrganization.id,
      accessibleSpaces,
    );

    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: completed.id,
          status: "accepted",
          spaceId: event.id,
          spaceName: event.name,
        }),
      ]),
    );
    expect(history.map((request) => request.id)).not.toContain(pending.id);
  });
});

describe("legacy Space routing boundaries", () => {
  beforeEach(async () => {
    resetStore();
    vi.clearAllMocks();
    await setViewer("mem_jules");
  });

  it("canonicalizes a legacy route when exactly one effective Space exists", async () => {
    const [onlySpace] = await listVisibleSpacesForMembership("mem_jules");
    expect(onlySpace).toBeDefined();
    await expect(
      getLegacySpaceDestination("wavesparks", "/feed/"),
    ).resolves.toBe(`/org/wavesparks/s/${onlySpace.space.slug}/feed`);
  });

  it("returns to My Spaces when no effective Space exists", async () => {
    const mainSpace = (await listSpacesForOrg(seedOrganization.id)).find(
      (space) => space.kind === "main",
    )!;
    await setSpaceMembershipAccessStatus({
      orgId: seedOrganization.id,
      spaceId: mainSpace.id,
      membershipId: "mem_jules",
      accessStatus: "removed",
    });

    await expect(
      getLegacySpaceDestination("wavesparks", "feed"),
    ).resolves.toBe("/org/wavesparks");
  });

  it("returns to My Spaces instead of guessing when multiple Spaces exist", async () => {
    const event = await createEvent("Ambiguous Legacy Event");
    await grant(event.id, "mem_jules");

    await expect(
      getLegacySpaceDestination("wavesparks", "people/mem_leila"),
    ).resolves.toBe("/org/wavesparks");
  });
});

describe("Space intent interaction gate", () => {
  beforeEach(async () => {
    resetStore();
    vi.clearAllMocks();
    await setViewer("mem_jules");
  });

  it("rejects direct Space intent writes before the core Profile is complete", async () => {
    const mainSpace = (await listSpacesForOrg(seedOrganization.id)).find(
      (space) => space.kind === "main",
    )!;
    const existing = await getSpaceIntent(mainSpace.id, "mem_jules");
    viewerRef.current = {
      ...viewerRef.current!,
      profile: {
        ...viewerRef.current!.profile!,
        onboardingComplete: false,
      },
    };
    const formData = new FormData();
    formData.set("current_goal", "This must not be persisted yet.");
    formData.set("looking_for", "mentor");

    await expect(
      saveSpaceIntentAction(
        "wavesparks",
        mainSpace.id,
        "mem_jules",
        formData,
      ),
    ).rejects.toThrow(
      "Complete your profile before posting or connecting with members.",
    );
    await expect(getSpaceIntent(mainSpace.id, "mem_jules")).resolves.toEqual(
      existing,
    );
    expect(afterMock).not.toHaveBeenCalled();
  });
});

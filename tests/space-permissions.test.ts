import { describe, expect, it } from "vitest";

import { seedMemberships, seedProfiles } from "@/data/seed-data";
import type { Space, SpaceIntent, SpaceMembership } from "@/lib/domain";
import {
  canInteractInSpace,
  canMatchInSpace,
  hasEffectiveSpaceAccess,
} from "@/server/space-permissions";

const now = "2026-07-14T00:00:00.000Z";
const membership = {
  ...seedMemberships.find((record) => record.id === "mem_jules")!,
  accountStatus: "connected" as const,
};
const profile = seedProfiles.find(
  (record) => record.membershipId === membership.id,
)!;
const mainSpace: Space = {
  id: "space_main",
  orgId: membership.orgId,
  slug: "main-community",
  kind: "main",
  lifecycle: "active",
  name: "Main Community",
  description: "",
  eventLabel: "",
  matchingEnabled: true,
  createdAt: now,
  updatedAt: now,
};
const eventSpace: Space = {
  ...mainSpace,
  id: "space_event",
  slug: "founder-weekend",
  kind: "event",
  name: "Founder Weekend",
};
const eventMembership: SpaceMembership = {
  id: "sm_event_jules",
  orgId: membership.orgId,
  spaceId: eventSpace.id,
  membershipId: membership.id,
  accessStatus: "active",
  joinedVia: "import",
  grantedAt: now,
  createdAt: now,
  updatedAt: now,
};
const intent: SpaceIntent = {
  id: "intent_event_jules",
  orgId: membership.orgId,
  spaceId: eventSpace.id,
  membershipId: membership.id,
  currentGoal: "Find a technical collaborator",
  lookingFor: ["engineering"],
  offers: ["customer discovery"],
  matchingOptIn: true,
  intentComplete: true,
  seekingText: "engineering",
  offeringText: "customer discovery",
  embeddingStatus: "pending",
  createdAt: now,
  updatedAt: now,
};

describe("Space access policy", () => {
  it("does not let an Event entitlement inherit Main Community access", () => {
    expect(
      hasEffectiveSpaceAccess(membership, mainSpace, eventMembership),
    ).toBe(false);
    expect(
      hasEffectiveSpaceAccess(membership, eventSpace, eventMembership),
    ).toBe(true);
  });

  it.each(["upcoming", "active", "ended"] as const)(
    "keeps entitled members active while an event is %s",
    (lifecycle) => {
      expect(
        hasEffectiveSpaceAccess(
          membership,
          { ...eventSpace, lifecycle },
          eventMembership,
        ),
      ).toBe(true);
    },
  );

  it.each(["draft", "archived"] as const)(
    "closes member access while an event is %s",
    (lifecycle) => {
      expect(
        hasEffectiveSpaceAccess(
          membership,
          { ...eventSpace, lifecycle },
          eventMembership,
        ),
      ).toBe(false);
    },
  );

  it("lets global account suspension override every Space", () => {
    expect(
      hasEffectiveSpaceAccess(
        { ...membership, accountStatus: "suspended" },
        eventSpace,
        eventMembership,
      ),
    ).toBe(false);
  });

  it("gates interaction on the core profile and matching on Space intent", () => {
    expect(
      canInteractInSpace(membership, profile, eventSpace, eventMembership),
    ).toBe(true);
    expect(
      canInteractInSpace(
        membership,
        { ...profile, onboardingComplete: false },
        eventSpace,
        eventMembership,
      ),
    ).toBe(false);
    expect(
      canMatchInSpace(
        membership,
        profile,
        eventSpace,
        eventMembership,
        intent,
      ),
    ).toBe(true);
    expect(
      canMatchInSpace(
        membership,
        profile,
        eventSpace,
        eventMembership,
        { ...intent, matchingOptIn: false },
      ),
    ).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  seedMatchTypeConfigs,
  seedMemberships,
  seedOrganization,
  seedPosts,
  seedProfiles,
} from "@/data/seed-data";
import type {
  Membership,
  Profile,
  Space,
  SpaceIntent,
  SpaceMembership,
} from "@/lib/domain";
import {
  buildSpaceIntentEmbeddingTexts,
  MATCHING_ALGORITHM_VERSION,
  recomputeMatchesForSpaceMembers,
  spaceAllowsMatching,
  type SpaceMatchingMember,
} from "@/server/matching";
import {
  defaultMainSpaceIdForOrg,
  getStore,
  listMatchesForProfile,
  listVisibleMatchTargetMembershipIdsForProfile,
  listVisibleSpacesForMembership,
  recomputeMatchesForAllOrganizations,
  recomputeMatchesForSpace,
  resetStore,
} from "@/server/store";
import { getMatchCardViewsForProfileInSpace } from "@/server/view-models";

const now = "2026-07-14T08:00:00.000Z";

function eventSpace(id: string, lifecycle: Space["lifecycle"] = "active"): Space {
  return {
    id,
    orgId: seedOrganization.id,
    slug: id,
    kind: "event",
    lifecycle,
    name: id,
    description: "Test event",
    eventLabel: "Test event",
    matchingEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function spaceRecord(
  space: Space,
  membership: Membership,
  profile: Profile,
  overrides: {
    accountStatus?: Membership["accountStatus"];
    accessStatus?: SpaceMembership["accessStatus"];
    matchingOptIn?: boolean;
    intentComplete?: boolean;
  } = {},
): SpaceMatchingMember {
  const scopedMembership = {
    ...membership,
    accountStatus: overrides.accountStatus ?? "connected",
    // Legacy community access must not control event matching.
    status: "waitlist" as const,
  };
  const spaceMembership: SpaceMembership = {
    id: `sm_${space.id}_${membership.id}`,
    orgId: space.orgId,
    spaceId: space.id,
    membershipId: membership.id,
    accessStatus: overrides.accessStatus ?? "active",
    joinedVia: "direct",
    grantedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const intent: SpaceIntent = {
    id: `si_${space.id}_${membership.id}`,
    orgId: space.orgId,
    spaceId: space.id,
    membershipId: membership.id,
    currentGoal: profile.idealMatchDescription,
    lookingFor: [...profile.desiredRoles, ...profile.helpNeededTags],
    offers: [...profile.skillTags, ...profile.canContribute, ...profile.mentorOffers],
    matchingOptIn: overrides.matchingOptIn ?? true,
    intentComplete: overrides.intentComplete ?? true,
    seekingText: profile.idealMatchDescription,
    offeringText: profile.canContribute.join(", "),
    seekingEmbedding: profile.seekingEmbedding,
    offeringEmbedding: profile.offeringEmbedding,
    embeddingModel: profile.embeddingModel,
    embeddingStatus: "ready",
    createdAt: now,
    updatedAt: now,
  };
  return { membership: scopedMembership, profile, spaceMembership, intent };
}

function compatibleRecords(space: Space) {
  const julesMembership = seedMemberships.find((item) => item.id === "mem_jules")!;
  const rheaMembership = seedMemberships.find((item) => item.id === "mem_rhea")!;
  const julesProfile = seedProfiles.find((item) => item.id === "pro_jules")!;
  const rheaProfile = seedProfiles.find((item) => item.id === "pro_rhea")!;
  return [
    spaceRecord(space, julesMembership, julesProfile),
    spaceRecord(space, rheaMembership, rheaProfile),
  ];
}

async function readableSpaceMatchFixture(id: string) {
  const store = getStore();
  const space = eventSpace(id);
  const records = compatibleRecords(space);
  store.spaces.push(space);
  store.spaceMemberships.push(...records.map((record) => record.spaceMembership));
  store.spaceIntents.push(...records.map((record) => record.intent));

  const matches = await recomputeMatchesForSpace(space.id);
  const match = matches[0];
  if (!match) throw new Error("Expected a Space-scoped match fixture.");
  const sourceProfile = store.profiles.find(
    (profile) => profile.id === match.sourceProfileId,
  );
  const targetProfile = store.profiles.find(
    (profile) => profile.id === match.targetProfileId,
  );
  const targetMembership = targetProfile
    ? store.memberships.find(
        (membership) => membership.id === targetProfile.membershipId,
      )
    : undefined;
  const targetSpaceMembership = targetMembership
    ? store.spaceMemberships.find(
        (spaceMembership) =>
          spaceMembership.spaceId === space.id &&
          spaceMembership.membershipId === targetMembership.id,
      )
    : undefined;
  const targetIntent = targetMembership
    ? store.spaceIntents.find(
        (intent) =>
          intent.spaceId === space.id && intent.membershipId === targetMembership.id,
      )
    : undefined;
  if (
    !sourceProfile ||
    !targetProfile ||
    !targetMembership ||
    !targetSpaceMembership ||
    !targetIntent
  ) {
    throw new Error("Incomplete Space-scoped match fixture.");
  }

  const initialCards = await getMatchCardViewsForProfileInSpace(
    space.id,
    sourceProfile.id,
    sourceProfile.membershipId,
  );
  expect(initialCards.some((card) => card.match.id === match.id)).toBe(true);

  return {
    match,
    sourceProfile,
    space,
    targetIntent,
    targetMembership,
    targetProfile,
    targetSpaceMembership,
  };
}

async function expectStaleTargetHidden(
  fixture: Awaited<ReturnType<typeof readableSpaceMatchFixture>>,
) {
  const { match, sourceProfile, space, targetMembership } = fixture;
  const [matches, targetMembershipIds, cards] = await Promise.all([
    listMatchesForProfile(sourceProfile.id, { spaceId: space.id, limit: 1000 }),
    listVisibleMatchTargetMembershipIdsForProfile(sourceProfile.id, {
      spaceId: space.id,
      limit: 1000,
    }),
    getMatchCardViewsForProfileInSpace(
      space.id,
      sourceProfile.id,
      sourceProfile.membershipId,
    ),
  ]);

  expect(matches.map((candidate) => candidate.id)).not.toContain(match.id);
  expect(targetMembershipIds).not.toContain(targetMembership.id);
  expect(cards.map((card) => card.match.id)).not.toContain(match.id);
}

describe("Space-scoped matching", () => {
  beforeEach(() => {
    resetStore();
  });

  it("uses active Space access instead of legacy community approval", () => {
    const space = eventSpace("space_event_access");
    const records = compatibleRecords(space);
    const matches = recomputeMatchesForSpaceMembers(
      seedOrganization,
      space,
      records,
      seedMatchTypeConfigs,
      { limit: null },
    );

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((match) => match.spaceId === space.id)).toBe(true);
    expect(records.every((record) => record.membership.status === "waitlist")).toBe(true);
  });

  it("uses the per-Space opt-in instead of the retired global matching toggle", () => {
    const space = eventSpace("space_event_per_space_opt_in");
    const records = compatibleRecords(space).map((record) => ({
      ...record,
      profile: { ...record.profile, profileVisibleInMatching: false },
      intent: { ...record.intent, matchingOptIn: true },
    }));

    expect(
      recomputeMatchesForSpaceMembers(
        seedOrganization,
        space,
        records,
        seedMatchTypeConfigs,
        { limit: null },
      ).length,
    ).toBeGreaterThan(0);
  });

  it("uses explicit Space needs and offers as structured reciprocal evidence", () => {
    const space = eventSpace("space_event_explicit_intent");
    const config = {
      ...seedMatchTypeConfigs.find((candidate) => candidate.slug === "cofounder_match")!,
      minimumScore: 1,
    };
    const baselineRecords = compatibleRecords(space);
    const baseline = recomputeMatchesForSpaceMembers(
      seedOrganization,
      space,
      baselineRecords,
      [config],
      { limit: null },
    ).find(
      (match) =>
        match.sourceProfileId === "pro_jules" && match.targetProfileId === "pro_rhea",
    );
    const explicitRecords = compatibleRecords(space).map((record) => ({
      ...record,
      intent: { ...record.intent },
    }));
    const source = explicitRecords.find((record) => record.profile.id === "pro_jules")!;
    const target = explicitRecords.find((record) => record.profile.id === "pro_rhea")!;
    source.intent.lookingFor = ["backend systems architecture"];
    source.intent.offers = ["customer discovery interviews"];
    target.intent.lookingFor = ["customer discovery interviews"];
    target.intent.offers = ["backend systems architecture"];
    const explicit = recomputeMatchesForSpaceMembers(
      seedOrganization,
      space,
      explicitRecords,
      [config],
      { limit: null },
    ).find(
      (match) =>
        match.sourceProfileId === "pro_jules" && match.targetProfileId === "pro_rhea",
    );

    expect(baseline).toBeDefined();
    expect(explicit).toBeDefined();
    expect(explicit!.score).toBeGreaterThan(baseline!.score);
    expect(explicit!.scoreBreakdown.skills).toBeGreaterThan(
      baseline!.scoreBreakdown.skills,
    );
  });

  it("excludes disconnected accounts, inactive Space access, and incomplete opt-ins", () => {
    const space = eventSpace("space_event_eligibility");
    const base = compatibleRecords(space);

    for (const blockedTarget of [
      spaceRecord(space, base[1].membership, base[1].profile, {
        accountStatus: "invited",
      }),
      spaceRecord(space, base[1].membership, base[1].profile, {
        accessStatus: "suspended",
      }),
      spaceRecord(space, base[1].membership, base[1].profile, {
        matchingOptIn: false,
      }),
      spaceRecord(space, base[1].membership, base[1].profile, {
        intentComplete: false,
      }),
    ]) {
      expect(
        recomputeMatchesForSpaceMembers(
          seedOrganization,
          space,
          [base[0], blockedTarget],
          seedMatchTypeConfigs,
          { limit: null },
        ),
      ).toEqual([]);
    }
  });

  it("hides a stale match immediately when the target is removed from the Space", async () => {
    const fixture = await readableSpaceMatchFixture("space_event_removed_match_target");
    fixture.targetSpaceMembership.accessStatus = "removed";
    fixture.targetSpaceMembership.removedAt = now;

    await expectStaleTargetHidden(fixture);
    expect(getStore().matches.some((match) => match.id === fixture.match.id)).toBe(true);
  });

  it("hides a stale match immediately when the target account is suspended", async () => {
    const fixture = await readableSpaceMatchFixture("space_event_suspended_match_target");
    fixture.targetMembership.accountStatus = "suspended";

    await expectStaleTargetHidden(fixture);
    expect(getStore().matches.some((match) => match.id === fixture.match.id)).toBe(true);
  });

  it("hides a stale match immediately when the target opts out in this Space", async () => {
    const fixture = await readableSpaceMatchFixture("space_event_opted_out_match_target");
    fixture.targetIntent.matchingOptIn = false;

    await expectStaleTargetHidden(fixture);
    expect(getStore().matches.some((match) => match.id === fixture.match.id)).toBe(true);
  });

  it("never presents a score produced by an older algorithm as current", async () => {
    const fixture = await readableSpaceMatchFixture("space_event_old_algorithm_match");
    fixture.match.algorithmVersion = "hybrid-v3";

    await expectStaleTargetHidden(fixture);
    expect(getStore().matches.some((match) => match.id === fixture.match.id)).toBe(true);
  });

  it("hides stale targets whose core profile or Space intent becomes incomplete", async () => {
    const fixture = await readableSpaceMatchFixture("space_event_incomplete_match_target");
    fixture.targetProfile.onboardingComplete = false;
    await expectStaleTargetHidden(fixture);

    fixture.targetProfile.onboardingComplete = true;
    fixture.targetIntent.intentComplete = false;
    await expectStaleTargetHidden(fixture);
    expect(getStore().matches.some((match) => match.id === fixture.match.id)).toBe(true);
  });

  it("keeps ended events interactive but stops matching drafts and archives", () => {
    const ended = eventSpace("space_event_ended", "ended");
    expect(spaceAllowsMatching(ended)).toBe(true);
    expect(
      recomputeMatchesForSpaceMembers(
        seedOrganization,
        ended,
        compatibleRecords(ended),
        seedMatchTypeConfigs,
      ).length,
    ).toBeGreaterThan(0);

    for (const lifecycle of ["draft", "archived"] as const) {
      const space = eventSpace(`space_event_${lifecycle}`, lifecycle);
      expect(spaceAllowsMatching(space)).toBe(false);
      expect(
        recomputeMatchesForSpaceMembers(
          seedOrganization,
          space,
          compatibleRecords(space),
          seedMatchTypeConfigs,
        ),
      ).toEqual([]);
    }
  });

  it("creates distinct match identities for the same people in different Spaces", () => {
    const first = eventSpace("space_event_first");
    const second = eventSpace("space_event_second");
    const firstMatches = recomputeMatchesForSpaceMembers(
      seedOrganization,
      first,
      compatibleRecords(first),
      seedMatchTypeConfigs,
    );
    const secondMatches = recomputeMatchesForSpaceMembers(
      seedOrganization,
      second,
      compatibleRecords(second),
      seedMatchTypeConfigs,
    );

    expect(firstMatches.length).toBeGreaterThan(0);
    expect(secondMatches.length).toBeGreaterThan(0);
    expect(new Set(firstMatches.map((match) => match.id))).not.toEqual(
      new Set(secondMatches.map((match) => match.id)),
    );
  });

  it("builds recent intent only from posts supplied for the current Space", () => {
    const space = eventSpace("space_event_text");
    const [record] = compatibleRecords(space);
    const basePost = seedPosts[0];
    const scopedPost = {
      ...basePost,
      id: "post_scoped_signal",
      spaceId: space.id,
      authorMembershipId: record.membership.id,
      type: "ask" as const,
      title: "Space-only robotics collaborator",
      body: "Looking inside this event only.",
      hidden: false,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    };

    const withPost = buildSpaceIntentEmbeddingTexts(
      record.profile,
      record.intent,
      [scopedPost],
      new Date(now),
    );
    const withoutPost = buildSpaceIntentEmbeddingTexts(
      record.profile,
      record.intent,
      [],
      new Date(now),
    );

    expect(withPost.seekingText).toContain("Space-only robotics collaborator");
    expect(withoutPost.seekingText).not.toContain("Space-only robotics collaborator");
    expect(withPost.profileSeekingText).toBe(withoutPost.profileSeekingText);
  });

  it("lists only connected, active, non-archived Spaces for a member", async () => {
    const store = getStore();
    const event = eventSpace("space_event_visible");
    const archived = eventSpace("space_event_archived", "archived");
    const priya = store.memberships.find((membership) => membership.id === "mem_priya")!;
    store.spaces.push(event, archived);
    store.spaceMemberships.push(
      {
        id: "sm_visible_priya",
        orgId: priya.orgId,
        spaceId: event.id,
        membershipId: priya.id,
        accessStatus: "active",
        joinedVia: "invite",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "sm_archived_priya",
        orgId: priya.orgId,
        spaceId: archived.id,
        membershipId: priya.id,
        accessStatus: "active",
        joinedVia: "invite",
        createdAt: now,
        updatedAt: now,
      },
    );

    await expect(listVisibleSpacesForMembership(priya.id)).resolves.toMatchObject([
      { space: { id: event.id } },
    ]);
    expect(defaultMainSpaceIdForOrg(priya.orgId)).toMatch(/^spc_main_[a-f0-9]{32}$/);

    priya.accountStatus = "invited";
    await expect(listVisibleSpacesForMembership(priya.id)).resolves.toEqual([]);
  });

  it("recomputes and archives one Space without altering another", async () => {
    const store = getStore();
    const first = eventSpace("space_event_store_first", "ended");
    const second = eventSpace("space_event_store_second");
    store.spaces.push(first, second);

    for (const space of [first, second]) {
      const records = compatibleRecords(space);
      store.spaceMemberships.push(...records.map((record) => record.spaceMembership));
      store.spaceIntents.push(...records.map((record) => record.intent));
    }

    const firstMatches = await recomputeMatchesForSpace(first.id);
    expect(firstMatches.length).toBeGreaterThan(0);
    const secondMatches = await recomputeMatchesForSpace(second.id);
    expect(secondMatches.length).toBeGreaterThan(0);
    expect(getStore().matches.some((match) => match.spaceId === first.id)).toBe(true);
    expect(getStore().matches.some((match) => match.spaceId === second.id)).toBe(true);

    first.lifecycle = "archived";
    first.archivedAt = now;
    await expect(recomputeMatchesForSpace(first.id)).resolves.toEqual([]);
    expect(getStore().matches.some((match) => match.spaceId === first.id)).toBe(false);
    expect(getStore().matches.some((match) => match.spaceId === second.id)).toBe(true);
  });

  it("records the current algorithm version for an active Space with no matches", async () => {
    const store = getStore();
    const empty = eventSpace("space_event_store_empty");
    store.spaces.push(empty);

    await expect(recomputeMatchesForSpace(empty.id)).resolves.toEqual([]);
    expect(store.matchRuns.find((run) => run.spaceId === empty.id)).toMatchObject({
      status: "completed",
      metadata: {
        algorithmVersion: MATCHING_ALGORITHM_VERSION,
        matches: 0,
      },
    });
  });

  it("prepares embeddings and telemetry only for matching-eligible members", async () => {
    const store = getStore();
    const space = eventSpace("space_event_eligible_embeddings");
    const records = compatibleRecords(space);
    records[1].intent.matchingOptIn = false;
    store.spaces.push(space);
    store.spaceMemberships.push(...records.map((record) => record.spaceMembership));
    store.spaceIntents.push(...records.map((record) => record.intent));
    const optedOutProfile = store.profiles.find(
      (profile) => profile.id === records[1].profile.id,
    )!;
    optedOutProfile.embeddingStatus = "pending";
    optedOutProfile.embeddingUpdatedAt = undefined;
    optedOutProfile.embeddingSourceHash = undefined;
    optedOutProfile.seekingEmbedding = undefined;
    optedOutProfile.offeringEmbedding = undefined;

    await recomputeMatchesForSpace(space.id);

    expect(optedOutProfile.embeddingUpdatedAt).toBeUndefined();
    expect(store.matchRuns.find((run) => run.spaceId === space.id)).toMatchObject({
      status: "completed",
      metadata: { eligibleProfiles: 1 },
    });
  });

  it("continues the scheduled refresh after one Space fails", async () => {
    const store = getStore();
    const failing = eventSpace("space_event_scheduled_failure");
    const succeeding = eventSpace("space_event_scheduled_success");
    store.spaces.push(failing, succeeding);
    const attemptedSpaceIds: string[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const result = await recomputeMatchesForAllOrganizations({
        recomputeSpace: async (spaceId) => {
          attemptedSpaceIds.push(spaceId);
          if (spaceId === failing.id) throw new Error("Synthetic Space failure");
          return [];
        },
      });

      expect(attemptedSpaceIds).toContain(failing.id);
      expect(attemptedSpaceIds).toContain(succeeding.id);
      expect(result.failedSpaceCount).toBe(1);
      expect(result.organizations[0]).toMatchObject({
        successfulSpaceCount: result.organizations[0].spaceCount - 1,
        failures: [{ spaceId: failing.id }],
      });
    } finally {
      consoleError.mockRestore();
    }
  });
});

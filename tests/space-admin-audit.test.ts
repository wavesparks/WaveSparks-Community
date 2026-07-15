import { beforeEach, describe, expect, it } from "vitest";

import { seedOrganization } from "@/data/seed-data";
import type { MatchRecord } from "@/lib/domain";
import { buildNotification } from "@/server/notifications";
import {
  addNotification,
  countActiveSpaceMembersBySpaceIds,
  createCommentInSpace,
  createEventSpace,
  createIntroRequestInSpace,
  createPostInSpace,
  followMembershipInSpace,
  getSpaceAuditMetrics,
  getStore,
  grantSpaceMembership,
  listAdminMatchCardRecordsForSpace,
  listAdminSpaceParticipantRecords,
  listIntroRequestsForSpace,
  listMatchProfileRecordsForSpace,
  listMatchRunsForSpace,
  resetStore,
  savePostForMembershipInSpace,
} from "@/server/store";

async function createTestSpace(name: string) {
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

async function createTestPost(spaceId: string, authorMembershipId: string, title: string) {
  return createPostInSpace(
    {
      orgId: seedOrganization.id,
      spaceId,
      authorMembershipId,
      type: "general_update",
      title,
      body: `Body for ${title}`,
      tags: [],
      relatedStartupName: "",
      relatedRolesNeeded: [],
      status: "active",
      featured: false,
      hidden: false,
      commentsLocked: false,
    },
    { recordAnalytics: false },
  );
}

function testMatch(
  id: string,
  spaceId: string,
  overrides: Partial<MatchRecord> = {},
): MatchRecord {
  const now = new Date().toISOString();
  return {
    id,
    orgId: seedOrganization.id,
    spaceId,
    sourceProfileId: "pro_jules",
    targetProfileId: "pro_leila",
    matchType: "cofounder",
    score: 86,
    scoreBreakdown: {},
    explanationText: "Test Space recommendation.",
    overlapTags: [],
    scoreBand: "high",
    confidence: "high",
    algorithmVersion: "test-space-audit",
    surfacedAt: now,
    dismissedBySource: false,
    hiddenByAdmin: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Space-scoped admin audit data", () => {
  beforeEach(() => {
    resetStore();
  });

  it("counts and lists content, intros, matches, and runs only for the requested Space", async () => {
    const alpha = await createTestSpace("Admin Audit Alpha");
    const beta = await createTestSpace("Admin Audit Beta");
    await Promise.all([
      grant(alpha.id, "mem_jules"),
      grant(alpha.id, "mem_leila"),
      grant(beta.id, "mem_kai"),
      grant(beta.id, "mem_marcus"),
    ]);

    const alphaPost = await createTestPost(alpha.id, "mem_jules", "Alpha audit post");
    await createTestPost(beta.id, "mem_kai", "Beta audit post");
    await createCommentInSpace(
      alpha.id,
      {
        postId: alphaPost.id,
        authorMembershipId: "mem_leila",
        body: "Alpha-only comment.",
      },
      { recordAnalytics: false },
    );
    await followMembershipInSpace({
      orgId: seedOrganization.id,
      spaceId: alpha.id,
      followerMembershipId: "mem_jules",
      followedMembershipId: "mem_leila",
    });
    await savePostForMembershipInSpace(
      seedOrganization.id,
      alpha.id,
      "mem_leila",
      alphaPost.id,
    );
    await addNotification(
      buildNotification(
        "ntf_alpha_audit",
        seedOrganization.id,
        "mem_jules",
        "admin_note",
        "Alpha audit notification",
        "Scoped to Alpha.",
        `/org/wavesparks/s/${alpha.slug}`,
        alpha.id,
      ),
    );

    const alphaIntro = await createIntroRequestInSpace({
      orgId: seedOrganization.id,
      spaceId: alpha.id,
      requesterMembershipId: "mem_jules",
      receiverMembershipId: "mem_leila",
      sourceType: "profile",
      sourceId: "pro_leila",
      introPurpose: "Alpha intro",
      note: "Alpha only.",
      status: "pending",
      suggestedFirstMessage: "Hello from Alpha.",
    });
    await createIntroRequestInSpace({
      orgId: seedOrganization.id,
      spaceId: beta.id,
      requesterMembershipId: "mem_kai",
      receiverMembershipId: "mem_marcus",
      sourceType: "profile",
      sourceId: "pro_marcus",
      introPurpose: "Beta intro",
      note: "Beta only.",
      status: "pending",
      suggestedFirstMessage: "Hello from Beta.",
    });

    const store = getStore();
    const baseIntent = store.spaceIntents.find(
      (intent) => intent.membershipId === "mem_jules",
    );
    expect(baseIntent).toBeDefined();
    store.spaceIntents.push({
      ...baseIntent!,
      id: "intent_alpha_jules",
      spaceId: alpha.id,
    });
    store.matches.push(
      testMatch("match_alpha_visible", alpha.id),
      testMatch("match_alpha_hidden", alpha.id, { hiddenByAdmin: true, score: 80 }),
      testMatch("match_beta_visible", beta.id, {
        sourceProfileId: "pro_kai",
        targetProfileId: "pro_marcus",
        score: 92,
      }),
    );
    store.matchRuns.push(
      {
        id: "run_alpha",
        orgId: seedOrganization.id,
        spaceId: alpha.id,
        startedAt: "2026-07-14T10:00:00.000Z",
        completedAt: "2026-07-14T10:00:01.000Z",
        status: "completed",
        metadata: {},
      },
      {
        id: "run_beta",
        orgId: seedOrganization.id,
        spaceId: beta.id,
        startedAt: "2026-07-14T11:00:00.000Z",
        completedAt: "2026-07-14T11:00:01.000Z",
        status: "completed",
        metadata: {},
      },
    );

    await expect(getSpaceAuditMetrics(alpha.id)).resolves.toEqual({
      posts: 1,
      visibleComments: 1,
      follows: 1,
      savedPosts: 1,
      notifications: 1,
      introRequests: 1,
      pendingIntroRequests: 1,
      matches: 2,
      visibleMatches: 1,
    });

    const intros = await listIntroRequestsForSpace(alpha.id);
    expect(intros.map((intro) => intro.id)).toEqual([alphaIntro.id]);

    const matches = await listMatchProfileRecordsForSpace(alpha.id);
    expect(matches.map(({ match }) => match.id)).toEqual([
      "match_alpha_visible",
      "match_alpha_hidden",
    ]);
    expect(matches.every(({ match }) => match.spaceId === alpha.id)).toBe(true);

    await expect(
      countActiveSpaceMembersBySpaceIds(seedOrganization.id, [alpha.id, beta.id]),
    ).resolves.toEqual(
      new Map([
        [alpha.id, 2],
        [beta.id, 2],
      ]),
    );
    const participantCards = await listAdminSpaceParticipantRecords(alpha.id);
    expect(participantCards).toHaveLength(2);
    expect(Object.keys(participantCards[0].profile ?? {}).sort()).toEqual([
      "onboardingComplete",
      "preferredName",
    ]);
    const participantWithIntent = participantCards.find((participant) => participant.intent);
    expect(Object.keys(participantWithIntent?.intent ?? {}).sort()).toEqual([
      "intentComplete",
      "matchingOptIn",
    ]);

    const topMatchCards = await listAdminMatchCardRecordsForSpace(alpha.id, { limit: 1 });
    expect(topMatchCards).toHaveLength(1);
    expect(topMatchCards[0].match.id).toBe("match_alpha_visible");
    expect(Object.keys(topMatchCards[0].match).sort()).toEqual([
      "dismissedBySource",
      "explanationText",
      "hiddenByAdmin",
      "id",
      "matchType",
      "scoreBand",
      "spaceId",
    ]);
    expect(Object.keys(topMatchCards[0].sourceProfile ?? {})).toEqual(["preferredName"]);
    expect(Object.keys(topMatchCards[0].targetProfile ?? {})).toEqual(["preferredName"]);

    const runs = await listMatchRunsForSpace(alpha.id);
    expect(runs.map((run) => run.id)).toEqual(["run_alpha"]);
  });
});

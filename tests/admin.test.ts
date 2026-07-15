import { beforeEach, describe, expect, it } from "vitest";

import { fullProfilesToCsv } from "@/server/csv";
import {
  createComment,
  createIntroRequestInSpace,
  getAdminOverviewData,
  getAnalyticsSnapshot,
  getCommentRecordById,
  getMembershipById,
  getPostById,
  getProfileRecordById,
  getPublicOrgStats,
  getStore,
  listAllCommentsForOrg,
  listMatchProfileRecordsForOrg,
  listMatchesForOrg,
  listIntroRequestsForOrg,
  listMembershipRecordsByIds,
  listMembershipRecordsForOrg,
  listMembershipsForOrg,
  listMembershipProfileRecordsForOrg,
  listMembershipUserRecordsByIds,
  listMembershipUserRecordsForOrg,
  listPostsForOrg,
  listProfileMembershipRecordsByIds,
  listProfileRecordsByIds,
  listProfilesForOrg,
  listSpacesForOrg,
  recomputeMatchesForProfile,
  recomputeMatchesForOrg,
  resetStore,
  updateCommentStatus,
  updatePostModeration,
  updateOrganizationSettings,
  updateProfileFlags,
} from "@/server/store";
import {
  getAdminPostModerationDashboard,
  getAdminIntroRequestDashboard,
  toFullAdminProfile,
} from "@/server/view-models";

describe("admin operations", () => {
  beforeEach(() => {
    resetStore();
  });

  it("supports moderation toggles and match recompute", async () => {
    const existingPost = (await getPostById("pst_1"))!;
    const profileRecord = (await getProfileRecordById("pro_jules"))!;
    await recomputeMatchesForOrg("org_wavespark");
    const matchesBeforeProfileFlags = await listMatchesForOrg("org_wavespark");
    const unrelatedMatchIdsBeforeProfileFlags = matchesBeforeProfileFlags
      .filter(
        (match) =>
          match.sourceProfileId !== "pro_jules" && match.targetProfileId !== "pro_jules",
      )
      .map((match) => match.id)
      .sort();
    const post = await updatePostModeration(
      "pst_1",
      { hidden: true, featured: false },
      { existingPost },
    );
    const profile = await updateProfileFlags(
      "pro_jules",
      { stale: true },
      {
        existingProfile: profileRecord.profile,
        orgId: profileRecord.membership?.orgId,
      },
    );
    const matchesAfterProfileFlags = await listMatchesForOrg("org_wavespark");
    const unrelatedMatchIdsAfterProfileFlags = matchesAfterProfileFlags
      .filter(
        (match) =>
          match.sourceProfileId !== "pro_jules" && match.targetProfileId !== "pro_jules",
      )
      .map((match) => match.id)
      .sort();
    const comment = await createComment(
      {
        postId: "pst_1",
        authorMembershipId: "mem_jules",
        body: "Admin moderation helper coverage.",
      },
      { orgId: "org_wavespark" },
    );
    const secondComment = await createComment(
      {
        postId: "pst_1",
        authorMembershipId: "mem_kai",
        body: "Second admin moderation queue item.",
      },
      { orgId: "org_wavespark" },
    );
    const thirdComment = await createComment(
      {
        postId: "pst_1",
        authorMembershipId: "mem_marcus",
        body: "Third admin moderation queue item.",
      },
      { orgId: "org_wavespark" },
    );
    const commentRecord = (await getCommentRecordById(comment.id))!;
    const removedComment = await updateCommentStatus(comment.id, "removed", {
      existingComment: commentRecord.comment,
    });
    const latestComments = await listAllCommentsForOrg("org_wavespark", { limit: 2 });
    const moderationDashboard = await getAdminPostModerationDashboard("org_wavespark", {
      postLimit: 2,
      commentLimit: 2,
    });
    const matches = await recomputeMatchesForOrg("org_wavespark");
    const visibleMatches = await listMatchesForOrg("org_wavespark", { limit: 20 });
    const matchCards = await listMatchProfileRecordsForOrg("org_wavespark", { limit: 20 });
    const cofounderMatchCards = await listMatchProfileRecordsForOrg("org_wavespark", {
      limit: 10,
      matchType: "cofounder_match",
    });
    const scoreBandMatchCards = await listMatchProfileRecordsForOrg("org_wavespark", {
      limit: 10,
      scoreBand: matchCards[0].match.scoreBand,
    });
    const matchProfileRecords = await listProfileRecordsByIds(
      visibleMatches.flatMap((match) => [match.sourceProfileId, match.targetProfileId]),
      { orgId: "org_wavespark" },
    );
    const lightweightMatchProfileRecords = await listProfileMembershipRecordsByIds(
      visibleMatches.flatMap((match) => [match.sourceProfileId, match.targetProfileId]),
      { orgId: "org_wavespark" },
    );
    const profileIds = new Set(matchProfileRecords.map((record) => record.profile.id));
    const memberRecords = await listMembershipRecordsForOrg("org_wavespark");
    const latestMemberRecords = await listMembershipRecordsForOrg("org_wavespark", { limit: 2 });
    const approvedMemberRecords = await listMembershipRecordsForOrg("org_wavespark", {
      status: "approved",
    });
    const suspendedMemberRecords = await listMembershipRecordsForOrg("org_wavespark", {
      status: "suspended",
    });
    const profileOnlyRecords = await listMembershipProfileRecordsForOrg("org_wavespark");
    const latestProfileOnlyRecords = await listMembershipProfileRecordsForOrg("org_wavespark", {
      limit: 2,
    });
    const approvedProfileRecords = await listMembershipProfileRecordsForOrg("org_wavespark", {
      profileRequired: true,
      status: "approved",
    });
    const featuredProfileRecords = await listMembershipProfileRecordsForOrg("org_wavespark", {
      featured: true,
      profileRequired: true,
    });
    const staleProfileRecords = await listMembershipProfileRecordsForOrg("org_wavespark", {
      profileRequired: true,
      stale: true,
    });
    const approvedUserRecords = await listMembershipUserRecordsForOrg("org_wavespark", {
      status: "approved",
    });
    const participantUserRecords = await listMembershipUserRecordsByIds(
      ["mem_jules", "mem_jules", "mem_marcus"],
      { orgId: "org_wavespark" },
    );
    const latestApprovedUserRecords = await listMembershipUserRecordsForOrg("org_wavespark", {
      limit: 2,
      status: "approved",
    });
    const scopedMatches = await recomputeMatchesForProfile("org_wavespark", "pro_jules");

    expect(post?.hidden).toBe(true);
    expect(profileRecord.membership?.orgId).toBe("org_wavespark");
    expect(profile?.stale).toBe(true);
    expect(unrelatedMatchIdsAfterProfileFlags).toEqual(unrelatedMatchIdsBeforeProfileFlags);
    expect(
      matchesAfterProfileFlags.some(
        (match) =>
          match.sourceProfileId === "pro_jules" || match.targetProfileId === "pro_jules",
      ),
    ).toBe(true);
    expect(commentRecord.post?.orgId).toBe("org_wavespark");
    expect(removedComment?.status).toBe("removed");
    expect(latestComments).toHaveLength(2);
    expect(latestComments.map((latestComment) => latestComment.id)).toEqual(
      expect.arrayContaining([secondComment.id, thirdComment.id]),
    );
    expect(moderationDashboard.posts).toHaveLength(2);
    expect(moderationDashboard.posts.every((entry) => entry.authorName !== "Unknown")).toBe(true);
    expect(moderationDashboard.comments.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([secondComment.id, thirdComment.id]),
    );
    expect(
      moderationDashboard.comments.every(
        (entry) => entry.postTitle === existingPost.title && entry.authorName !== "Unknown",
      ),
    ).toBe(true);
    expect(matches.length).toBeGreaterThan(0);
    expect(visibleMatches).toHaveLength(Math.min(20, matches.length));
    expect(matchCards).toHaveLength(Math.min(20, matches.length));
    expect(cofounderMatchCards.length).toBeGreaterThan(0);
    expect(cofounderMatchCards.every((record) => record.match.matchType === "cofounder_match")).toBe(
      true,
    );
    expect(scoreBandMatchCards.length).toBeGreaterThan(0);
    expect(
      scoreBandMatchCards.every(
        (record) => record.match.scoreBand === matchCards[0].match.scoreBand,
      ),
    ).toBe(true);
    expect(matchCards.every((record) => record.sourceProfile && record.targetProfile)).toBe(
      true,
    );
    expect(
      visibleMatches.every(
        (match) => profileIds.has(match.sourceProfileId) && profileIds.has(match.targetProfileId),
      ),
    ).toBe(true);
    expect(lightweightMatchProfileRecords.every((record) => record.user === undefined)).toBe(
      true,
    );
    expect(memberRecords.length).toBeGreaterThan(latestMemberRecords.length);
    expect(latestMemberRecords).toHaveLength(2);
    expect(approvedMemberRecords.length).toBeGreaterThan(0);
    expect(approvedMemberRecords.length).toBeLessThan(memberRecords.length);
    expect(
      approvedMemberRecords.every((record) => record.membership.status === "approved"),
    ).toBe(true);
    expect(suspendedMemberRecords).toHaveLength(1);
    expect(suspendedMemberRecords[0].membership.status).toBe("suspended");
    expect(profileOnlyRecords.length).toBeGreaterThan(0);
    expect(profileOnlyRecords.length).toBeGreaterThan(latestProfileOnlyRecords.length);
    expect(latestProfileOnlyRecords).toHaveLength(2);
    expect(profileOnlyRecords.some((record) => record.profile)).toBe(true);
    expect(profileOnlyRecords.every((record) => record.user === undefined)).toBe(true);
    expect(approvedProfileRecords.length).toBeGreaterThan(0);
    expect(
      approvedProfileRecords.every(
        (record) => record.profile && record.membership.status === "approved",
      ),
    ).toBe(true);
    expect(featuredProfileRecords.length).toBeGreaterThan(0);
    expect(featuredProfileRecords.every((record) => record.profile?.featured)).toBe(true);
    expect(staleProfileRecords.length).toBeGreaterThan(0);
    expect(staleProfileRecords.every((record) => record.profile?.stale)).toBe(true);
    expect(approvedUserRecords.length).toBeGreaterThan(0);
    expect(approvedUserRecords.every((record) => record.membership.status === "approved")).toBe(
      true,
    );
    expect(approvedUserRecords.every((record) => record.user)).toBe(true);
    expect(approvedUserRecords.every((record) => record.profile === undefined)).toBe(true);
    expect(participantUserRecords.map((record) => record.membership.id).sort()).toEqual([
      "mem_jules",
      "mem_marcus",
    ]);
    expect(participantUserRecords.every((record) => record.user)).toBe(true);
    expect(participantUserRecords.every((record) => record.profile === undefined)).toBe(true);
    expect(approvedUserRecords.length).toBeGreaterThan(latestApprovedUserRecords.length);
    expect(latestApprovedUserRecords).toHaveLength(2);
    expect(
      latestApprovedUserRecords.every((record) => record.membership.status === "approved"),
    ).toBe(true);
    expect(scopedMatches.length).toBeGreaterThan(0);
    expect(
      scopedMatches.some(
        (match) =>
          match.sourceProfileId === "pro_jules" || match.targetProfileId === "pro_jules",
      ),
    ).toBe(true);
    expect(new Set(scopedMatches.map((match) => match.runId)).size).toBe(1);
    await expect(getProfileRecordById("pro_missing")).resolves.toBeUndefined();
    await expect(getCommentRecordById("cmt_missing")).resolves.toBeUndefined();
  });

  it("creates admin-friendly exports and analytics snapshots", async () => {
    const mainSpace = (await listSpacesForOrg("org_wavespark")).find(
      (space) => space.kind === "main",
    )!;
    await createIntroRequestInSpace({
      orgId: "org_wavespark",
      spaceId: mainSpace.id,
      requesterMembershipId: "mem_avery",
      receiverMembershipId: "mem_leila",
      sourceType: "admin_manual",
      sourceId: "manual_testing",
      introPurpose: "general connection",
      note: "Making a manual intro for a likely mentor relationship.",
      status: "pending",
      suggestedFirstMessage: "Excited to compare notes.",
    });
    const store = getStore();
    store.memberships.push({
      ...store.memberships[0],
      id: "mem_other_org",
      orgId: "org_other",
    });
    store.profiles.push({
      ...store.profiles[0],
      id: "pro_other_org",
      membershipId: "mem_other_org",
    });

    const memberships = await listMembershipsForOrg("org_wavespark");
    const orgProfiles = await listProfilesForOrg("org_wavespark");
    const profiles = orgProfiles
      .map((profile) => {
        const membership = memberships.find((candidate) => candidate.id === profile.membershipId);
        return membership ? toFullAdminProfile(profile, membership) : null;
      })
      .filter(Boolean);

    const csv = fullProfilesToCsv(profiles as NonNullable<(typeof profiles)[number]>[]);
    const analytics = await getAnalyticsSnapshot("org_wavespark");
    const publicStats = await getPublicOrgStats("org_wavespark");
    const overview = await getAdminOverviewData("org_wavespark");
    const updatedOrg = await updateOrganizationSettings("org_wavespark", {
      logoUrl: "https://cdn.wavesparks.co/logo.png",
    });
    const recentPosts = await listPostsForOrg("org_wavespark", { limit: 4 });
    const recentRequests = await listIntroRequestsForOrg("org_wavespark", { limit: 4 });
    const pendingRequests = await listIntroRequestsForOrg("org_wavespark", {
      limit: 8,
      status: "pending",
    });
    const manualRequests = await listIntroRequestsForOrg("org_wavespark", {
      limit: 8,
      sourceType: "admin_manual",
    });
    const recentRequestParticipants = await listMembershipRecordsByIds(
      recentRequests.flatMap((request) => [
        request.requesterMembershipId,
        request.receiverMembershipId,
      ]),
      { orgId: "org_wavespark" },
    );
    const recentRequestParticipantIds = new Set(
      recentRequestParticipants.map((record) => record.membership.id),
    );
    const requestDashboard = await getAdminIntroRequestDashboard("org_wavespark", {
      candidateLimit: 1,
      requestLimit: 4,
      spaceId: mainSpace.id,
    });
    const pendingRequestDashboard = await getAdminIntroRequestDashboard("org_wavespark", {
      requestLimit: 8,
      requestStatus: "pending",
      spaceId: mainSpace.id,
    });
    const manualRequestDashboard = await getAdminIntroRequestDashboard("org_wavespark", {
      requestLimit: 8,
      sourceType: "admin_manual",
      spaceId: mainSpace.id,
    });

    expect(csv).toContain("Display Name");
    expect(orgProfiles.map((profile) => profile.id)).not.toContain("pro_other_org");
    expect(updatedOrg?.logoUrl).toBe("https://cdn.wavesparks.co/logo.png");
    expect(analytics.introRequestsSent).toBeGreaterThan(0);
    expect(publicStats).toMatchObject({
      approvedMembers: analytics.approvedMembers,
      introRequestsAccepted: analytics.introRequestsAccepted,
    });
    expect(overview.analytics).toMatchObject({
      approvedMembers: analytics.approvedMembers,
      completedProfiles: analytics.completedProfiles,
      introRequestsAccepted: analytics.introRequestsAccepted,
      introRequestsSent: analytics.introRequestsSent,
    });
    expect(overview.recentPosts.map((post) => post.id)).toEqual(
      recentPosts.map((post) => post.id),
    );
    expect(overview.recentRequests.map((request) => request.id)).toEqual(
      recentRequests.map((request) => request.id),
    );
    expect(requestDashboard.manualIntroCandidates).toHaveLength(1);
    expect(
      requestDashboard.requests.every((request) => request.spaceId === mainSpace.id),
    ).toBe(true);
    expect(requestDashboard.requests.map((request) => request.id)).toEqual(
      recentRequests.map((request) => request.id),
    );
    expect(pendingRequests.length).toBeGreaterThan(0);
    expect(pendingRequests.every((request) => request.status === "pending")).toBe(true);
    expect(manualRequests.length).toBeGreaterThan(0);
    expect(manualRequests.every((request) => request.sourceType === "admin_manual")).toBe(true);
    expect(pendingRequestDashboard.requests.length).toBeGreaterThan(0);
    expect(
      pendingRequestDashboard.requests.every((request) => request.status === "pending"),
    ).toBe(true);
    expect(manualRequestDashboard.requests.map((request) => request.id)).toEqual(
      manualRequests.map((request) => request.id),
    );
    expect(
      requestDashboard.requests.every(
        (request) =>
          request.requesterName !== "Unknown" && request.receiverName !== "Unknown",
      ),
    ).toBe(true);
    expect(
      recentRequests.every(
        (request) =>
          recentRequestParticipantIds.has(request.requesterMembershipId) &&
          recentRequestParticipantIds.has(request.receiverMembershipId),
      ),
    ).toBe(true);
    expect(recentRequestParticipants.every((record) => record.user)).toBe(true);
    await expect(getMembershipById("mem_avery")).resolves.toMatchObject({ role: "org_admin" });
  });
});

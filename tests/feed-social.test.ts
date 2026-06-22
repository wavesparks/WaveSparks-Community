import { beforeEach, describe, expect, it } from "vitest";

import { activeFeedFilterCount, parseFeedFilters } from "@/lib/feed-filters";
import { opportunitySourceForPost } from "@/lib/opportunities";
import { profileFromFormData } from "@/lib/profile-form";
import {
  createComment,
  createIntroRequest,
  createPost,
  followMembership,
  getMembershipById,
  getOrganizationBySlug,
  getPostThreadRecord,
  getStore,
  getProfileById,
  getProfileByMembershipId,
  getUserById,
  listActiveIntroRequestStatusesForRequester,
  listFollowedMembershipIdsForMembership,
  listFollowsForMembership,
  listMembershipProfileRecordsByIds,
  listMatchesForProfile,
  listMatchesForMembership,
  listPostsForOrg,
  listProfileMembershipRecordsByIds,
  listProfileLinksByProfileIds,
  listProfileRecordsByIds,
  listSavedPostIdsForMembership,
  listVisibleCommentCountsForOrg,
  listVisibleMatchTargetMembershipIdsForMembership,
  listVisibleMatchTargetMembershipIdsForProfile,
  resetStore,
  savePostForMembership,
  unfollowMembership,
  unsavePostForMembership,
  updateCommentStatus,
} from "@/server/store";
import {
  getFeedViewsForOrg,
  getKnowledgePostViewsForOrg,
  getMatchCardViewsForProfile,
  getMatchViews,
  getMemberDirectoryProfileView,
  getMemberDirectoryViewsForOrg,
  getPostThreadIntroContext,
} from "@/server/view-models";
import type { OpportunitySource, PostType } from "@/lib/domain";

async function addPost(input: {
  authorMembershipId: string;
  title: string;
  type?: PostType;
  tags?: string[];
  relatedRolesNeeded?: string[];
  opportunitySource?: OpportunitySource;
  hidden?: boolean;
}) {
  return createPost({
    orgId: "org_wavespark",
    authorMembershipId: input.authorMembershipId,
    type: input.type ?? "general_update",
    opportunitySource: input.opportunitySource,
    title: input.title,
    body: "Test body for feed behavior.",
    tags: input.tags ?? [],
    relatedStartupName: "",
    relatedRolesNeeded: input.relatedRolesNeeded ?? [],
    visibility: "org_only",
    status: "active",
    featured: false,
    hidden: input.hidden ?? false,
    commentsLocked: false,
  });
}

describe("feed filters and social recommendations", () => {
  beforeEach(() => {
    resetStore();
  });

  it("keeps follows private to the follower and supports unfollow", async () => {
    const org = (await getOrganizationBySlug("wavespark"))!;

    await expect(followMembership(org.id, "mem_jules", "mem_jules")).resolves.toBeNull();

    const follow = (await followMembership(org.id, "mem_jules", "mem_kai"))!;
    const duplicate = (await followMembership(org.id, "mem_jules", "mem_kai"))!;

    expect(duplicate.id).toBe(follow.id);
    expect(await listFollowsForMembership("mem_jules")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ followedMembershipId: "mem_kai" }),
      ]),
    );
    await expect(
      listFollowedMembershipIdsForMembership("mem_jules", {
        followedMembershipIds: ["mem_kai", "mem_marcus"],
      }),
    ).resolves.toEqual(expect.arrayContaining(["mem_kai", "mem_marcus"]));
    await expect(
      listFollowedMembershipIdsForMembership("mem_jules", {
        followedMembershipIds: ["mem_kai"],
      }),
    ).resolves.toEqual(["mem_kai"]);
    await expect(
      listFollowedMembershipIdsForMembership("mem_jules", {
        followedMembershipIds: [],
      }),
    ).resolves.toEqual([]);
    expect(await listFollowsForMembership("mem_kai")).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ followedMembershipId: "mem_jules" }),
      ]),
    );
    await expect(unfollowMembership("mem_jules", "mem_kai")).resolves.toBe(true);
    await expect(unfollowMembership("mem_jules", "mem_kai")).resolves.toBe(false);
  });

  it("backfills follows when a hot-reloaded dev store lacks the new collection", async () => {
    const store = getStore();
    delete (store as Partial<typeof store>).follows;

    expect(await listFollowsForMembership("mem_jules")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ followedMembershipId: "mem_marcus" }),
      ]),
    );
  });

  it("recommends posts from followed and matched members with reason labels", async () => {
    const org = (await getOrganizationBySlug("wavespark"))!;
    const followedPost = await addPost({
      authorMembershipId: "mem_marcus",
      title: "Followed member recommendation marker",
    });
    const match = (await listMatchesForMembership("mem_jules"))[0];
    const matchedMembershipId = (await getProfileById(match.targetProfileId))!.membershipId;
    const matchedPost = await addPost({
      authorMembershipId: matchedMembershipId,
      title: "Matched member recommendation marker",
    });

    const followedView = (await getFeedViewsForOrg(org, {
      viewerMembershipId: "mem_jules",
      filters: { q: followedPost.title, recommendedOnly: true },
    }))[0];
    const matchedView = (await getFeedViewsForOrg(org, {
      viewerMembershipId: "mem_jules",
      filters: { q: matchedPost.title, recommendedOnly: true },
    }))[0];

    expect(followedView.recommendationReasons).toContain("Followed");
    expect(matchedView.recommendationReasons).toContain("Matched");
  });

  it("tracks saved posts once and exposes saved state in feed views", async () => {
    const org = (await getOrganizationBySlug("wavespark"))!;
    const firstSave = await savePostForMembership(org.id, "mem_jules", "pst_8");
    const duplicateSave = await savePostForMembership(org.id, "mem_jules", "pst_8");
    const savedPosts = await listSavedPostIdsForMembership("mem_jules", {
      postIds: ["pst_8"],
    });
    const [feedView] = await getFeedViewsForOrg(org, {
      viewerMembershipId: "mem_jules",
      filters: { q: "full people directory" },
    });

    expect(duplicateSave?.id).toBe(firstSave?.id);
    expect(savedPosts.get("pst_8")?.id).toBe(firstSave?.id);
    expect(feedView.id).toBe("pst_8");
    expect(feedView.isSaved).toBe(true);
    await expect(unsavePostForMembership("mem_jules", "pst_8")).resolves.toBe(true);
    await expect(unsavePostForMembership("mem_jules", "pst_8")).resolves.toBe(false);
    await expect(
      listSavedPostIdsForMembership("mem_jules", { postIds: ["pst_8"] }),
    ).resolves.toEqual(new Map());
  });

  it("builds a limited searchable people directory without contact fields", async () => {
    const org = (await getOrganizationBySlug("wavespark"))!;
    const hiddenProfile = (await getProfileByMembershipId("mem_marcus"))!;
    hiddenProfile.profileVisibleInMatching = false;

    const climateProfiles = await getMemberDirectoryViewsForOrg(org, {
      viewerMembershipId: "mem_jules",
      filters: { q: "climate" },
      limit: 20,
    });
    const mentorProfiles = await getMemberDirectoryViewsForOrg(org, {
      viewerMembershipId: "mem_jules",
      filters: { affiliation: "mentor" },
      limit: 20,
    });

    expect(climateProfiles.length).toBeGreaterThan(0);
    expect(climateProfiles.some((profile) => profile.membershipId === "mem_marcus")).toBe(false);
    expect(climateProfiles.every((profile) => !("emailForIntro" in profile))).toBe(true);
    expect(climateProfiles.every((profile) => !("whatsappNumber" in profile))).toBe(true);
    expect(mentorProfiles.every((profile) => profile.affiliationLabel === "mentor")).toBe(true);

    const profileLinksById = await listProfileLinksByProfileIds([
      "pro_jules",
      "pro_jules",
      "pro_rhea",
    ]);
    expect(profileLinksById.get("pro_jules")?.map((link) => link.id)).toEqual([
      "lnk_jules_linkedin",
      "lnk_jules_website",
    ]);
    expect(profileLinksById.get("pro_rhea")?.map((link) => link.id)).toEqual([
      "lnk_rhea_github",
    ]);
    await expect(listProfileLinksByProfileIds([])).resolves.toEqual(new Map());
  });

  it("loads safe member profile detail with follow and profile-intro state", async () => {
    const org = (await getOrganizationBySlug("wavespark"))!;
    const targetProfile = (await getProfileByMembershipId("mem_kai"))!;

    await followMembership(org.id, "mem_jules", "mem_kai");
    await createIntroRequest({
      orgId: org.id,
      requesterMembershipId: "mem_jules",
      receiverMembershipId: "mem_kai",
      sourceType: "profile",
      sourceId: targetProfile.id,
      introPurpose: "profile discovery",
      note: "Testing profile intro source.",
      status: "pending",
      suggestedFirstMessage: "A short first message.",
    });

    const detail = await getMemberDirectoryProfileView({
      orgId: org.id,
      membershipId: "mem_kai",
      viewerMembershipId: "mem_jules",
    });

    expect(detail).toMatchObject({
      membershipId: "mem_kai",
      isFollowing: true,
      introStatus: "pending",
    });
    expect(detail && "emailForIntro" in detail).toBe(false);
    expect(detail?.profileLinks.every((link) => Boolean(link.url))).toBe(true);
  });

  it("builds knowledge views from resources, featured threads, active discussions, and saved posts", async () => {
    const org = (await getOrganizationBySlug("wavespark"))!;
    await savePostForMembership(org.id, "mem_jules", "pst_8");

    const library = await getKnowledgePostViewsForOrg(org, {
      viewerMembershipId: "mem_jules",
    });
    const saved = await getKnowledgePostViewsForOrg(org, {
      viewerMembershipId: "mem_jules",
      mode: "saved",
    });

    expect(library.map((post) => post.id)).toContain("pst_4");
    expect(library.map((post) => post.id)).toContain("pst_8");
    expect(
      library.find((post) => post.id === "pst_4")?.knowledgeReason,
    ).toBe("resource");
    expect(saved.map((post) => post.id)).toEqual(
      expect.arrayContaining(["pst_3", "pst_8", "pst_16"]),
    );
    expect(saved.every((post) => post.isSaved)).toBe(true);
  });

  it("can skip matched recommendation signals while preserving follow state", async () => {
    const org = (await getOrganizationBySlug("wavespark"))!;
    const followedPost = await addPost({
      authorMembershipId: "mem_marcus",
      title: "Followed member lightweight opportunity marker",
    });
    const match = (await listMatchesForMembership("mem_jules"))[0];
    const matchedMembershipId = (await getProfileById(match.targetProfileId))!.membershipId;
    const matchedPost = await addPost({
      authorMembershipId: matchedMembershipId,
      title: "Matched member lightweight opportunity marker",
    });

    const followedView = (await getFeedViewsForOrg(org, {
      viewerMembershipId: "mem_jules",
      filters: { q: followedPost.title },
      includeMatchedRecommendationSignals: false,
    }))[0];
    const matchedView = (await getFeedViewsForOrg(org, {
      viewerMembershipId: "mem_jules",
      filters: { q: matchedPost.title },
      includeMatchedRecommendationSignals: false,
    }))[0];

    expect(followedView.isFollowingAuthor).toBe(true);
    expect(followedView.recommendationReasons).toContain("Followed");
    expect(matchedView.recommendationReasons).not.toContain("Matched");
  });

  it("builds public feed views without personalized state", async () => {
    const org = (await getOrganizationBySlug("wavespark"))!;
    const publicPost = await addPost({
      authorMembershipId: "mem_marcus",
      title: "Public feed fast path marker",
    });
    await createComment(
      {
        postId: publicPost.id,
        authorMembershipId: "mem_kai",
        body: "Visible public comment.",
      },
      { orgId: org.id },
    );
    await createComment(
      {
        postId: publicPost.id,
        authorMembershipId: "mem_leila",
        body: "Removed public comment.",
      },
      { orgId: org.id },
    ).then((comment) => updateCommentStatus(comment.id, "removed"));

    const [publicView] = await getFeedViewsForOrg(org, {
      filters: { q: publicPost.title },
      includeMatchedRecommendationSignals: false,
    });

    expect(publicView).toMatchObject({
      id: publicPost.id,
      commentCount: 1,
      isFollowingAuthor: false,
      isSaved: false,
      isRecommended: false,
      recommendationReasons: [],
    });
    expect(publicView.author.membershipId).toBe("mem_marcus");
  });

  it("lists visible matches directly by profile id without changing results", async () => {
    const profile = (await getProfileByMembershipId("mem_jules"))!;
    const byMembership = await listMatchesForMembership("mem_jules");
    const byProfile = await listMatchesForProfile(profile.id);
    const targetRecords = await listProfileRecordsByIds(
      [byProfile[0].targetProfileId, byProfile[0].targetProfileId],
      { orgId: "org_wavespark" },
    );
    const lightweightTargetRecords = await listProfileMembershipRecordsByIds(
      [byProfile[0].targetProfileId, byProfile[0].targetProfileId],
      { orgId: "org_wavespark" },
    );
    const lightweightAuthorRecords = await listMembershipProfileRecordsByIds(
      ["mem_jules", "mem_jules"],
      { orgId: "org_wavespark" },
    );
    const matchedMembershipIdsByProfile =
      await listVisibleMatchTargetMembershipIdsForProfile(profile.id);
    const matchedMembershipIdsByMembership =
      await listVisibleMatchTargetMembershipIdsForMembership("mem_jules");
    const matchViews = await getMatchViews("mem_jules", byProfile, "org_wavespark");
    const followedIds = new Set(
      (await listFollowsForMembership("mem_jules")).map(
        (follow) => follow.followedMembershipId,
      ),
    );
    const expectedTargetMembershipIds = byProfile.map(
      (match) => getStore().profiles.find(
        (candidate) => candidate.id === match.targetProfileId,
      )?.membershipId,
    );
    const targetWithoutIntro = byProfile.find((match) => {
      const targetMembershipId = getStore().profiles.find(
        (candidate) => candidate.id === match.targetProfileId,
      )?.membershipId;

      return (
        targetMembershipId &&
        !getStore().introRequests.some(
          (request) =>
            request.requesterMembershipId === "mem_jules" &&
            request.receiverMembershipId === targetMembershipId &&
            request.status !== "expired",
        )
      );
    })!;
    const targetMembershipIdForIntro = getStore().profiles.find(
      (candidate) => candidate.id === targetWithoutIntro.targetProfileId,
    )!.membershipId;
    await createIntroRequest({
      orgId: "org_wavespark",
      requesterMembershipId: "mem_jules",
      receiverMembershipId: targetMembershipIdForIntro,
      sourceType: "match",
      sourceId: targetWithoutIntro.id,
      introPurpose: "co-founder conversation",
      note: "Testing match card intro status.",
      status: "pending",
      suggestedFirstMessage: "Would love to compare notes.",
    });
    const matchCards = await getMatchCardViewsForProfile(profile.id, "mem_jules");
    const introStatuses = await listActiveIntroRequestStatusesForRequester("mem_jules", [
      targetMembershipIdForIntro,
    ]);
    const allIntroStatuses = await listActiveIntroRequestStatusesForRequester("mem_jules");

    expect(byProfile.map((match) => match.id)).toEqual(
      byMembership.map((match) => match.id),
    );
    expect(targetRecords).toHaveLength(1);
    expect(lightweightTargetRecords).toHaveLength(1);
    expect(lightweightTargetRecords.every((record) => record.user === undefined)).toBe(true);
    expect(lightweightAuthorRecords).toHaveLength(1);
    expect(lightweightAuthorRecords.every((record) => record.user === undefined)).toBe(true);
    expect(matchedMembershipIdsByProfile).toEqual(expectedTargetMembershipIds);
    expect(matchedMembershipIdsByMembership).toEqual(expectedTargetMembershipIds);
    expect(matchViews.map((match) => match.id)).toEqual(
      byProfile.map((match) => match.id),
    );
    expect(matchCards.map(({ match }) => match.id)).toEqual(
      byProfile.map((match) => match.id),
    );
    expect(
      matchCards.every(
        ({ following, match }) => following === followedIds.has(match.target.membershipId),
      ),
    ).toBe(true);
    expect(introStatuses.get(targetMembershipIdForIntro)).toBe("pending");
    expect(allIntroStatuses.get(targetMembershipIdForIntro)).toBe("pending");
    expect(
      matchCards.find(
        ({ match }) => match.target.membershipId === targetMembershipIdForIntro,
      )?.introStatus,
    ).toBe("pending");
    await expect(
      listProfileRecordsByIds([byProfile[0].targetProfileId], { orgId: "org_missing" }),
    ).resolves.toEqual([]);
  });

  it("loads a post thread with author and visible comment profiles", async () => {
    const comment = await createComment(
      {
        postId: "pst_1",
        authorMembershipId: "mem_kai",
        body: "Thread reader coverage comment.",
      },
      { orgId: "org_wavespark" },
    );
    await createComment(
      {
        postId: "pst_1",
        authorMembershipId: "mem_marcus",
        body: "Hidden comments should stay out of thread view.",
      },
      { orgId: "org_wavespark" },
    ).then((hiddenComment) => updateCommentStatus(hiddenComment.id, "removed"));
    await createIntroRequest({
      orgId: "org_wavespark",
      requesterMembershipId: "mem_jules",
      receiverMembershipId: "mem_leila",
      sourceType: "post",
      sourceId: "pst_1",
      introPurpose: "general connection",
      note: "Testing post detail intro context.",
      status: "pending",
      suggestedFirstMessage: "Would love to compare notes.",
    });

    const thread = await getPostThreadRecord("pst_1", "org_wavespark");
    const context = await getPostThreadIntroContext({
      postId: "pst_1",
      orgId: "org_wavespark",
      viewerMembershipId: "mem_jules",
    });

    expect(thread?.post.id).toBe("pst_1");
    expect(context.thread?.post.id).toBe("pst_1");
    expect(context.existingIntroStatus).toBe("pending");
    expect(thread?.author?.membership.id).toBe("mem_leila");
    expect(thread?.author?.profile).toBeTruthy();
    expect(thread?.comments.map((record) => record.comment.id)).toContain(comment.id);
    expect(
      thread?.comments.every((record) => record.membership && record.profile),
    ).toBe(true);
    await expect(getPostThreadRecord("pst_1", "org_missing")).resolves.toBeUndefined();
  });

  it("filters feed posts by structured fields", async () => {
    const org = (await getOrganizationBySlug("wavespark"))!;
    const posts = await getFeedViewsForOrg(org, {
      viewerMembershipId: "mem_jules",
      filters: {
        postType: "opportunity",
        tag: "AI",
        roleNeeded: "design",
        authorStage: "MVP",
        authorIndustry: "AI",
      },
    });

    expect(posts.map((post) => post.id)).toEqual(["pst_14"]);
  });

  it("segments opportunities by explicit source layer", async () => {
    const org = (await getOrganizationBySlug("wavespark"))!;

    const official = await getFeedViewsForOrg(org, {
      onlyOpportunities: true,
      filters: { opportunitySource: "official" },
    });
    const mentor = await getFeedViewsForOrg(org, {
      onlyOpportunities: true,
      filters: { opportunitySource: "mentor" },
    });

    expect(official.map((post) => post.id)).toContain("pst_21");
    expect(official.every((post) => post.opportunitySource === "official")).toBe(true);
    expect(mentor.every((post) => post.opportunitySource === "mentor")).toBe(true);
  });

  it("pushes visibility and opportunity filters into post listing", async () => {
    const org = (await getOrganizationBySlug("wavespark"))!;
    const hiddenPost = await addPost({
      authorMembershipId: "mem_marcus",
      title: "Hidden post should stay out of feed",
      hidden: true,
    });
    const visibleOpportunity = await addPost({
      authorMembershipId: "mem_marcus",
      title: "Visible opportunity listing marker",
      type: "opportunity",
      opportunitySource: "member",
    });

    const visiblePosts = await listPostsForOrg(org.id, { hidden: false });
    const opportunityTypes: PostType[] = [
      "opportunity",
      "looking_for_cofounder",
      "looking_for_mentor",
    ];
    const opportunities = await listPostsForOrg(org.id, {
      hidden: false,
      types: opportunityTypes,
      opportunitySources: ["member"],
    });
    const feedViews = await getFeedViewsForOrg(org, {
      filters: { q: "Hidden post should stay out of feed" },
    });

    expect(visiblePosts.map((post) => post.id)).not.toContain(hiddenPost.id);
    expect(opportunities.map((post) => post.id)).toContain(visibleOpportunity.id);
    expect(opportunities.every((post) => !post.hidden)).toBe(true);
    expect(opportunities.every((post) => opportunityTypes.includes(post.type))).toBe(true);
    expect(opportunities.every((post) => post.opportunitySource === "member")).toBe(true);
    expect(feedViews).toEqual([]);
  });

  it("limits default feed listings without truncating explicit search results", async () => {
    const org = (await getOrganizationBySlug("wavespark"))!;
    const target = await addPost({
      authorMembershipId: "mem_marcus",
      title: "Deep search result marker",
    });

    for (let index = 0; index < 5; index += 1) {
      await addPost({
        authorMembershipId: "mem_kai",
        title: `Recent filler post ${index}`,
      });
    }

    const limitedDefault = await getFeedViewsForOrg(org, { limit: 2 });
    const searchResults = await getFeedViewsForOrg(org, {
      filters: { q: target.title },
      limit: 1,
    });

    expect(limitedDefault).toHaveLength(2);
    expect(searchResults.map((post) => post.id)).toContain(target.id);
  });

  it("counts only visible comments in feed views", async () => {
    const org = (await getOrganizationBySlug("wavespark"))!;
    const post = await addPost({
      authorMembershipId: "mem_marcus",
      title: "Visible comment count marker",
    });
    await createComment({
      postId: post.id,
      authorMembershipId: "mem_jules",
      body: "This should count.",
    });
    const removed = await createComment({
      postId: post.id,
      authorMembershipId: "mem_kai",
      body: "This should not count.",
    });
    await updateCommentStatus(removed.id, "removed");

    const [view] = await getFeedViewsForOrg(org, {
      filters: { q: post.title },
    });

    expect(view.commentCount).toBe(1);
  });

  it("scopes visible comment counts to the requested feed posts", async () => {
    const visiblePost = await addPost({
      authorMembershipId: "mem_marcus",
      title: "Scoped comment count visible post",
    });
    const outsidePost = await addPost({
      authorMembershipId: "mem_kai",
      title: "Scoped comment count outside post",
    });

    await createComment({
      postId: visiblePost.id,
      authorMembershipId: "mem_jules",
      body: "This scoped comment should count.",
    });
    await createComment({
      postId: outsidePost.id,
      authorMembershipId: "mem_jules",
      body: "This outside comment should not be loaded for the scoped count.",
    });

    const counts = await listVisibleCommentCountsForOrg("org_wavespark", {
      postIds: [visiblePost.id],
    });

    expect(counts.get(visiblePost.id)).toBe(1);
    expect(counts.has(outsidePost.id)).toBe(false);
    await expect(
      listVisibleCommentCountsForOrg("org_wavespark", { postIds: [] }),
    ).resolves.toEqual(new Map());
  });

  it("loads only thread author records needed for post detail rendering", async () => {
    const post = await addPost({
      authorMembershipId: "mem_marcus",
      title: "Thread author record marker",
    });
    await createComment({
      postId: post.id,
      authorMembershipId: "mem_jules",
      body: "This comment author should be loaded.",
    });
    await createComment({
      postId: post.id,
      authorMembershipId: "mem_jules",
      body: "Duplicate author should not duplicate records.",
    });

    const records = await listMembershipProfileRecordsByIds(
      [post.authorMembershipId, "mem_jules", "mem_jules"],
      { orgId: "org_wavespark" },
    );

    expect(records.map((record) => record.membership.id).sort()).toEqual([
      "mem_jules",
      "mem_marcus",
    ]);
    expect(records.every((record) => record.user === undefined)).toBe(true);
  });

  it("enforces opportunity source defaults by membership role", async () => {
    const admin = (await getMembershipById("mem_avery"))!;
    const mentor = (await getMembershipById("mem_marcus"))!;
    const member = (await getMembershipById("mem_jules"))!;

    expect(opportunitySourceForPost("opportunity", admin, "official")).toBe("official");
    expect(opportunitySourceForPost("opportunity", mentor, "official")).toBe("mentor");
    expect(opportunitySourceForPost("opportunity", member, "official")).toBe("member");
    expect(opportunitySourceForPost("general_update", admin, "official")).toBeUndefined();
  });

  it("parses collapsed filter queries and active counts", () => {
    const filters = parseFeedFilters(
      {
        q: "mentor",
        tag: "AI",
        industry: "Climate",
        recommended: "true",
        source: "mentor",
      },
      { includeOpportunitySource: true, defaultOpportunitySource: "official" },
    );

    expect(filters.q).toBe("mentor");
    expect(filters.opportunitySource).toBe("mentor");
    expect(filters.recommendedOnly).toBe(true);
    expect(activeFeedFilterCount(filters, {
      includeOpportunitySource: true,
      defaultOpportunitySource: "official",
    })).toBe(4);
  });

  it("preserves portrait URL fallback from profile form data", async () => {
    const membership = (await getMembershipById("mem_jules"))!;
    const user = (await getUserById(membership.userId))!;
    const existingProfile = (await getProfileByMembershipId(membership.id))!;
    const formData = new FormData();
    formData.set("profile_photo", "https://example.com/portrait.png");

    const result = profileFromFormData({
      formData,
      membership,
      user,
      existingProfile,
    });

    expect(result.profile.profilePhoto).toBe("https://example.com/portrait.png");
  });
});

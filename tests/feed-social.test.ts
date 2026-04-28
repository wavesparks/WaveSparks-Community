import { beforeEach, describe, expect, it } from "vitest";

import { activeFeedFilterCount, parseFeedFilters } from "@/lib/feed-filters";
import { opportunitySourceForPost } from "@/lib/opportunities";
import { profileFromFormData } from "@/lib/profile-form";
import {
  createPost,
  followMembership,
  getMembershipById,
  getOrganizationBySlug,
  getStore,
  getProfileById,
  getProfileByMembershipId,
  getUserById,
  listFollowsForMembership,
  listMatchesForMembership,
  resetStore,
  unfollowMembership,
} from "@/server/store";
import { getFeedViewsForOrg } from "@/server/view-models";
import type { OpportunitySource, PostType } from "@/lib/domain";

async function addPost(input: {
  authorMembershipId: string;
  title: string;
  type?: PostType;
  tags?: string[];
  relatedRolesNeeded?: string[];
  opportunitySource?: OpportunitySource;
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
    hidden: false,
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

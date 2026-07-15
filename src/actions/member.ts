"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { nanoid } from "nanoid";

import { getViewerContextForAction } from "@/lib/auth";
import { getCommunityDisplayName } from "@/lib/community-copy";
import { requireSpaceAccessForAction } from "@/lib/space-auth";
import { buildNotification, enqueueNotificationEmail } from "@/server/notifications";
import { opportunitySourceForPost } from "@/lib/opportunities";
import {
  getPostCommentRevalidationPaths,
  getPostListPathForType,
  getPostListRevalidationPaths,
} from "@/lib/post-action-routing";
import { profileFromFormData, validateProfileFormData } from "@/lib/profile-form";
import { getProfileReadiness } from "@/lib/activation";
import { sanitizeMatchFeedbackReasons } from "@/lib/match-feedback";
import { parseTags } from "@/lib/utils";
import { absoluteAppUrl } from "@/lib/urls";
import {
  enqueueAnalyticsEvent,
  enqueueMembershipEmail,
  enqueueNotificationWrite,
} from "@/server/action-side-effects";
import { canAccessFeed } from "@/server/permissions";
import {
  createCommentInSpace,
  createIntroRequestInSpace,
  getIntroRequestByIdInSpace,
  createPostInSpace,
  followMembershipInSpace,
  getMembershipById,
  getPostByIdInSpace,
  getProfileByMembershipId,
  getSpaceIntent,
  getSpaceMembership,
  savePostForMembershipInSpace,
  listMatchTypeConfigsForOrg,
  listProfileLinks,
  listMatchesForProfile,
  listSpacesForOrg,
  listVisibleSpacesForMembership,
  getPendingIntroRequestBetweenMembershipsInOrg,
  markNotificationsReadForMembershipInSpace,
  markNotificationsReadForMembershipWithSpaceAccess,
  recomputeMatchesForProfile,
  recomputeMatchesForSpace,
  recordMatchFeedback,
  respondToIntroRequestInSpace,
  unsavePostForMembershipInSpace,
  unfollowMembershipInSpace,
  upsertProfile,
  upsertSpaceIntent,
} from "@/server/store";
import type {
  IntroSourceType,
  IntroStatus,
  MatchFeedbackValue,
  PostType,
  SpaceIntent,
} from "@/lib/domain";

async function requireMemberForAction(
  slug: string,
  expectedMembershipId?: string,
  options: { requireFeedAccess?: boolean } = {},
) {
  const viewer = await getViewerContextForAction(slug);

  if (!viewer) {
    throw new Error("Unauthorized.");
  }

  if (viewer.membership.accountStatus !== "connected") {
    throw new Error("Connected account required.");
  }

  if (expectedMembershipId && viewer.membership.id !== expectedMembershipId) {
    throw new Error("Unauthorized.");
  }

  if (
    options.requireFeedAccess &&
    !canAccessFeed(viewer.membership, viewer.profile)
  ) {
    throw new Error("Unauthorized.");
  }

  return {
    org: viewer.org,
    user: viewer.user,
    membership: viewer.membership,
    profile: viewer.profile,
  };
}

function safeReturnPath(slug: string, formData: FormData | undefined, fallback: string) {
  const raw = String(formData?.get("return_to") ?? "");
  if (!raw) {
    return fallback;
  }

  try {
    const url = new URL(raw, "https://wavespark.local");
    const orgRoot = `/org/${slug}`;
    if (
      url.origin !== "https://wavespark.local" ||
      (url.pathname !== orgRoot && !url.pathname.startsWith(`${orgRoot}/`))
    ) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

function spaceRoot(slug: string, spaceSlug: string) {
  return `/org/${slug}/s/${spaceSlug}`;
}

function safeSpaceReturnPath(
  slug: string,
  spaceSlug: string,
  formData: FormData | undefined,
  fallback: string,
) {
  const raw = String(formData?.get("return_to") ?? "");
  if (!raw) return fallback;
  try {
    const url = new URL(raw, "https://wavespark.local");
    const root = spaceRoot(slug, spaceSlug);
    if (
      url.origin !== "https://wavespark.local" ||
      (url.pathname !== root && !url.pathname.startsWith(`${root}/`))
    ) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

function withStatus(path: string, status: string) {
  const url = new URL(path, "https://wavespark.local");
  url.searchParams.set("status", status);
  return `${url.pathname}${url.search}${url.hash}`;
}

function enqueueProfileMatchRecompute(slug: string, orgId: string, profileId: string) {
  after(async () => {
    try {
      await recomputeMatchesForProfile(orgId, profileId);
      revalidatePath(`/org/${slug}/matches`);
    } catch (error) {
      console.error("[wavesparks] profile match recompute failed", profileId, error);
    }
  });
}

function enqueueSpaceMatchRecompute(slug: string, spaceId: string, spaceSlug: string) {
  after(async () => {
    try {
      await recomputeMatchesForSpace(spaceId);
      revalidatePath(`${spaceRoot(slug, spaceSlug)}/matches`);
    } catch (error) {
      console.error("[wavesparks] space match recompute failed", spaceId, error);
    }
  });
}

function revalidateSpaceDiscoveryPaths(slug: string, spaceSlug: string) {
  const root = spaceRoot(slug, spaceSlug);
  revalidatePath(`${root}/feed`);
  revalidatePath(`${root}/people`);
  revalidatePath(`${root}/opportunities`);
  revalidatePath(`${root}/knowledge`);
  revalidatePath(`${root}/matches`);
  revalidatePath(`${root}/requests`);
}

function revalidateSpacePostPaths(
  slug: string,
  spaceSlug: string,
  postId: string,
) {
  revalidateSpaceDiscoveryPaths(slug, spaceSlug);
  revalidatePath(`${spaceRoot(slug, spaceSlug)}/posts/${postId}`);
}

async function requireActiveTargetInSpace(
  spaceId: string,
  membershipId: string,
  orgId: string,
) {
  const [membership, spaceMembership] = await Promise.all([
    getMembershipById(membershipId),
    getSpaceMembership(spaceId, membershipId),
  ]);
  if (
    !membership ||
    membership.orgId !== orgId ||
    membership.accountStatus !== "connected" ||
    spaceMembership?.accessStatus !== "active"
  ) {
    throw new Error("This person is not an active member of this community or event.");
  }
  return membership;
}

async function requireLegacyMainSpace(orgId: string, membershipId: string) {
  const main = (await listSpacesForOrg(orgId)).find((space) => space.kind === "main");
  if (!main) throw new Error("Wavesparks Community is not configured.");
  const spaceMembership = await getSpaceMembership(main.id, membershipId);
  if (spaceMembership?.accessStatus !== "active") {
    throw new Error("Wavesparks Community access required.");
  }
  return main;
}

async function requireIntroSourceInSpace(input: {
  spaceId: string;
  sourceType: IntroSourceType;
  sourceId: string;
  requesterProfileId: string;
  receiverMembershipId: string;
  receiverProfileId: string;
}) {
  if (input.sourceType === "profile") {
    if (input.sourceId !== input.receiverProfileId) {
      throw new Error("Profile source does not belong to the selected member.");
    }
    return;
  }

  if (input.sourceType === "post") {
    const sourcePost = await getPostByIdInSpace(input.spaceId, input.sourceId);
    if (
      !sourcePost ||
      sourcePost.authorMembershipId !== input.receiverMembershipId
    ) {
      throw new Error(
        "This post does not belong to the selected member in this community or event.",
      );
    }
    return;
  }

  const matches = await listMatchesForProfile(input.requesterProfileId, {
    spaceId: input.spaceId,
    limit: 1000,
  });
  const sourceMatch = matches.find((match) => match.id === input.sourceId);
  if (
    !sourceMatch ||
    sourceMatch.spaceId !== input.spaceId ||
    sourceMatch.sourceProfileId !== input.requesterProfileId ||
    sourceMatch.targetProfileId !== input.receiverProfileId
  ) {
    throw new Error("This match does not belong to these members in this community or event.");
  }
}

function revalidateMemberDiscoveryPaths(slug: string) {
  revalidatePath(`/org/${slug}/feed`);
  revalidatePath(`/org/${slug}/opportunities`);
  revalidatePath(`/org/${slug}/matches`);
  revalidatePath(`/org/${slug}/profile`);
}

function revalidateMemberActivationPaths(slug: string) {
  revalidatePath(`/org/${slug}/feed`);
  revalidatePath(`/org/${slug}/profile`);
}

function revalidatePostSavePaths(
  slug: string,
  spaceSlug: string,
  postId: string,
  postType: PostType,
) {
  const legacyRoot = `/org/${slug}`;
  const canonicalRoot = spaceRoot(slug, spaceSlug);
  for (const path of getPostListRevalidationPaths(slug, postType)) {
    revalidatePath(path);
    revalidatePath(path.replace(legacyRoot, canonicalRoot));
  }
  revalidatePath(`/org/${slug}/knowledge`);
  revalidatePath(`/org/${slug}/posts/${postId}`);
  revalidatePath(`${canonicalRoot}/knowledge`);
  revalidatePath(`${canonicalRoot}/posts/${postId}`);
}

export async function saveOnboardingAction(slug: string, membershipId: string, formData: FormData) {
  const { membership, profile: existingProfile, user } = await requireMemberForAction(
    slug,
    membershipId,
  );
  const validation = validateProfileFormData(formData);
  if (!validation.isValid) {
    const fields = validation.errors.map((error) => error.field).join(",");
    redirect(
      `/org/${slug}/onboarding?status=profile_invalid&fields=${encodeURIComponent(fields)}`,
    );
  }
  const [matchTypeConfigs, existingLinks] = await Promise.all([
    listMatchTypeConfigsForOrg(membership.orgId),
    existingProfile ? listProfileLinks(existingProfile.id) : Promise.resolve([]),
  ]);
  const result = profileFromFormData({
    formData,
    membership,
    user: {
      ...user,
      email: String(formData.get("email_for_intro") ?? user.email),
      name: String(formData.get("full_name") ?? user.name),
      imageUrl: String(formData.get("profile_photo") ?? user.imageUrl),
      updatedAt: new Date().toISOString(),
    },
    existingProfile,
    existingLinks,
    matchTypeConfigs,
  });

  await upsertProfile(result.profile, result.links, {
    orgId: membership.orgId,
    recomputeMatches: false,
  });
  enqueueProfileMatchRecompute(slug, membership.orgId, result.profile.id);
  revalidateMemberActivationPaths(slug);
  revalidatePath(`/org/${slug}/pending`);
  const readiness = getProfileReadiness(result.profile);
  const intent = String(formData.get("intent") ?? "complete");
  if (!readiness.isReady) {
    const firstMissingStep = Math.min(
      ...readiness.missingFields.map((field) => {
        if (["preferred_name", "headline", "bio"].includes(field.key)) return 0;
        if (["current_focus", "skill_tags"].includes(field.key)) return 1;
        if (field.key === "looking_for_types") return 2;
        return 3;
      }),
    );
    const missing = readiness.missingFields.map((field) => field.label).join(", ");
    redirect(
      `/org/${slug}/onboarding?status=${intent === "draft" ? "profile_draft_saved" : "profile_incomplete"}&step=${firstMissingStep}&missing=${encodeURIComponent(missing)}`,
    );
  }
  redirect(
    withStatus(
      safeReturnPath(slug, formData, `/org/${slug}/profile`),
      "profile_saved",
    ),
  );
}

function formList(formData: FormData, key: string) {
  return [
    ...new Set(
      formData
        .getAll(key)
        .flatMap((value) => parseTags(value))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export async function saveSpaceIntentAction(
  slug: string,
  spaceId: string,
  membershipId: string,
  formData: FormData,
) {
  const { viewer, space } = await requireSpaceAccessForAction({
    slug,
    spaceId,
    membershipId,
    requireProfile: true,
  });
  const existing = await getSpaceIntent(spaceId, viewer.membership.id);
  const currentGoal = String(formData.get("current_goal") ?? "").trim();
  const lookingFor = formList(formData, "looking_for");
  const offers = formList(formData, "offers");
  const matchingOptIn = formData
    .getAll("matching_opt_in")
    .map(String)
    .some((value) => ["1", "true", "yes", "on"].includes(value.toLowerCase()));
  const intentComplete = Boolean(currentGoal && (lookingFor.length || offers.length));
  const now = new Date().toISOString();
  const intent: SpaceIntent = {
    id: existing?.id ?? `intent_${spaceId}_${viewer.membership.id}`,
    orgId: viewer.org.id,
    spaceId,
    membershipId: viewer.membership.id,
    currentGoal,
    lookingFor,
    offers,
    matchingOptIn,
    intentComplete,
    seekingText: [
      currentGoal ? `Current goal: ${currentGoal}` : "",
      lookingFor.length ? `Looking for in this space: ${lookingFor.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    offeringText: offers.length
      ? `Can offer in this space: ${offers.join(", ")}`
      : "",
    embeddingStatus: "pending",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await upsertSpaceIntent(intent);
  enqueueSpaceMatchRecompute(slug, spaceId, space.slug);
  revalidatePath(`${spaceRoot(slug, space.slug)}/matches`);
  redirect(
    `${spaceRoot(slug, space.slug)}/matches?status=${
      intentComplete ? "space_intent_saved" : "space_intent_incomplete"
    }`,
  );
}

export async function saveMatchFeedbackInSpaceAction(
  slug: string,
  spaceId: string,
  membershipId: string,
  matchId: string,
  formData: FormData,
) {
  const { viewer, space } = await requireSpaceAccessForAction({
    slug,
    spaceId,
    membershipId,
    requireProfile: true,
  });
  if (!viewer.profile) throw new Error("A complete profile is required.");
  const rawValue = String(formData.get("value") ?? "");
  if (rawValue !== "helpful" && rawValue !== "not_relevant") {
    throw new Error("Invalid match feedback.");
  }
  const value: MatchFeedbackValue = rawValue;
  const reasons =
    value === "not_relevant"
      ? sanitizeMatchFeedbackReasons(formData.getAll("reason").map(String))
      : [];
  if (value === "not_relevant" && !reasons.length) {
    throw new Error("Select a reason for dismissing this match.");
  }
  const feedback = await recordMatchFeedback({
    orgId: viewer.org.id,
    spaceId,
    matchId,
    sourceProfileId: viewer.profile.id,
    value,
    reasons,
  });
  if (!feedback) throw new Error("Match not found in this community or event.");
  revalidatePath(`${spaceRoot(slug, space.slug)}/matches`);
  redirect(`${spaceRoot(slug, space.slug)}/matches?status=match_feedback_saved`);
}

export async function saveMatchFeedbackAction(
  slug: string,
  membershipId: string,
  matchId: string,
  formData: FormData,
) {
  const { org, profile } = await requireMemberForAction(slug, membershipId, {
    requireFeedAccess: true,
  });
  if (!profile) throw new Error("A complete profile is required.");
  const mainSpace = await requireLegacyMainSpace(org.id, membershipId);
  const rawValue = String(formData.get("value") ?? "");
  if (rawValue !== "helpful" && rawValue !== "not_relevant") {
    throw new Error("Invalid match feedback.");
  }
  const value: MatchFeedbackValue = rawValue;
  const reasons =
    value === "not_relevant"
      ? sanitizeMatchFeedbackReasons(formData.getAll("reason").map(String))
      : [];
  if (value === "not_relevant" && !reasons.length) {
    throw new Error("Select a reason for dismissing this match.");
  }
  const feedback = await recordMatchFeedback({
    orgId: org.id,
    spaceId: mainSpace.id,
    matchId,
    sourceProfileId: profile.id,
    value,
    reasons,
  });
  if (!feedback) throw new Error("Match not found.");
  revalidatePath(`/org/${slug}/matches`);
  redirect(`/org/${slug}/matches?status=match_feedback_saved`);
}

export async function createPostInSpaceAction(
  slug: string,
  spaceId: string,
  membershipId: string,
  formData: FormData,
) {
  const { viewer, space } = await requireSpaceAccessForAction({
    slug,
    spaceId,
    membershipId,
    requireProfile: true,
  });
  const type = String(formData.get("type") ?? "general_update") as PostType;
  const post = await createPostInSpace(
    {
      orgId: viewer.org.id,
      spaceId,
      authorMembershipId: viewer.membership.id,
      type,
      opportunitySource: opportunitySourceForPost(
        type,
        viewer.membership,
        formData.get("opportunity_source"),
      ),
      title: String(formData.get("title") ?? "").trim(),
      body: String(formData.get("body") ?? "").trim(),
      tags: parseTags(formData.get("tags")),
      relatedStartupName: String(formData.get("related_startup_name") ?? ""),
      relatedRolesNeeded: parseTags(formData.get("related_roles_needed")),
      status: "active",
      featured: false,
      hidden: false,
      commentsLocked: false,
    },
    { recordAnalytics: false },
  );
  enqueueAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: viewer.org.id,
    spaceId,
    membershipId: viewer.membership.id,
    eventName: "post_created",
    payload: { postId: post.id, type: post.type },
    createdAt: post.createdAt,
  });
  if (
    ["ask", "opportunity", "looking_for_cofounder", "looking_for_mentor"].includes(
      post.type,
    )
  ) {
    enqueueSpaceMatchRecompute(slug, spaceId, space.slug);
  }
  revalidateSpacePostPaths(slug, space.slug, post.id);
  const destination = [
    "opportunity",
    "looking_for_cofounder",
    "looking_for_mentor",
  ].includes(post.type)
    ? "opportunities"
    : post.type === "resource"
      ? "knowledge"
      : "feed";
  redirect(`${spaceRoot(slug, space.slug)}/${destination}?status=post_created`);
}

export async function createPostAction(slug: string, membershipId: string, formData: FormData) {
  const { org, membership } = await requireMemberForAction(slug, membershipId, {
    requireFeedAccess: true,
  });

  const mainSpace = await requireLegacyMainSpace(org.id, membership.id);
  const type = String(formData.get("type") ?? "general_update") as PostType;
  const post = await createPostInSpace(
    {
      orgId: org.id,
      spaceId: mainSpace.id,
      authorMembershipId: membershipId,
      type,
      opportunitySource: opportunitySourceForPost(
        type,
        membership,
        formData.get("opportunity_source"),
      ),
      title: String(formData.get("title") ?? ""),
      body: String(formData.get("body") ?? ""),
      tags: parseTags(formData.get("tags")),
      relatedStartupName: String(formData.get("related_startup_name") ?? ""),
      relatedRolesNeeded: parseTags(formData.get("related_roles_needed")),
      status: "active",
      featured: false,
      hidden: false,
      commentsLocked: false,
    },
    { recordAnalytics: false },
  );
  enqueueAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: org.id,
    spaceId: mainSpace.id,
    membershipId: membership.id,
    eventName: "post_created",
    payload: { postId: post.id, type: post.type },
    createdAt: post.createdAt,
  });
  if (
    ["ask", "opportunity", "looking_for_cofounder", "looking_for_mentor"].includes(
      post.type,
    )
  ) {
    enqueueSpaceMatchRecompute(slug, mainSpace.id, mainSpace.slug);
  }

  for (const path of getPostListRevalidationPaths(slug, post.type)) {
    revalidatePath(path);
  }
  revalidateSpacePostPaths(slug, mainSpace.slug, post.id);
  revalidatePath(`/org/${slug}/profile`);
  redirect(`${getPostListPathForType(slug, post.type)}?status=post_created`);
}

export async function followMembershipInSpaceAction(
  slug: string,
  spaceId: string,
  followerMembershipId: string,
  followedMembershipId: string,
  formData?: FormData,
) {
  const { viewer, space } = await requireSpaceAccessForAction({
    slug,
    spaceId,
    membershipId: followerMembershipId,
    requireProfile: true,
  });
  const followed = await requireActiveTargetInSpace(
    spaceId,
    followedMembershipId,
    viewer.org.id,
  );
  await followMembershipInSpace({
    orgId: viewer.org.id,
    spaceId,
    followerMembershipId: viewer.membership.id,
    followedMembershipId: followed.id,
  });
  revalidateSpaceDiscoveryPaths(slug, space.slug);
  redirect(
    withStatus(
      safeSpaceReturnPath(
        slug,
        space.slug,
        formData,
        `${spaceRoot(slug, space.slug)}/people`,
      ),
      "member_followed",
    ),
  );
}

export async function unfollowMembershipInSpaceAction(
  slug: string,
  spaceId: string,
  followerMembershipId: string,
  followedMembershipId: string,
  formData?: FormData,
) {
  const { viewer, space } = await requireSpaceAccessForAction({
    slug,
    spaceId,
    membershipId: followerMembershipId,
    requireProfile: true,
  });
  await requireActiveTargetInSpace(spaceId, followedMembershipId, viewer.org.id);
  await unfollowMembershipInSpace(
    spaceId,
    viewer.membership.id,
    followedMembershipId,
  );
  revalidateSpaceDiscoveryPaths(slug, space.slug);
  redirect(
    withStatus(
      safeSpaceReturnPath(
        slug,
        space.slug,
        formData,
        `${spaceRoot(slug, space.slug)}/people`,
      ),
      "member_unfollowed",
    ),
  );
}

export async function followMembershipAction(
  slug: string,
  followerMembershipId: string,
  followedMembershipId: string,
  formData?: FormData,
) {
  const { org, membership } = await requireMemberForAction(slug, followerMembershipId, {
    requireFeedAccess: true,
  });
  const mainSpace = await requireLegacyMainSpace(org.id, membership.id);
  const followedMembership = await requireActiveTargetInSpace(
    mainSpace.id,
    followedMembershipId,
    org.id,
  );
  await followMembershipInSpace({
    orgId: org.id,
    spaceId: mainSpace.id,
    followerMembershipId: membership.id,
    followedMembershipId: followedMembership.id,
  });
  revalidateMemberDiscoveryPaths(slug);
  redirect(
    withStatus(
      safeReturnPath(slug, formData, `/org/${slug}/matches`),
      "member_followed",
    ),
  );
}

export async function unfollowMembershipAction(
  slug: string,
  followerMembershipId: string,
  followedMembershipId: string,
  formData?: FormData,
) {
  const { org, membership } = await requireMemberForAction(slug, followerMembershipId, {
    requireFeedAccess: true,
  });
  const mainSpace = await requireLegacyMainSpace(org.id, membership.id);
  const followedMembership = await requireActiveTargetInSpace(
    mainSpace.id,
    followedMembershipId,
    org.id,
  );
  await unfollowMembershipInSpace(
    mainSpace.id,
    membership.id,
    followedMembership.id,
  );
  revalidateMemberDiscoveryPaths(slug);
  redirect(
    withStatus(
      safeReturnPath(slug, formData, `/org/${slug}/matches`),
      "member_unfollowed",
    ),
  );
}

export async function savePostInSpaceAction(
  slug: string,
  spaceId: string,
  membershipId: string,
  postId: string,
  formData?: FormData,
) {
  const { viewer, space } = await requireSpaceAccessForAction({
    slug,
    spaceId,
    membershipId,
    requireProfile: true,
  });
  const post = await getPostByIdInSpace(spaceId, postId);
  if (!post || post.orgId !== viewer.org.id || post.hidden) {
    throw new Error("Post not found in this community or event.");
  }
  await savePostForMembershipInSpace(
    viewer.org.id,
    spaceId,
    viewer.membership.id,
    post.id,
  );
  revalidateSpacePostPaths(slug, space.slug, post.id);
  redirect(
    withStatus(
      safeSpaceReturnPath(
        slug,
        space.slug,
        formData,
        `${spaceRoot(slug, space.slug)}/posts/${post.id}`,
      ),
      "post_saved",
    ),
  );
}

export async function unsavePostInSpaceAction(
  slug: string,
  spaceId: string,
  membershipId: string,
  postId: string,
  formData?: FormData,
) {
  const { viewer, space } = await requireSpaceAccessForAction({
    slug,
    spaceId,
    membershipId,
    requireProfile: true,
  });
  const post = await getPostByIdInSpace(spaceId, postId);
  if (!post || post.orgId !== viewer.org.id || post.hidden) {
    throw new Error("Post not found in this community or event.");
  }
  await unsavePostForMembershipInSpace(spaceId, viewer.membership.id, post.id);
  revalidateSpacePostPaths(slug, space.slug, post.id);
  redirect(
    withStatus(
      safeSpaceReturnPath(
        slug,
        space.slug,
        formData,
        `${spaceRoot(slug, space.slug)}/posts/${post.id}`,
      ),
      "post_unsaved",
    ),
  );
}

export async function savePostAction(
  slug: string,
  membershipId: string,
  postId: string,
  formData?: FormData,
) {
  const { org, membership } = await requireMemberForAction(slug, membershipId, {
    requireFeedAccess: true,
  });
  const mainSpace = await requireLegacyMainSpace(org.id, membership.id);
  const post = await getPostByIdInSpace(mainSpace.id, postId);
  if (!post || post.orgId !== org.id || post.hidden) {
    throw new Error("Unauthorized.");
  }

  await savePostForMembershipInSpace(
    org.id,
    mainSpace.id,
    membership.id,
    post.id,
  );
  revalidatePostSavePaths(slug, mainSpace.slug, post.id, post.type);
  redirect(
    withStatus(
      safeReturnPath(slug, formData, `/org/${slug}/posts/${post.id}`),
      "post_saved",
    ),
  );
}

export async function unsavePostAction(
  slug: string,
  membershipId: string,
  postId: string,
  formData?: FormData,
) {
  const { org, membership } = await requireMemberForAction(slug, membershipId, {
    requireFeedAccess: true,
  });
  const mainSpace = await requireLegacyMainSpace(org.id, membership.id);
  const post = await getPostByIdInSpace(mainSpace.id, postId);
  if (!post || post.orgId !== org.id || post.hidden) {
    throw new Error("Unauthorized.");
  }

  await unsavePostForMembershipInSpace(mainSpace.id, membership.id, post.id);
  revalidatePostSavePaths(slug, mainSpace.slug, post.id, post.type);
  redirect(
    withStatus(
      safeReturnPath(slug, formData, `/org/${slug}/posts/${post.id}`),
      "post_unsaved",
    ),
  );
}

export async function addCommentInSpaceAction(
  slug: string,
  spaceId: string,
  membershipId: string,
  postId: string,
  formData: FormData,
) {
  const { viewer, space } = await requireSpaceAccessForAction({
    slug,
    spaceId,
    membershipId,
    requireProfile: true,
  });
  const post = await getPostByIdInSpace(spaceId, postId);
  if (
    !post ||
    post.orgId !== viewer.org.id ||
    post.hidden ||
    post.commentsLocked ||
    post.status !== "active"
  ) {
    throw new Error("Comments are not available for this post.");
  }
  const comment = await createCommentInSpace(
    spaceId,
    {
      postId,
      authorMembershipId: viewer.membership.id,
      body: String(formData.get("body") ?? "").trim(),
    },
    { recordAnalytics: false },
  );
  enqueueAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: viewer.org.id,
    spaceId,
    membershipId: viewer.membership.id,
    eventName: "comment_created",
    payload: { postId: comment.postId },
    createdAt: comment.createdAt,
  });
  revalidateSpacePostPaths(slug, space.slug, post.id);
  redirect(`${spaceRoot(slug, space.slug)}/posts/${postId}?status=comment_added`);
}

export async function addCommentAction(slug: string, membershipId: string, postId: string, formData: FormData) {
  const { org, membership } = await requireMemberForAction(slug, membershipId, {
    requireFeedAccess: true,
  });
  const mainSpace = await requireLegacyMainSpace(org.id, membership.id);
  const post = await getPostByIdInSpace(mainSpace.id, postId);
  if (
    !post ||
    post.orgId !== org.id ||
    post.hidden ||
    post.commentsLocked ||
    post.status !== "active"
  ) {
    throw new Error("Unauthorized.");
  }

  const comment = await createCommentInSpace(
    mainSpace.id,
    {
      postId,
      authorMembershipId: membership.id,
      body: String(formData.get("body") ?? ""),
    },
    { recordAnalytics: false },
  );
  enqueueAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: org.id,
    spaceId: mainSpace.id,
    membershipId: membership.id,
    eventName: "comment_created",
    payload: { postId: comment.postId },
    createdAt: comment.createdAt,
  });

  for (const path of getPostCommentRevalidationPaths(slug, postId, post.type)) {
    revalidatePath(path);
  }
  revalidateSpacePostPaths(slug, mainSpace.slug, post.id);
  redirect(`/org/${slug}/posts/${postId}?status=comment_added`);
}

export async function requestIntroInSpaceAction(
  slug: string,
  spaceId: string,
  requesterMembershipId: string,
  formData: FormData,
) {
  const { viewer, space } = await requireSpaceAccessForAction({
    slug,
    spaceId,
    membershipId: requesterMembershipId,
    requireProfile: true,
  });
  if (!viewer.profile) throw new Error("A complete profile is required.");

  const receiverMembershipId = String(
    formData.get("receiver_membership_id") ?? "",
  );
  const [receiverMembership, receiverProfile, pending] = await Promise.all([
    requireActiveTargetInSpace(spaceId, receiverMembershipId, viewer.org.id),
    getProfileByMembershipId(receiverMembershipId),
    getPendingIntroRequestBetweenMembershipsInOrg(
      viewer.org.id,
      viewer.membership.id,
      receiverMembershipId,
    ),
  ]);
  if (
    receiverMembership.id === viewer.membership.id ||
    !receiverProfile?.onboardingComplete ||
    !receiverProfile.introOptIn
  ) {
    throw new Error("This member is not available for introductions.");
  }
  if (pending) {
    redirect(`${spaceRoot(slug, space.slug)}/requests?status=intro_existing`);
  }

  const rawSourceType = String(formData.get("source_type") ?? "match");
  if (rawSourceType !== "match" && rawSourceType !== "post" && rawSourceType !== "profile") {
    throw new Error("Invalid intro source.");
  }
  const sourceType = rawSourceType as IntroSourceType;
  const sourceId =
    String(formData.get("source_id") ?? "") ||
    (sourceType === "profile" ? receiverProfile.id : "");
  await requireIntroSourceInSpace({
    spaceId,
    sourceType,
    sourceId,
    requesterProfileId: viewer.profile.id,
    receiverMembershipId: receiverMembership.id,
    receiverProfileId: receiverProfile.id,
  });

  const note = String(formData.get("note") ?? "").trim();
  const suggestedFirstMessage = String(
    formData.get("suggested_first_message") ?? "",
  ).trim();
  if (!note || !suggestedFirstMessage) {
    throw new Error("Share why you’d like to meet and write a short first message.");
  }

  const intro = await createIntroRequestInSpace(
    {
      orgId: viewer.org.id,
      spaceId,
      requesterMembershipId: viewer.membership.id,
      receiverMembershipId: receiverMembership.id,
      sourceType,
      sourceId,
      introPurpose: String(
        formData.get("intro_purpose") ?? "general connection",
      ),
      note,
      status: "pending",
      suggestedFirstMessage,
    },
    { recordAnalytics: false },
  );
  const requestsPath = `${spaceRoot(slug, space.slug)}/requests`;
  const communityName = getCommunityDisplayName(space);
  enqueueNotificationWrite(
    buildNotification(
      `ntf_${nanoid(8)}`,
      viewer.org.id,
      receiverMembership.id,
      "intro_requested",
      `New introduction request in ${communityName}`,
      `Someone in ${communityName} would like an introduction.`,
      requestsPath,
      spaceId,
    ),
  );
  enqueueAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: viewer.org.id,
    spaceId,
    membershipId: viewer.membership.id,
    eventName: "intro_requested",
    payload: {
      receiverMembershipId: intro.receiverMembershipId,
      sourceType: intro.sourceType,
    },
    createdAt: intro.createdAt,
  });
  enqueueNotificationEmail({
    to: receiverProfile.emailForIntro,
    subject: `New introduction request in ${communityName}`,
    html: `<p>Someone in ${communityName} would like an introduction.</p><p>Open <a href="${absoluteAppUrl(requestsPath)}">your requests</a> to respond.</p>`,
    membershipId: receiverMembership.id,
    spaceId,
  });
  revalidateSpaceDiscoveryPaths(slug, space.slug);
  revalidatePath(`/org/${slug}/requests`);
  redirect(`${requestsPath}?status=intro_requested`);
}

export async function requestIntroAction(slug: string, requesterMembershipId: string, formData: FormData) {
  const { org, membership, profile } = await requireMemberForAction(slug, requesterMembershipId, {
    requireFeedAccess: true,
  });
  if (!profile) throw new Error("Unauthorized.");
  const mainSpace = await requireLegacyMainSpace(org.id, membership.id);

  const receiverMembershipId = String(formData.get("receiver_membership_id") ?? "");
  const [receiverMembership, receiverProfile, pendingIntro] = await Promise.all([
    requireActiveTargetInSpace(mainSpace.id, receiverMembershipId, org.id),
    getProfileByMembershipId(receiverMembershipId),
    getPendingIntroRequestBetweenMembershipsInOrg(
      org.id,
      membership.id,
      receiverMembershipId,
    ),
  ]);
  if (receiverMembership.id === membership.id) {
    throw new Error("Unauthorized.");
  }

  if (!receiverProfile?.introOptIn) {
    throw new Error("Unauthorized.");
  }

  const rawSourceType = String(formData.get("source_type") ?? "match");
  if (rawSourceType !== "match" && rawSourceType !== "post" && rawSourceType !== "profile") {
    throw new Error("Unauthorized.");
  }
  const sourceType = rawSourceType as IntroSourceType;
  const sourceId =
    String(formData.get("source_id") ?? "") ||
    (sourceType === "profile" ? receiverProfile.id : "");

  await requireIntroSourceInSpace({
    spaceId: mainSpace.id,
    sourceType,
    sourceId,
    requesterProfileId: profile.id,
    receiverMembershipId: receiverMembership.id,
    receiverProfileId: receiverProfile.id,
  });

  if (pendingIntro) {
    redirect(`/org/${slug}/requests?status=intro_existing`);
  }

  const note = String(formData.get("note") ?? "").trim();
  const suggestedFirstMessage = String(
    formData.get("suggested_first_message") ?? "",
  ).trim();
  if (!note || !suggestedFirstMessage) {
    throw new Error("Share why you’d like to meet and write a short first message.");
  }

  const intro = await createIntroRequestInSpace({
    orgId: org.id,
    spaceId: mainSpace.id,
    requesterMembershipId: membership.id,
    receiverMembershipId: receiverMembership.id,
    sourceType,
    sourceId,
    introPurpose: String(formData.get("intro_purpose") ?? "general connection"),
    note,
    status: "pending",
    suggestedFirstMessage,
  }, { recordAnalytics: false });
  const mainRequestsPath = `${spaceRoot(slug, mainSpace.slug)}/requests`;
  enqueueNotificationWrite(
    buildNotification(
      `ntf_${nanoid(8)}`,
      org.id,
      receiverMembership.id,
      "intro_requested",
      "New introduction request in Wavesparks Community",
      "Someone in Wavesparks Community would like an introduction.",
      mainRequestsPath,
      mainSpace.id,
    ),
  );
  enqueueAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: org.id,
    spaceId: mainSpace.id,
    membershipId: membership.id,
    eventName: "intro_requested",
    payload: {
      receiverMembershipId: intro.receiverMembershipId,
      sourceType: intro.sourceType,
    },
    createdAt: intro.createdAt,
  });

  if (receiverProfile) {
    const requestsUrl = absoluteAppUrl(mainRequestsPath);
    enqueueNotificationEmail({
      to: receiverProfile.emailForIntro,
      subject: "New introduction request in Wavesparks Community",
      html: `<p>Someone in Wavesparks Community would like an introduction.</p><p>Open <a href="${requestsUrl}">your requests</a> to respond.</p>`,
      membershipId: receiverMembership.id,
      spaceId: mainSpace.id,
    });
  }

  revalidatePath(`/org/${slug}/requests`);
  revalidatePath(mainRequestsPath);
  revalidatePath(`/org/${slug}/matches`);
  revalidatePath(`/org/${slug}/people`);
  revalidatePath(`/org/${slug}/people/${receiverMembership.id}`);
  revalidateMemberActivationPaths(slug);
  redirect(`/org/${slug}/requests?status=intro_requested`);
}

export async function respondIntroInSpaceAction(
  slug: string,
  spaceId: string,
  introRequestId: string,
  responderMembershipId: string,
  status: IntroStatus,
) {
  const { viewer, space } = await requireSpaceAccessForAction({
    slug,
    spaceId,
    membershipId: responderMembershipId,
    requireProfile: true,
  });
  if (status !== "accepted" && status !== "declined") {
    throw new Error("Invalid intro response.");
  }
  const intro = await getIntroRequestByIdInSpace(spaceId, introRequestId);
  if (
    !intro ||
    intro.orgId !== viewer.org.id ||
    intro.receiverMembershipId !== viewer.membership.id ||
    intro.status !== "pending"
  ) {
    throw new Error("Introduction request not found in this community or event.");
  }
  const updated = await respondToIntroRequestInSpace(
    spaceId,
    introRequestId,
    status,
    { recordAnalytics: false },
  );
  if (!updated) {
    throw new Error("Introduction request not found in this community or event.");
  }
  enqueueAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: viewer.org.id,
    spaceId,
    membershipId: updated.receiverMembershipId,
    eventName: status === "accepted" ? "intro_accepted" : "intro_declined",
    payload: { introRequestId: updated.id },
    createdAt: updated.respondedAt ?? updated.updatedAt,
  });

  const requesterSpaceMembership = await getSpaceMembership(
    spaceId,
    updated.requesterMembershipId,
  );
  const requestsPath = `${spaceRoot(slug, space.slug)}/requests`;
  const communityName = getCommunityDisplayName(space);
  if (requesterSpaceMembership?.accessStatus === "active") {
    enqueueNotificationWrite(
      buildNotification(
        `ntf_${nanoid(8)}`,
        viewer.org.id,
        updated.requesterMembershipId,
        status === "accepted" ? "intro_accepted" : "intro_declined",
        status === "accepted"
          ? `Your ${communityName} introduction was accepted`
          : `Your ${communityName} introduction was declined`,
        status === "accepted"
          ? "Contact details are now available in your introduction requests."
          : "They declined for now. No contact details were shared.",
        requestsPath,
        spaceId,
      ),
    );
  }
  enqueueMembershipEmail({
    membershipId: updated.requesterMembershipId,
    spaceId,
    subject:
      status === "accepted"
        ? `Your ${communityName} introduction was accepted`
        : `Your ${communityName} introduction was declined`,
    html: `<p>Your introduction request was ${status}.</p><p>Open <a href="${absoluteAppUrl(requestsPath)}">your introduction requests</a> for the latest details.</p>`,
  });
  revalidatePath(requestsPath);
  revalidatePath(`/org/${slug}/requests`);
  redirect(
    `${requestsPath}?status=${
      status === "accepted" ? "intro_accepted" : "intro_declined"
    }`,
  );
}

export async function respondIntroAction(slug: string, introRequestId: string, responderMembershipId: string, status: IntroStatus) {
  const { org, membership } = await requireMemberForAction(slug, responderMembershipId, {
    requireFeedAccess: true,
  });
  const mainSpace = await requireLegacyMainSpace(org.id, membership.id);
  if (status !== "accepted" && status !== "declined") {
    throw new Error("Unauthorized.");
  }

  const intro = await getIntroRequestByIdInSpace(mainSpace.id, introRequestId);
  if (
    !intro ||
    intro.orgId !== org.id ||
    intro.receiverMembershipId !== membership.id ||
    intro.status !== "pending"
  ) {
    throw new Error("Unauthorized.");
  }

  const updated = await respondToIntroRequestInSpace(
    mainSpace.id,
    introRequestId,
    status,
    { recordAnalytics: false },
  );
  if (!updated) {
    return;
  }
  enqueueAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: org.id,
    spaceId: mainSpace.id,
    membershipId: updated.receiverMembershipId,
    eventName: status === "accepted" ? "intro_accepted" : "intro_declined",
    payload: { introRequestId: updated.id },
    createdAt: updated.respondedAt ?? updated.updatedAt,
  });

  const mainRequestsPath = `${spaceRoot(slug, mainSpace.slug)}/requests`;
  enqueueNotificationWrite(
    buildNotification(
      `ntf_${nanoid(8)}`,
      org.id,
      updated.requesterMembershipId,
      status === "accepted" ? "intro_accepted" : "intro_declined",
      status === "accepted" ? "Your intro was accepted" : "Your intro was declined",
      status === "accepted"
        ? "Contact details are now available in your introduction requests."
        : "They declined for now. No contact details were shared.",
      mainRequestsPath,
      mainSpace.id,
    ),
  );

  const requestsUrl = absoluteAppUrl(mainRequestsPath);
  enqueueMembershipEmail({
    membershipId: updated.requesterMembershipId,
    spaceId: mainSpace.id,
    subject:
      status === "accepted"
        ? "Your Wavesparks Community introduction was accepted"
        : "Your Wavesparks Community introduction was declined",
    html: `<p>Your introduction request was ${status}.</p><p>Open <a href="${requestsUrl}">your introduction requests</a> for the latest details.</p>`,
  });

  revalidatePath(`/org/${slug}/requests`);
  revalidatePath(mainRequestsPath);
  redirect(
    `/org/${slug}/requests?status=${
      status === "accepted" ? "intro_accepted" : "intro_declined"
    }`,
  );
}

export async function markNotificationsReadAction(slug: string, membershipId: string) {
  const { org, membership } = await requireMemberForAction(slug, membershipId, {
    requireFeedAccess: true,
  });
  const mainSpace = await requireLegacyMainSpace(org.id, membership.id);
  await markNotificationsReadForMembershipInSpace(mainSpace.id, membership.id);
  revalidatePath(`/org/${slug}/requests`);
  revalidatePath(`${spaceRoot(slug, mainSpace.slug)}/requests`);
  redirect(`/org/${slug}/requests?status=notifications_read`);
}

export async function markAccountNotificationsReadAction(
  slug: string,
  membershipId: string,
) {
  const { membership } = await requireMemberForAction(slug, membershipId);
  if (membership.accountStatus !== "connected") {
    throw new Error("Connected account required.");
  }
  const accessibleSpaces = await listVisibleSpacesForMembership(membership.id);
  await markNotificationsReadForMembershipWithSpaceAccess(
    membership.id,
    accessibleSpaces.map(({ space }) => space.id),
  );
  revalidatePath(`/org/${slug}/requests`);
  redirect(`/org/${slug}/requests?status=notifications_read`);
}

export async function markNotificationsReadInSpaceAction(
  slug: string,
  spaceId: string,
  membershipId: string,
) {
  const { viewer, space } = await requireSpaceAccessForAction({
    slug,
    spaceId,
    membershipId,
  });
  await markNotificationsReadForMembershipInSpace(spaceId, viewer.membership.id);
  const requestsPath = `${spaceRoot(slug, space.slug)}/requests`;
  revalidatePath(requestsPath);
  redirect(`${requestsPath}?status=notifications_read`);
}

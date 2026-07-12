"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { nanoid } from "nanoid";

import { getViewerContextForAction } from "@/lib/auth";
import { buildNotification, enqueueNotificationEmail } from "@/server/notifications";
import { opportunitySourceForPost } from "@/lib/opportunities";
import {
  getPostCommentRevalidationPaths,
  getPostListPathForType,
  getPostListRevalidationPaths,
} from "@/lib/post-action-routing";
import { profileFromFormData, validateProfileFormData } from "@/lib/profile-form";
import { getProfileReadiness } from "@/lib/activation";
import { parseTags } from "@/lib/utils";
import { absoluteAppUrl } from "@/lib/urls";
import {
  enqueueAnalyticsEvent,
  enqueueMembershipEmail,
  enqueueNotificationWrite,
} from "@/server/action-side-effects";
import { canAccessFeed } from "@/server/permissions";
import {
  createComment,
  createIntroRequest,
  getIntroRequestById,
  createPost,
  followMembership,
  getMembershipById,
  getPostById,
  getProfileByMembershipId,
  savePostForMembership,
  listActiveIntroRequestStatusesForRequester,
  markNotificationsReadForMembership,
  recomputeMatchesForProfile,
  respondToIntroRequest,
  unsavePostForMembership,
  unfollowMembership,
  upsertProfile,
} from "@/server/store";
import type { IntroSourceType, IntroStatus, Membership, PostType } from "@/lib/domain";

async function requireMemberForAction(
  slug: string,
  expectedMembershipId?: string,
  options: { requireFeedAccess?: boolean } = {},
) {
  const viewer = await getViewerContextForAction(slug);

  if (!viewer) {
    throw new Error("Unauthorized.");
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

function requireSameOrg(membership: Membership | undefined, orgId: string) {
  if (!membership || membership.orgId !== orgId) {
    throw new Error("Unauthorized.");
  }
  return membership;
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

function revalidatePostSavePaths(slug: string, postId: string, postType: PostType) {
  for (const path of getPostListRevalidationPaths(slug, postType)) {
    revalidatePath(path);
  }
  revalidatePath(`/org/${slug}/knowledge`);
  revalidatePath(`/org/${slug}/posts/${postId}`);
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
        if (["preferred_name", "headline"].includes(field.key)) return 0;
        if (["startup_one_liner", "startup_description"].includes(field.key)) return 1;
        if (["looking_for_types", "desired_roles", "skill_tags"].includes(field.key)) return 2;
        return 3;
      }),
    );
    const missing = readiness.missingFields.map((field) => field.label).join(", ");
    redirect(
      `/org/${slug}/onboarding?status=${intent === "draft" ? "profile_draft_saved" : "profile_incomplete"}&step=${firstMissingStep}&missing=${encodeURIComponent(missing)}`,
    );
  }
  redirect(
    membership.status === "approved"
      ? `/org/${slug}/profile?status=profile_saved`
      : `/org/${slug}/pending?status=profile_saved`,
  );
}

export async function createPostAction(slug: string, membershipId: string, formData: FormData) {
  const { org, membership } = await requireMemberForAction(slug, membershipId, {
    requireFeedAccess: true,
  });

  const type = String(formData.get("type") ?? "general_update") as PostType;
  const post = await createPost(
    {
      orgId: org.id,
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
      visibility: "org_only",
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
    membershipId: membership.id,
    eventName: "post_created",
    payload: { postId: post.id, type: post.type },
    createdAt: post.createdAt,
  });

  for (const path of getPostListRevalidationPaths(slug, post.type)) {
    revalidatePath(path);
  }
  revalidatePath(`/org/${slug}/profile`);
  redirect(`${getPostListPathForType(slug, post.type)}?status=post_created`);
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
  const followedMembership = requireSameOrg(
    await getMembershipById(followedMembershipId),
    org.id,
  );

  if (followedMembership.status !== "approved") {
    throw new Error("Unauthorized.");
  }

  await followMembership(org.id, membership.id, followedMembership.id);
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
  const followedMembership = requireSameOrg(
    await getMembershipById(followedMembershipId),
    org.id,
  );

  await unfollowMembership(membership.id, followedMembership.id);
  revalidateMemberDiscoveryPaths(slug);
  redirect(
    withStatus(
      safeReturnPath(slug, formData, `/org/${slug}/matches`),
      "member_unfollowed",
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
  const post = await getPostById(postId);
  if (!post || post.orgId !== org.id || post.hidden) {
    throw new Error("Unauthorized.");
  }

  await savePostForMembership(org.id, membership.id, post.id);
  revalidatePostSavePaths(slug, post.id, post.type);
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
  const post = await getPostById(postId);
  if (!post || post.orgId !== org.id || post.hidden) {
    throw new Error("Unauthorized.");
  }

  await unsavePostForMembership(membership.id, post.id);
  revalidatePostSavePaths(slug, post.id, post.type);
  redirect(
    withStatus(
      safeReturnPath(slug, formData, `/org/${slug}/posts/${post.id}`),
      "post_unsaved",
    ),
  );
}

export async function addCommentAction(slug: string, membershipId: string, postId: string, formData: FormData) {
  const { org, membership } = await requireMemberForAction(slug, membershipId, {
    requireFeedAccess: true,
  });
  const post = await getPostById(postId);
  if (
    !post ||
    post.orgId !== org.id ||
    post.hidden ||
    post.commentsLocked ||
    post.status !== "active"
  ) {
    throw new Error("Unauthorized.");
  }

  const comment = await createComment(
    {
      postId,
      authorMembershipId: membership.id,
      body: String(formData.get("body") ?? ""),
    },
    { orgId: org.id, recordAnalytics: false },
  );
  enqueueAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: org.id,
    membershipId: membership.id,
    eventName: "comment_created",
    payload: { postId: comment.postId },
    createdAt: comment.createdAt,
  });

  for (const path of getPostCommentRevalidationPaths(slug, postId, post.type)) {
    revalidatePath(path);
  }
  redirect(`/org/${slug}/posts/${postId}?status=comment_added`);
}

export async function requestIntroAction(slug: string, requesterMembershipId: string, formData: FormData) {
  const { org, membership } = await requireMemberForAction(slug, requesterMembershipId, {
    requireFeedAccess: true,
  });

  const receiverMembershipId = String(formData.get("receiver_membership_id") ?? "");
  const [
    receiverMembershipCandidate,
    receiverProfile,
    activeIntroStatuses,
  ] = await Promise.all([
    getMembershipById(receiverMembershipId),
    getProfileByMembershipId(receiverMembershipId),
    listActiveIntroRequestStatusesForRequester(membership.id, [
      receiverMembershipId,
    ]),
  ]);
  const receiverMembership = requireSameOrg(receiverMembershipCandidate, org.id);
  if (receiverMembership.id === membership.id || receiverMembership.status !== "approved") {
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
  if (sourceType === "profile" && sourceId !== receiverProfile.id) {
    throw new Error("Unauthorized.");
  }

  const existingIntroStatus = activeIntroStatuses.get(receiverMembership.id);
  if (existingIntroStatus) {
    redirect(`/org/${slug}/requests?status=intro_existing`);
  }

  const intro = await createIntroRequest({
    orgId: org.id,
    requesterMembershipId: membership.id,
    receiverMembershipId: receiverMembership.id,
    sourceType,
    sourceId,
    introPurpose: String(formData.get("intro_purpose") ?? "general connection"),
    note: String(formData.get("note") ?? ""),
    status: "pending",
    suggestedFirstMessage:
      String(formData.get("suggested_first_message") ?? "") ||
      "Excited to connect and learn more about what you’re building.",
  }, { recordAnalytics: false });
  enqueueNotificationWrite(
    buildNotification(
      `ntf_${nanoid(8)}`,
      org.id,
      receiverMembership.id,
      "intro_requested",
      "A new intro request is waiting",
      "Someone in the community wants to connect with context.",
      `/org/${slug}/requests`,
    ),
  );
  enqueueAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: org.id,
    membershipId: membership.id,
    eventName: "intro_requested",
    payload: {
      receiverMembershipId: intro.receiverMembershipId,
      sourceType: intro.sourceType,
    },
    createdAt: intro.createdAt,
  });

  if (receiverProfile) {
    const requestsUrl = absoluteAppUrl(`/org/${slug}/requests`);
    enqueueNotificationEmail({
      to: receiverProfile.emailForIntro,
      subject: "You have a new Wavespark intro request",
      html: `<p>You have a new intro request inside Wavespark.</p><p>Open <a href="${requestsUrl}">your requests</a> to respond.</p>`,
    });
  }

  revalidatePath(`/org/${slug}/requests`);
  revalidatePath(`/org/${slug}/matches`);
  revalidatePath(`/org/${slug}/people`);
  revalidatePath(`/org/${slug}/people/${receiverMembership.id}`);
  revalidateMemberActivationPaths(slug);
  redirect(`/org/${slug}/requests?status=intro_requested`);
}

export async function respondIntroAction(slug: string, introRequestId: string, responderMembershipId: string, status: IntroStatus) {
  const { org, membership } = await requireMemberForAction(slug, responderMembershipId, {
    requireFeedAccess: true,
  });
  if (status !== "accepted" && status !== "declined") {
    throw new Error("Unauthorized.");
  }

  const intro = await getIntroRequestById(introRequestId);
  if (
    !intro ||
    intro.orgId !== org.id ||
    intro.receiverMembershipId !== membership.id ||
    intro.status !== "pending"
  ) {
    throw new Error("Unauthorized.");
  }

  const updated = await respondToIntroRequest(introRequestId, status, {
    recordAnalytics: false,
  });
  if (!updated) {
    return;
  }
  enqueueAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: org.id,
    membershipId: updated.receiverMembershipId,
    eventName: status === "accepted" ? "intro_accepted" : "intro_declined",
    payload: { introRequestId: updated.id },
    createdAt: updated.respondedAt ?? updated.updatedAt,
  });

  enqueueNotificationWrite(
    buildNotification(
      `ntf_${nanoid(8)}`,
      org.id,
      updated.requesterMembershipId,
      status === "accepted" ? "intro_accepted" : "intro_declined",
      status === "accepted" ? "Your intro was accepted" : "Your intro was declined",
      status === "accepted"
        ? "Contact details are now available inside your requests inbox."
        : "The receiver passed for now. No contact details were revealed.",
      `/org/${slug}/requests`,
    ),
  );

  const requestsUrl = absoluteAppUrl(`/org/${slug}/requests`);
  enqueueMembershipEmail({
    membershipId: updated.requesterMembershipId,
    subject:
      status === "accepted"
        ? "Your Wavespark intro was accepted"
        : "Your Wavespark intro was declined",
    html: `<p>Your request status is now <strong>${status}</strong>.</p><p>Visit <a href="${requestsUrl}">your Wavespark requests inbox</a> for the latest details.</p>`,
  });

  revalidatePath(`/org/${slug}/requests`);
  redirect(
    `/org/${slug}/requests?status=${
      status === "accepted" ? "intro_accepted" : "intro_declined"
    }`,
  );
}

export async function markNotificationsReadAction(slug: string, membershipId: string) {
  const { membership } = await requireMemberForAction(slug, membershipId, {
    requireFeedAccess: true,
  });

  await markNotificationsReadForMembership(membership.id);
  revalidatePath(`/org/${slug}/requests`);
  redirect(`/org/${slug}/requests?status=notifications_read`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { nanoid } from "nanoid";

import { getViewerContextForAction } from "@/lib/auth";
import { isClerkConfigured } from "@/lib/env";
import { getPostCommentRevalidationPaths } from "@/lib/post-action-routing";
import { absoluteAppUrl } from "@/lib/urls";
import {
  enqueueAnalyticsEvent,
  enqueueClerkInvitation,
  enqueueMembershipEmail,
  enqueueNotificationWrite,
} from "@/server/action-side-effects";
import { canViewAdminRoute } from "@/server/permissions";
import { buildNotification, enqueueNotificationEmail } from "@/server/notifications";
import {
  createManagedAccount,
  createIntroRequest,
  getCommentRecordById,
  getMembershipById,
  getMembershipRecordById,
  getPostById,
  getProfileRecordById,
  recomputeMatchesForProfile,
  recomputeMatchesForOrg,
  updateCommentStatus,
  updateMembershipStatus,
  updateOrganizationSettings,
  updatePostModeration,
  updateProfileFlags,
} from "@/server/store";

async function requireAdminForAction(slug: string) {
  const viewer = await getViewerContextForAction(slug);

  if (!viewer || !canViewAdminRoute(viewer.user, viewer.membership)) {
    throw new Error("Unauthorized.");
  }

  return {
    org: viewer.org,
    user: viewer.user,
    membership: viewer.membership,
  };
}

function enqueueProfileMatchRecompute(slug: string, orgId: string, profileId: string) {
  after(async () => {
    try {
      await recomputeMatchesForProfile(orgId, profileId);
      revalidatePath(`/org/${slug}/matches`);
      revalidatePath(`/org/${slug}/admin/matches`);
    } catch (error) {
      console.error("[wavesparks] profile match recompute failed", profileId, error);
    }
  });
}

export async function createManagedAccountAction(slug: string, formData: FormData) {
  const { org } = await requireAdminForAction(slug);
  const email = String(formData.get("email") ?? "");
  const name = String(formData.get("name") ?? "");
  const role = String(formData.get("role") ?? "member") as never;
  const status = String(formData.get("status") ?? "approved") as never;
  if (!isClerkConfigured()) {
    throw new Error("Clerk is not configured.");
  }

  const { membership } = await createManagedAccount({
    orgId: org.id,
    email,
    name,
    createPasswordCredential: false,
    role,
    status,
  });

  enqueueClerkInvitation({
    emailAddress: email,
    redirectUrl: absoluteAppUrl(`/org/${slug}/signin`),
    publicMetadata: {
      orgSlug: slug,
      membershipId: membership.id,
      membershipRole: membership.role,
    },
  });

  revalidatePath(`/org/${slug}/admin/members`);
  redirect(`/org/${slug}/admin/members?status=member_invited`);
}

export async function updateMembershipAction(slug: string, membershipId: string, formData: FormData) {
  const { org } = await requireAdminForAction(slug);
  const targetRecord = await getMembershipRecordById(membershipId);
  const targetMembership = targetRecord?.membership;
  const targetProfile = targetRecord?.profile;
  if (!targetMembership || targetMembership.orgId !== org.id) {
    throw new Error("Unauthorized.");
  }

  const membership = await updateMembershipStatus(
    membershipId,
    String(formData.get("status") ?? "pending") as never,
    String(formData.get("approval_note") ?? ""),
    { existingMembership: targetMembership, recomputeMatches: false },
  );

  if (!org || !membership) {
    return;
  }

  if (targetProfile) {
    enqueueProfileMatchRecompute(slug, org.id, targetProfile.id);
  }

  if (membership.status === "approved") {
    enqueueNotificationWrite(
      buildNotification(
        `ntf_${nanoid(8)}`,
        org.id,
        membership.id,
        "membership_approved",
        "You’re approved for Wavespark",
        "Your membership request was approved. You can now access the feed and matches.",
        `/org/${slug}/feed`,
      ),
    );

    if (targetProfile) {
      const feedUrl = absoluteAppUrl(`/org/${slug}/feed`);
      enqueueNotificationEmail({
        to: targetProfile.emailForIntro,
        subject: "Your Wavespark membership is approved",
        html: `<p>You’re approved for Wavespark.</p><p>Visit <a href="${feedUrl}">the community feed</a> to get started.</p>`,
      });
    }
  }

  revalidatePath(`/org/${slug}/admin/members`);
  revalidatePath(`/org/${slug}/pending`);
  redirect(`/org/${slug}/admin/members?status=membership_updated`);
}

export async function updatePostModerationAction(slug: string, postId: string, formData: FormData) {
  const { org } = await requireAdminForAction(slug);
  const post = await getPostById(postId);
  if (!post || post.orgId !== org.id) {
    throw new Error("Unauthorized.");
  }

  await updatePostModeration(
    postId,
    {
      hidden: formData.has("hidden") ? formData.get("hidden") === "true" : undefined,
      featured: formData.has("featured") ? formData.get("featured") === "true" : undefined,
      commentsLocked: formData.has("comments_locked")
        ? formData.get("comments_locked") === "true"
        : undefined,
      status: formData.has("status") ? (formData.get("status") as never) : undefined,
    },
    { existingPost: post },
  );

  revalidatePath(`/org/${slug}/admin/posts`);
  for (const path of getPostCommentRevalidationPaths(slug, postId, post.type)) {
    revalidatePath(path);
  }
  redirect(`/org/${slug}/admin/posts?status=post_moderation_updated`);
}

export async function updateProfileFlagsAction(slug: string, profileId: string, formData: FormData) {
  const { org } = await requireAdminForAction(slug);
  const profileRecord = await getProfileRecordById(profileId);
  const profile = profileRecord?.profile;
  const membership = profileRecord?.membership;
  if (!profile || !membership || membership.orgId !== org.id) {
    throw new Error("Unauthorized.");
  }

  await updateProfileFlags(
    profileId,
    {
      featured: formData.get("featured") === "true",
      stale: formData.get("stale") === "true",
    },
    { existingProfile: profile, orgId: org.id, recomputeMatches: false },
  );
  enqueueProfileMatchRecompute(slug, org.id, profile.id);

  revalidatePath(`/org/${slug}/admin/profiles`);
  redirect(`/org/${slug}/admin/profiles?status=profile_flags_updated`);
}

export async function createManualIntroAction(slug: string, requesterMembershipId: string, formData: FormData) {
  const { org, membership: adminMembership } = await requireAdminForAction(slug);
  if (requesterMembershipId !== adminMembership.id) {
    throw new Error("Unauthorized.");
  }

  const receiverMembershipId = String(formData.get("receiver_membership_id") ?? "");
  const receiverMembership = await getMembershipById(receiverMembershipId);
  if (!receiverMembership || receiverMembership.orgId !== org.id) {
    throw new Error("Unauthorized.");
  }

  const intro = await createIntroRequest({
    orgId: org.id,
    requesterMembershipId: adminMembership.id,
    receiverMembershipId: receiverMembership.id,
    sourceType: "admin_manual",
    sourceId: `manual_${nanoid(8)}`,
    introPurpose: String(formData.get("intro_purpose") ?? "general connection"),
    note:
      String(formData.get("note") ?? "") ||
      "Admin-curated intro based on a strong fit in the community.",
    status: "pending",
    suggestedFirstMessage:
      "Happy to connect. I’d love to learn how your work is evolving and where we might be able to help one another.",
  }, { recordAnalytics: false });
  enqueueNotificationWrite(
    buildNotification(
      `ntf_${nanoid(8)}`,
      org.id,
      receiverMembership.id,
      "manual_intro",
      "An admin created an introduction for you",
      "A Wavespark admin surfaced a connection that looks worth exploring.",
      `/org/${slug}/requests`,
    ),
  );
  enqueueAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: org.id,
    membershipId: adminMembership.id,
    eventName: "intro_requested",
    payload: {
      receiverMembershipId: intro.receiverMembershipId,
      sourceType: intro.sourceType,
    },
    createdAt: intro.createdAt,
  });

  const requestsUrl = absoluteAppUrl(`/org/${slug}/requests`);
  enqueueMembershipEmail({
    membershipId: receiverMembership.id,
    subject: "A Wavespark admin created an intro for you",
    html: `<p>An admin made a curated intro for you inside Wavespark.</p><p>Open <a href="${requestsUrl}">your requests inbox</a> to respond.</p>`,
  });

  revalidatePath(`/org/${slug}/admin/requests`);
  revalidatePath(`/org/${slug}/requests`);
  redirect(`/org/${slug}/admin/requests?status=manual_intro_created`);
}

export async function recomputeMatchesAction(slug: string) {
  const { org } = await requireAdminForAction(slug);

  await recomputeMatchesForOrg(org.id);
  revalidatePath(`/org/${slug}/matches`);
  revalidatePath(`/org/${slug}/admin/matches`);
  redirect(`/org/${slug}/admin/matches?status=matches_recomputed`);
}

export async function moderateCommentAction(slug: string, commentId: string, status: "visible" | "removed") {
  const { org } = await requireAdminForAction(slug);
  const commentRecord = await getCommentRecordById(commentId);
  if (!commentRecord?.post || commentRecord.post.orgId !== org.id) {
    throw new Error("Unauthorized.");
  }

  await updateCommentStatus(commentId, status, {
    existingComment: commentRecord.comment,
  });
  revalidatePath(`/org/${slug}/admin/posts`);
  for (const path of getPostCommentRevalidationPaths(
    slug,
    commentRecord.post.id,
    commentRecord.post.type,
  )) {
    revalidatePath(path);
  }
  redirect(`/org/${slug}/admin/posts?status=comment_moderation_updated`);
}

export async function updateOrgSettingsAction(slug: string, formData: FormData) {
  const { org } = await requireAdminForAction(slug);

  await updateOrganizationSettings(org.id, {
    name: String(formData.get("name") ?? org.name),
    logoUrl: String(formData.get("logo_url") ?? org.logoUrl),
    tagline: String(formData.get("tagline") ?? org.tagline),
    description: String(formData.get("description") ?? org.description),
    inviteSettings: String(formData.get("invite_settings") ?? org.inviteSettings),
  });

  revalidatePath(`/org/${slug}`);
  revalidatePath(`/org/${slug}/admin/settings`);
  redirect(`/org/${slug}/admin/settings?status=org_settings_saved`);
}

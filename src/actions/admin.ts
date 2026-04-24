"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";

import { buildNotification, sendNotificationEmail } from "@/server/notifications";
import {
  addNotification,
  createIntroRequest,
  getOrganizationBySlug,
  getProfileByMembershipId,
  recomputeMatchesForOrg,
  updateCommentStatus,
  updateMembershipStatus,
  updateOrganizationSettings,
  updatePostModeration,
  updateProfileFlags,
} from "@/server/store";

export async function updateMembershipAction(slug: string, membershipId: string, formData: FormData) {
  const org = getOrganizationBySlug(slug);
  const membership = updateMembershipStatus(
    membershipId,
    String(formData.get("status") ?? "pending") as never,
    String(formData.get("approval_note") ?? ""),
  );

  if (!org || !membership) {
    return;
  }

  if (membership.status === "approved") {
    addNotification(
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

    const profile = getProfileByMembershipId(membership.id);
    if (profile) {
      await sendNotificationEmail({
        to: profile.emailForIntro,
        subject: "Your Wavespark membership is approved",
        html: `<p>You’re approved for Wavespark.</p><p>Visit <a href="/org/${slug}/feed">the community feed</a> to get started.</p>`,
      });
    }
  }

  revalidatePath(`/org/${slug}/admin/members`);
  revalidatePath(`/org/${slug}/pending`);
}

export async function updatePostModerationAction(slug: string, postId: string, formData: FormData) {
  updatePostModeration(postId, {
    hidden: formData.get("hidden") === "true",
    featured: formData.get("featured") === "true",
    commentsLocked: formData.get("comments_locked") === "true",
    status: (formData.get("status") as never) ?? undefined,
  });

  revalidatePath(`/org/${slug}/admin/posts`);
  revalidatePath(`/org/${slug}/feed`);
}

export async function updateProfileFlagsAction(slug: string, profileId: string, formData: FormData) {
  updateProfileFlags(profileId, {
    featured: formData.get("featured") === "true",
    stale: formData.get("stale") === "true",
  });

  revalidatePath(`/org/${slug}/admin/profiles`);
  revalidatePath(`/org/${slug}/matches`);
}

export async function createManualIntroAction(slug: string, requesterMembershipId: string, formData: FormData) {
  const org = getOrganizationBySlug(slug);
  if (!org) {
    return;
  }

  const receiverMembershipId = String(formData.get("receiver_membership_id") ?? "");
  const receiverProfile = getProfileByMembershipId(receiverMembershipId);
  createIntroRequest({
    orgId: org.id,
    requesterMembershipId,
    receiverMembershipId,
    sourceType: "admin_manual",
    sourceId: `manual_${nanoid(8)}`,
    introPurpose: String(formData.get("intro_purpose") ?? "general connection"),
    note:
      String(formData.get("note") ?? "") ||
      "Admin-curated intro based on a strong fit in the community.",
    status: "pending",
    suggestedFirstMessage:
      "Happy to connect. I’d love to learn how your work is evolving and where we might be able to help one another.",
  });

  addNotification(
    buildNotification(
      `ntf_${nanoid(8)}`,
      org.id,
      receiverMembershipId,
      "manual_intro",
      "An admin created an introduction for you",
      "A Wavespark admin surfaced a connection that looks worth exploring.",
      `/org/${slug}/requests`,
    ),
  );

  if (receiverProfile) {
    await sendNotificationEmail({
      to: receiverProfile.emailForIntro,
      subject: "A Wavespark admin created an intro for you",
      html: `<p>An admin made a curated intro for you inside Wavespark.</p><p>Open your requests inbox to respond.</p>`,
    });
  }

  revalidatePath(`/org/${slug}/admin/requests`);
  revalidatePath(`/org/${slug}/requests`);
}

export async function recomputeMatchesAction(slug: string) {
  const org = getOrganizationBySlug(slug);
  if (!org) {
    return;
  }

  recomputeMatchesForOrg(org.id);
  revalidatePath(`/org/${slug}/matches`);
  revalidatePath(`/org/${slug}/admin/matches`);
}

export async function moderateCommentAction(slug: string, commentId: string, status: "visible" | "removed") {
  updateCommentStatus(commentId, status);
  revalidatePath(`/org/${slug}/admin/posts`);
}

export async function updateOrgSettingsAction(slug: string, formData: FormData) {
  const org = getOrganizationBySlug(slug);
  if (!org) {
    return;
  }

  updateOrganizationSettings(org.id, {
    name: String(formData.get("name") ?? org.name),
    tagline: String(formData.get("tagline") ?? org.tagline),
    description: String(formData.get("description") ?? org.description),
    inviteSettings: String(formData.get("invite_settings") ?? org.inviteSettings),
  });

  revalidatePath(`/org/${slug}`);
  revalidatePath(`/org/${slug}/admin/settings`);
}

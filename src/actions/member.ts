"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";

import { buildNotification, sendNotificationEmail } from "@/server/notifications";
import { profileFromFormData } from "@/lib/profile-form";
import { parseTags } from "@/lib/utils";
import {
  addNotification,
  createComment,
  createIntroRequest,
  createPost,
  getMembershipById,
  getOrganizationBySlug,
  getProfileByMembershipId,
  getUserById,
  respondToIntroRequest,
  upsertProfile,
} from "@/server/store";
import type { IntroStatus } from "@/lib/domain";

export async function saveOnboardingAction(slug: string, membershipId: string, formData: FormData) {
  const org = getOrganizationBySlug(slug);
  const membership = getMembershipById(membershipId);
  if (!org || !membership) {
    return;
  }

  const baseUser = getUserById(membership.userId);
  if (!baseUser) {
    return;
  }

  const existingProfile = getProfileByMembershipId(membership.id);
  const result = profileFromFormData({
    formData,
    membership,
    user: {
      ...baseUser,
      email: String(formData.get("email_for_intro") ?? baseUser.email),
      name: String(formData.get("full_name") ?? baseUser.name),
      imageUrl: String(formData.get("profile_photo") ?? baseUser.imageUrl),
      updatedAt: new Date().toISOString(),
    },
    existingProfile,
  });

  upsertProfile(result.profile, result.links);
  revalidatePath(`/org/${slug}/profile`);
  revalidatePath(`/org/${slug}/matches`);
  redirect(
    membership.status === "approved" ? `/org/${slug}/profile` : `/org/${slug}/pending`,
  );
}

export async function createPostAction(slug: string, membershipId: string, formData: FormData) {
  const org = getOrganizationBySlug(slug);
  if (!org) {
    return;
  }

  createPost({
    orgId: org.id,
    authorMembershipId: membershipId,
    type: String(formData.get("type") ?? "general_update") as never,
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
  });

  revalidatePath(`/org/${slug}/feed`);
  revalidatePath(`/org/${slug}/opportunities`);
}

export async function addCommentAction(slug: string, membershipId: string, postId: string, formData: FormData) {
  createComment({
    postId,
    authorMembershipId: membershipId,
    body: String(formData.get("body") ?? ""),
  });

  revalidatePath(`/org/${slug}/posts/${postId}`);
  revalidatePath(`/org/${slug}/feed`);
}

export async function requestIntroAction(slug: string, requesterMembershipId: string, formData: FormData) {
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
    sourceType: String(formData.get("source_type") ?? "match") as never,
    sourceId: String(formData.get("source_id") ?? ""),
    introPurpose: String(formData.get("intro_purpose") ?? "general connection"),
    note: String(formData.get("note") ?? ""),
    status: "pending",
    suggestedFirstMessage:
      String(formData.get("suggested_first_message") ?? "") ||
      "Excited to connect and learn more about what you’re building.",
  });

  addNotification(
    buildNotification(
      `ntf_${nanoid(8)}`,
      org.id,
      receiverMembershipId,
      "intro_requested",
      "A new intro request is waiting",
      "Someone in the community wants to connect with context.",
      `/org/${slug}/requests`,
    ),
  );

  if (receiverProfile) {
    await sendNotificationEmail({
      to: receiverProfile.emailForIntro,
      subject: "You have a new Wavespark intro request",
      html: `<p>You have a new intro request inside Wavespark.</p><p>Open <a href="${`/org/${slug}/requests`}">your requests</a> to respond.</p>`,
    });
  }

  revalidatePath(`/org/${slug}/requests`);
  revalidatePath(`/org/${slug}/matches`);
}

export async function respondIntroAction(slug: string, introRequestId: string, responderMembershipId: string, status: IntroStatus) {
  const org = getOrganizationBySlug(slug);
  if (!org || (status !== "accepted" && status !== "declined")) {
    return;
  }

  const updated = respondToIntroRequest(introRequestId, status);
  if (!updated) {
    return;
  }

  const requesterProfile = getProfileByMembershipId(updated.requesterMembershipId);
  addNotification(
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

  if (requesterProfile) {
    await sendNotificationEmail({
      to: requesterProfile.emailForIntro,
      subject:
        status === "accepted"
          ? "Your Wavespark intro was accepted"
          : "Your Wavespark intro was declined",
      html: `<p>Your request status is now <strong>${status}</strong>.</p><p>Visit your Wavespark requests inbox for the latest details.</p>`,
    });
  }

  revalidatePath(`/org/${slug}/requests`);
}

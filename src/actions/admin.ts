"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { nanoid } from "nanoid";

import { getViewerContextForAction } from "@/lib/auth";
import { getE2ELocalClerkOrganizationContext } from "@/lib/e2e-local-auth";
import { isClerkConfigured } from "@/lib/env";
import type { MembershipRole, MembershipStatus } from "@/lib/domain";
import { getPostCommentRevalidationPaths } from "@/lib/post-action-routing";
import { absoluteAppUrl } from "@/lib/urls";
import {
  enqueueAnalyticsEvent,
  enqueueMembershipEmail,
  enqueueNotificationWrite,
} from "@/server/action-side-effects";
import { canViewAdminRoute } from "@/server/permissions";
import {
  balancedMatchWeights,
  matchTypeSlug,
  parseMatchDirection,
  validateMatchTypeConfig,
} from "@/lib/match-config";
import type { MatchFactorKey, MatchFactorWeights, MatchTypeConfig } from "@/lib/domain";
import {
  revokeMembershipInvitation,
  sendMembershipInvitation,
  syncMembershipClerkLifecycle,
} from "@/server/clerk-membership-lifecycle";
import { buildNotification, enqueueNotificationEmail } from "@/server/notifications";
import {
  createCohort,
  createManagedAccount,
  createIntroRequest,
  getCommentRecordById,
  getMembershipRecordById,
  getPostById,
  getProfileByMembershipId,
  getProfileRecordById,
  getUserById,
  importCohortMembers,
  listMatchTypeConfigsForOrg,
  promoteCohortMembers,
  recomputeMatchesForProfile,
  recomputeMatchesForOrg,
  saveMatchTypeConfig,
  updateCommentStatus,
  updateMembershipStatus,
  updateMembershipRole,
  updateOrganizationSettings,
  updatePostModeration,
  updateProfileFlags,
} from "@/server/store";
import { ensureClerkAdminOrganizationContext } from "@/server/clerk-sync";

async function requireAdminForAction(slug: string) {
  const viewer = await getViewerContextForAction(slug);

  if (
    !viewer ||
    !viewer.canAdmin ||
    !canViewAdminRoute(viewer.user, viewer.membership)
  ) {
    throw new Error("Unauthorized.");
  }

  return {
    org: viewer.org,
    user: viewer.user,
    membership: viewer.membership,
  };
}

async function requireClerkAdminContextForAction(
  admin: Awaited<ReturnType<typeof requireAdminForAction>>,
) {
  const e2eContext = getE2ELocalClerkOrganizationContext();
  if (e2eContext && !isClerkConfigured()) {
    return { organizationId: e2eContext.orgId, userId: e2eContext.userId };
  }
  const clerkAuth = await auth();

  if (!clerkAuth.userId) {
    throw new Error("A Clerk user session is required.");
  }

  return ensureClerkAdminOrganizationContext({
    clerkUserId: clerkAuth.userId,
    membership: admin.membership,
    org: admin.org,
    user: admin.user,
  });
}

function membershipRole(value: FormDataEntryValue | null): MembershipRole {
  if (value === "org_admin" || value === "member") {
    return value;
  }
  throw new Error("Invalid membership role.");
}

function membershipStatus(value: FormDataEntryValue | null): MembershipStatus {
  if (
    value === "pending" ||
    value === "waitlist" ||
    value === "approved" ||
    value === "rejected" ||
    value === "suspended"
  ) {
    return value;
  }
  throw new Error("Invalid membership status.");
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

function cohortDetailStatusPath(slug: string, cohortId: string, status: string) {
  return `/org/${slug}/admin/cohorts/${cohortId}?status=${status}`;
}

function parseCohortStudentLines(raw: string) {
  const students = new Map<string, { email: string; name?: string }>();
  const invalidLines: number[] = [];
  let firstDataLine = true;
  raw
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) {
        return;
      }

      const [emailValue, ...nameValues] = line.split(",").map((value) => value.trim());
      if (firstDataLine && emailValue.toLowerCase() === "email") {
        firstDataLine = false;
        return;
      }
      firstDataLine = false;
      const normalizedEmail = emailValue.toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
        invalidLines.push(index + 1);
        return;
      }

      students.set(normalizedEmail, {
        email: normalizedEmail,
        name: nameValues.join(", ").trim() || undefined,
      });
    });

  return { invalidLines, students: [...students.values()] };
}

export async function createCohortAction(slug: string, formData: FormData) {
  const { org, membership } = await requireAdminForAction(slug);
  const cohort = await createCohort({
    orgId: org.id,
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    eventLabel: String(formData.get("event_label") ?? ""),
    createdByMembershipId: membership.id,
  });

  revalidatePath(`/org/${slug}/admin/cohorts`);
  redirect(`/org/${slug}/admin/cohorts/${cohort.id}?status=cohort_created`);
}

export async function importCohortStudentsAction(
  slug: string,
  cohortId: string,
  formData: FormData,
) {
  const admin = await requireAdminForAction(slug);
  const { org } = admin;
  const { invalidLines, students } = parseCohortStudentLines(
    String(formData.get("students") ?? ""),
  );

  if (invalidLines.length) {
    redirect(cohortDetailStatusPath(slug, cohortId, "cohort_import_invalid"));
  }
  if (!students.length) {
    redirect(cohortDetailStatusPath(slug, cohortId, "cohort_import_empty"));
  }
  if (students.length > 100) {
    redirect(cohortDetailStatusPath(slug, cohortId, "cohort_import_too_large"));
  }
  const e2eClerkContext = getE2ELocalClerkOrganizationContext();
  if (!isClerkConfigured() && !e2eClerkContext) {
    redirect(cohortDetailStatusPath(slug, cohortId, "cohort_clerk_unconfigured"));
  }
  let clerkContext = e2eClerkContext
    ? { organizationId: e2eClerkContext.orgId, userId: e2eClerkContext.userId }
    : undefined;
  if (!clerkContext) {
    try {
      clerkContext = await requireClerkAdminContextForAction(admin);
    } catch {
      redirect(cohortDetailStatusPath(slug, cohortId, "cohort_clerk_session_required"));
    }
  }

  const results = await importCohortMembers(org.id, cohortId, students);
  const pendingInvitations = results.filter((result) => result.shouldInvite && result.user);
  let invitationFailures = 0;
  let invitationSuccesses = 0;
  for (let index = 0; index < pendingInvitations.length; index += 10) {
    const batch = pendingInvitations.slice(index, index + 10);
    const settled = await Promise.allSettled(
      batch.map((result) =>
        sendMembershipInvitation({
          forceNew: result.membership.clerkInvitationStatus === "failed",
          inviterUserId: clerkContext.userId,
          membership: result.membership,
          org,
          user: result.user!,
        }),
      ),
    );
    invitationSuccesses += settled.filter((result) => result.status === "fulfilled").length;
    invitationFailures += settled.filter((result) => result.status === "rejected").length;
  }

  revalidatePath(`/org/${slug}/admin/cohorts`);
  revalidatePath(`/org/${slug}/admin/cohorts/${cohortId}`);
  revalidatePath(`/org/${slug}/admin/members`);
  const status = invitationFailures
    ? "cohort_students_partially_imported"
    : "cohort_students_imported";
  redirect(
    `${cohortDetailStatusPath(slug, cohortId, status)}&sent=${invitationSuccesses}&failed=${invitationFailures}`,
  );
}

export async function promoteCohortMembersAction(
  slug: string,
  cohortId: string,
  formData: FormData,
) {
  const { org } = await requireAdminForAction(slug);
  const membershipIds = formData
    .getAll("membership_id")
    .map((value) => String(value))
    .filter(Boolean);

  if (!membershipIds.length) {
    redirect(cohortDetailStatusPath(slug, cohortId, "cohort_no_selection"));
  }

  const results = await promoteCohortMembers(
    org.id,
    cohortId,
    membershipIds,
    String(formData.get("approval_note") ?? ""),
  );

  for (const result of results) {
    if (result.statusChanged) {
      enqueueNotificationWrite(
        buildNotification(
          `ntf_${nanoid(8)}`,
          org.id,
          result.membership.id,
          "membership_approved",
          "You’re approved for Wavespark",
          "Your membership request was approved. You can now access the feed and matches.",
          `/org/${slug}/feed`,
        ),
      );

      const emailRecipient =
        result.profile?.emailForIntro.trim() ||
        (await getUserById(result.membership.userId))?.email;
      if (emailRecipient) {
        const feedUrl = absoluteAppUrl(`/org/${slug}/feed`);
        enqueueNotificationEmail({
          to: emailRecipient,
          subject: "Your Wavespark membership is approved",
          html: `<p>You’re approved for Wavespark.</p><p>Visit <a href="${feedUrl}">the community feed</a> to get started.</p>`,
        });
      }
    }

    if (result.profile) {
      enqueueProfileMatchRecompute(slug, org.id, result.profile.id);
    }
  }

  revalidatePath(`/org/${slug}/admin/cohorts`);
  revalidatePath(`/org/${slug}/admin/cohorts/${cohortId}`);
  revalidatePath(`/org/${slug}/admin/members`);
  revalidatePath(`/org/${slug}/pending`);
  redirect(cohortDetailStatusPath(slug, cohortId, "cohort_members_promoted"));
}

export async function createManagedAccountAction(slug: string, formData: FormData) {
  const admin = await requireAdminForAction(slug);
  const { org } = admin;
  const email = String(formData.get("email") ?? "");
  const name = String(formData.get("name") ?? "");
  const role = membershipRole(formData.get("role") ?? "member");
  const requestedStatus = membershipStatus(formData.get("status") ?? "pending");
  const status = role === "org_admin" ? "approved" : requestedStatus;
  const clerkContext = await requireClerkAdminContextForAction(admin);

  const { membership, user } = await createManagedAccount({
    orgId: org.id,
    email,
    name,
    createPasswordCredential: false,
    role,
    status,
  });

  let failed = false;
  try {
    await sendMembershipInvitation({
      forceNew: membership.clerkInvitationStatus === "failed",
      inviterUserId: clerkContext.userId,
      membership,
      org,
      user,
    });
  } catch {
    failed = true;
  }

  revalidatePath(`/org/${slug}/admin/members`);
  redirect(
    `/org/${slug}/admin/members?status=${failed ? "member_invite_failed" : "member_invited"}`,
  );
}

export async function updateMembershipAction(slug: string, membershipId: string, formData: FormData) {
  const admin = await requireAdminForAction(slug);
  const { org } = admin;
  const clerkContext = await requireClerkAdminContextForAction(admin);
  const targetRecord = await getMembershipRecordById(membershipId);
  const targetMembership = targetRecord?.membership;
  const targetProfile = targetRecord?.profile;
  const targetUser = targetRecord?.user;
  if (!targetMembership || !targetUser || targetMembership.orgId !== org.id) {
    throw new Error("Unauthorized.");
  }
  const nextRole = membershipRole(formData.get("role") ?? targetMembership.role);
  const nextStatus = membershipStatus(formData.get("status") ?? targetMembership.status);
  const previousStatus = targetMembership.status;
  if (
    targetMembership.id === admin.membership.id &&
    (nextRole !== "org_admin" || nextStatus !== "approved")
  ) {
    throw new Error("You cannot remove your own active admin access.");
  }

  const roleUpdated = await updateMembershipRole(membershipId, nextRole, {
    existingMembership: targetMembership,
  });
  const membership = await updateMembershipStatus(
    membershipId,
    nextStatus,
    String(formData.get("approval_note") ?? ""),
    { existingMembership: roleUpdated ?? targetMembership, recomputeMatches: false },
  );

  if (!org || !membership) {
    return;
  }

  if (targetProfile) {
    enqueueProfileMatchRecompute(slug, org.id, targetProfile.id);
  }

  let clerkFailed = false;
  try {
    await syncMembershipClerkLifecycle({
      actorUserId: clerkContext.userId,
      membership,
      org,
      user: targetUser,
    });
  } catch {
    clerkFailed = true;
  }

  if (previousStatus !== "approved" && membership.status === "approved") {
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
  redirect(
    `/org/${slug}/admin/members?status=${clerkFailed ? "membership_clerk_failed" : "membership_updated"}`,
  );
}

export async function resendMembershipInvitationAction(slug: string, membershipId: string) {
  const admin = await requireAdminForAction(slug);
  const clerkContext = await requireClerkAdminContextForAction(admin);
  const record = await getMembershipRecordById(membershipId);
  if (!record?.user || record.membership.orgId !== admin.org.id) {
    throw new Error("Unauthorized.");
  }
  let failed = false;
  try {
    await sendMembershipInvitation({
      forceNew: true,
      inviterUserId: clerkContext.userId,
      membership: record.membership,
      org: admin.org,
      user: record.user,
    });
  } catch {
    failed = true;
  }
  revalidatePath(`/org/${slug}/admin/members`);
  revalidatePath(`/org/${slug}/admin/cohorts`);
  redirect(
    `/org/${slug}/admin/members?status=${failed ? "member_invite_failed" : "member_invited"}`,
  );
}

export async function revokeMembershipInvitationAction(slug: string, membershipId: string) {
  const admin = await requireAdminForAction(slug);
  const clerkContext = await requireClerkAdminContextForAction(admin);
  const record = await getMembershipRecordById(membershipId);
  if (!record?.user || record.membership.orgId !== admin.org.id) {
    throw new Error("Unauthorized.");
  }
  let failed = false;
  try {
    await revokeMembershipInvitation({
      actorUserId: clerkContext.userId,
      membership: record.membership,
      org: admin.org,
      user: record.user,
    });
  } catch {
    failed = true;
  }
  revalidatePath(`/org/${slug}/admin/members`);
  redirect(
    `/org/${slug}/admin/members?status=${failed ? "member_invite_failed" : "member_invite_revoked"}`,
  );
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
  if (["ask", "opportunity", "looking_for_cofounder", "looking_for_mentor"].includes(post.type)) {
    const profile = await getProfileByMembershipId(post.authorMembershipId);
    if (profile) enqueueProfileMatchRecompute(slug, org.id, profile.id);
  }

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

export async function createManualIntroAction(slug: string, formData: FormData) {
  const { org, membership: adminMembership } = await requireAdminForAction(slug);
  const requesterMembershipId = String(formData.get("requester_membership_id") ?? "");
  const receiverMembershipId = String(formData.get("receiver_membership_id") ?? "");
  if (!requesterMembershipId || requesterMembershipId === receiverMembershipId) {
    throw new Error("Unauthorized.");
  }
  const [requesterRecord, receiverRecord] = await Promise.all([
    getMembershipRecordById(requesterMembershipId),
    getMembershipRecordById(receiverMembershipId),
  ]);
  const requesterMembership = requesterRecord?.membership;
  const receiverMembership = receiverRecord?.membership;
  if (
    !requesterMembership ||
    !receiverMembership ||
    requesterMembership.orgId !== org.id ||
    receiverMembership.orgId !== org.id ||
    requesterMembership.status !== "approved" ||
    receiverMembership.status !== "approved" ||
    !requesterRecord.profile?.introOptIn ||
    !receiverRecord.profile?.introOptIn
  ) {
    throw new Error("Both members must be approved and available for introductions.");
  }

  const intro = await createIntroRequest({
    orgId: org.id,
    requesterMembershipId: requesterMembership.id,
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
      requesterMembershipId: intro.requesterMembershipId,
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

const matchFactorKeys: MatchFactorKey[] = [
  "semantic",
  "skills",
  "venture",
  "availability",
  "work_style",
  "location",
];

function matchWeightsFromFormData(formData: FormData): MatchFactorWeights {
  return Object.fromEntries(
    matchFactorKeys.map((key) => {
      const value = Number(formData.get(`weight_${key}`));
      return [key, Number.isFinite(value) ? value : balancedMatchWeights[key]];
    }),
  ) as MatchFactorWeights;
}

export async function saveMatchTypeConfigAction(
  slug: string,
  existingSlug: string | null,
  formData: FormData,
) {
  const { org } = await requireAdminForAction(slug);
  const configs = await listMatchTypeConfigsForOrg(org.id, { includeInactive: true });
  const existing = existingSlug
    ? configs.find((config) => config.slug === existingSlug)
    : undefined;
  if (existingSlug && !existing) {
    throw new Error("Matching type not found.");
  }

  const name = String(formData.get("name") ?? "").trim();
  const nextSlug = existing?.slug ?? matchTypeSlug(name);
  const weights = matchWeightsFromFormData(formData);
  const minimumScore = Number(formData.get("minimum_score") ?? 45);
  const directionValue = String(formData.get("direction") ?? "mutual");
  const description = String(formData.get("description") ?? "").trim();
  const seekerLabel = String(formData.get("seeker_label") ?? "").trim();
  const providerLabel = String(formData.get("provider_label") ?? "").trim();
  const active = formData.get("active") === "on";
  const errors = validateMatchTypeConfig({
    name,
    description,
    direction: directionValue,
    seekerLabel,
    providerLabel,
    minimumScore,
    weights,
  });
  if (!nextSlug || (!existing && configs.some((config) => config.slug === nextSlug))) {
    errors.push("A matching type with this name already exists.");
  }
  if (
    configs.some(
      (config) =>
        config.id !== existing?.id && config.name.toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.push("Matching type names must be unique.");
  }
  if (active && !existing?.active && configs.filter((config) => config.active).length >= 12) {
    errors.push("An organization can have at most 12 active matching types.");
  }
  if (errors.length) {
    redirect(`/org/${slug}/admin/matches?status=match_type_invalid`);
  }

  const now = new Date().toISOString();
  const config: MatchTypeConfig = {
    id: existing?.id ?? `mtc_${nanoid(8)}`,
    orgId: org.id,
    slug: nextSlug,
    name,
    description,
    direction: parseMatchDirection(directionValue),
    seekerLabel,
    providerLabel,
    weights,
    minimumScore,
    active,
    version: (existing?.version ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await saveMatchTypeConfig(config);
  after(async () => {
    try {
      await recomputeMatchesForOrg(org.id);
      revalidatePath(`/org/${slug}/matches`);
      revalidatePath(`/org/${slug}/onboarding`);
    } catch (error) {
      console.error("[wavesparks] match type recompute failed", config.slug, error);
    }
  });
  revalidatePath(`/org/${slug}/admin/matches`);
  redirect(`/org/${slug}/admin/matches?status=match_type_saved`);
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

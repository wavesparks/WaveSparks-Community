"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { nanoid } from "nanoid";

import { getViewerContextForAction } from "@/lib/auth";
import {
  getCommunityDisplayName,
  WAVESPARKS_COMMUNITY_NAME,
} from "@/lib/community-copy";
import { getE2ELocalClerkOrganizationContext } from "@/lib/e2e-local-auth";
import { isClerkConfigured } from "@/lib/env";
import type {
  AccountStatus,
  MembershipRole,
  SpaceAccessStatus,
  SpaceLifecycle,
} from "@/lib/domain";
import { requireSpaceAccessForAction } from "@/lib/space-auth";
import type {
  MemberImportPreviewRequest,
  MemberImportResult,
  MemberImportResultRow,
} from "@/lib/member-import";
import {
  getPostCommentRevalidationPaths,
  getSpacePostCommentRevalidationPaths,
} from "@/lib/post-action-routing";
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
  sendMembershipInvitationsBulk,
  syncMembershipClerkLifecycle,
} from "@/server/clerk-membership-lifecycle";
import {
  buildNotification,
  enqueueNotificationEmail,
  sendNotificationEmail,
} from "@/server/notifications";
import {
  addMembershipsToMainCommunity,
  archiveCohort,
  archiveEventSpace,
  bulkImportMembersForOrg,
  createCohort,
  createEventSpace,
  createManagedAccount,
  createIntroRequestInSpace,
  getCommentRecordById,
  getMembershipRecordById,
  getPostById,
  getSpaceById,
  getProfileRecordById,
  importCohortMembers,
  grantSpaceMembership,
  listMemberImportCandidatesForOrg,
  listMembershipRecordsByIds,
  listSpaceMembershipRecordsByMembershipIds,
  listSpacesForOrg,
  listMatchTypeConfigsForOrg,
  recomputeMatchesForProfile,
  recomputeMatchesForOrg,
  recomputeMatchesForSpace,
  saveMatchTypeConfig,
  restoreEventSpace,
  setSpaceMembershipAccessStatus,
  updateCommentStatus,
  updateCohort,
  updateEventSpace,
  updateMembershipAccountStatus,
  updateMembershipClerkState,
  updateMembershipRole,
  updateOrganizationSettings,
  updatePostModeration,
  updateProfileFlags,
} from "@/server/store";
import { ensureClerkAdminOrganizationContext } from "@/server/clerk-sync";
import { buildMemberImportPreview } from "@/server/member-import";

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
    throw new Error("Sign in again to continue.");
  }

  try {
    return await ensureClerkAdminOrganizationContext({
      clerkUserId: clerkAuth.userId,
      membership: admin.membership,
      org: admin.org,
      user: admin.user,
    });
  } catch (error) {
    console.error("[wavesparks] Invitation account setup failed", admin.membership.id, error);
    throw new Error("Invitations are unavailable right now. Try again in a few minutes.");
  }
}

function membershipRole(value: FormDataEntryValue | null): MembershipRole {
  if (value === "org_admin" || value === "member") {
    return value;
  }
  throw new Error("Choose Member or Administrator.");
}

function importSpaceAccessStatus(
  value: FormDataEntryValue | null,
): Extract<SpaceAccessStatus, "active" | "waitlist"> {
  if (value === "active" || value === "waitlist") return value;
  throw new Error("Choose active access or waitlist.");
}

function spaceAccessStatus(value: FormDataEntryValue | null): SpaceAccessStatus {
  if (
    value === "active" ||
    value === "waitlist" ||
    value === "rejected" ||
    value === "suspended" ||
    value === "removed"
  ) {
    return value;
  }
  throw new Error("Choose a valid access status.");
}

function accountStatus(value: FormDataEntryValue | null): AccountStatus {
  if (
    value === "invited" ||
    value === "connected" ||
    value === "suspended" ||
    value === "deprovisioned"
  ) {
    return value;
  }
  throw new Error("Choose a valid account status.");
}

async function sendExplicitMembershipInvitation(
  input: Parameters<typeof sendMembershipInvitation>[0],
) {
  const result = await sendMembershipInvitation(input);
  if (result.kind !== "membership") {
    return result;
  }

  const signInUrl = absoluteAppUrl(`/org/${input.org.slug}/signin`);
  try {
    await sendNotificationEmail({
      to: input.user.email,
      subject: "Your Wavesparks invitation",
      html: `<p>Your Wavesparks account is ready.</p><p><a href="${signInUrl}">Sign in</a> to open the community or event you were invited to.</p>`,
    });
  } catch (error) {
    console.error("[wavesparks] Invitation notification email failed", input.membership.id, error);
    await updateMembershipClerkState(input.membership.id, {
      clerkInvitationError: "Invitation email failed. Try again.",
      clerkInvitationUpdatedAt: new Date().toISOString(),
    });
    throw new Error("The account is ready, but the notification email could not be sent. Try again.");
  }
  return result;
}

async function sendExplicitMembershipInvitationsBulk(
  inputs: Parameters<typeof sendMembershipInvitationsBulk>[0],
) {
  const outcomes = await sendMembershipInvitationsBulk(inputs);
  const inputsByMembershipId = new Map(
    inputs.map((input) => [input.membership.id, input]),
  );

  for (const outcome of outcomes) {
    if (outcome.error || outcome.result?.kind !== "membership") {
      continue;
    }
    const input = inputsByMembershipId.get(outcome.membershipId);
    if (!input) {
      continue;
    }

    const signInUrl = absoluteAppUrl(`/org/${input.org.slug}/signin`);
    try {
      await sendNotificationEmail({
        to: input.user.email,
        subject: "Your Wavesparks invitation",
        html: `<p>Your Wavesparks account is ready.</p><p><a href="${signInUrl}">Sign in</a> to open the community or event you were invited to.</p>`,
      });
    } catch (error) {
      console.error("[wavesparks] Invitation notification email failed", input.membership.id, error);
      const message = "The account is ready, but the notification email could not be sent. Try again.";
      await updateMembershipClerkState(input.membership.id, {
        clerkInvitationError: "Invitation email failed. Try again.",
        clerkInvitationUpdatedAt: new Date().toISOString(),
      });
      outcome.error = message;
      outcome.result = undefined;
    }
  }

  return outcomes;
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

function enqueueSpaceMatchRecompute(slug: string, spaceId: string) {
  after(async () => {
    try {
      await recomputeMatchesForSpace(spaceId);
      revalidatePath(`/org/${slug}/admin/spaces/${spaceId}`);
    } catch (error) {
      console.error("[wavesparks] Space match recompute failed", spaceId, error);
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

function memberImportResult(
  rows: MemberImportResultRow[],
  spaceAdded = 0,
): MemberImportResult {
  const summary = {
    invited: rows.filter((row) => row.status === "invited").length,
    connected: rows.filter((row) => row.status === "connected").length,
    cohortAdded: spaceAdded,
    skipped: rows.filter((row) => row.status === "skipped").length,
    failed: rows.filter((row) => row.status === "failed").length,
  };
  return {
    rows,
    summary: { ...summary, spaceAdded },
  };
}

export async function previewMemberImportAction(
  slug: string,
  input: MemberImportPreviewRequest,
) {
  const { org } = await requireAdminForAction(slug);
  return buildMemberImportPreview(org, input);
}

export async function confirmMemberImportAction(
  slug: string,
  input: MemberImportPreviewRequest,
): Promise<MemberImportResult> {
  const admin = await requireAdminForAction(slug);
  const { org } = admin;
  const preview = await buildMemberImportPreview(org, input);
  const actionableRows = preview.rows.filter(
    (row) =>
      row.classification === "ready" ||
      row.classification === "retryable" ||
      ((row.spaceAction === "grant" || row.spaceAction === "activate_waitlist") &&
        (row.classification === "already_connected" ||
          row.classification === "already_invited" ||
          row.classification === "existing_member")),
  );

  if (!actionableRows.length) {
    return memberImportResult(
      preview.rows.map((row) => ({
        rowNumber: row.rowNumber,
        email: row.email,
        name: row.name,
        normalizedEmail: row.normalizedEmail,
        status: "skipped",
        membershipId: row.membershipId,
        message: row.message,
        retryable: false,
      })),
    );
  }

  const importMembers = actionableRows.map((row) => ({
    email: row.normalizedEmail,
    name: row.name,
    rowNumber: row.rowNumber,
  }));
  const imported = await bulkImportMembersForOrg({
    orgId: org.id,
    destinationSpaceId: preview.destinationSpaceId,
    members: importMembers,
    accessStatus: preview.accessStatus,
    invitedByUserId: admin.user.id,
  });
  const invitationInputs = imported.filter(
    (result) => result.shouldInvite && result.classification !== "conflict",
  );
  const clerkContext = invitationInputs.length
    ? await requireClerkAdminContextForAction(admin)
    : undefined;
  const invitationRequests = invitationInputs.map((result) => ({
    forceNew: result.membership.clerkInvitationStatus === "failed",
    inviterUserId: clerkContext!.userId,
    membership: result.membership,
    org,
    user: result.user,
  }));
  const outcomes = invitationRequests.length
    ? await sendExplicitMembershipInvitationsBulk(invitationRequests)
    : [];
  const outcomesByMembershipId = new Map(
    outcomes.map((outcome) => [outcome.membershipId, outcome]),
  );
  const importedByEmail = new Map(
    imported.map((result) => [result.input.email, result]),
  );
  const rows: MemberImportResultRow[] = preview.rows.map((row) => {
    if (
      row.classification === "invalid" ||
      row.classification === "duplicate" ||
      row.classification === "inactive_conflict"
    ) {
      return {
        rowNumber: row.rowNumber,
        email: row.email,
        name: row.name,
        normalizedEmail: row.normalizedEmail,
        status: "skipped",
        membershipId: row.membershipId,
        message: row.message,
        retryable: false,
      };
    }

    const importResult = importedByEmail.get(row.normalizedEmail);
    if (!importResult) {
      return {
        rowNumber: row.rowNumber,
        email: row.email,
        name: row.name,
        normalizedEmail: row.normalizedEmail,
        status: "skipped",
        membershipId: row.membershipId,
        message: row.message,
        retryable: false,
      };
    }
    if (importResult.classification === "conflict") {
      const conflictMessage = importResult.conflictReason === "account_suspended"
        ? "This account is paused. Restore it in member details before continuing."
        : importResult.conflictReason === "deprovisioned"
          ? "This account is closed. Restore it in member details before continuing."
          : "Access is currently paused or removed. Review it in member details before continuing.";
      return {
        rowNumber: row.rowNumber,
        email: row.email,
        name: row.name,
        normalizedEmail: row.normalizedEmail,
        status: "skipped",
        membershipId: importResult.membership.id,
        message: conflictMessage,
        retryable: false,
      };
    }

    const outcome = outcomesByMembershipId.get(importResult.membership.id);
    const spaceChanged =
      importResult.spaceMembershipCreated || importResult.spaceMembershipUpdated;
    const spaceMessage = spaceChanged
      ? ` Access to ${preview.destinationSpaceName} added.`
      : "";
    if (outcome?.error) {
      return {
        rowNumber: row.rowNumber,
        email: row.email,
        name: row.name,
        normalizedEmail: row.normalizedEmail,
        status: "failed",
        membershipId: importResult.membership.id,
        message: `${outcome.error}${spaceMessage}`,
        retryable: true,
      };
    }
    if (outcome?.result?.kind === "invitation") {
      return {
        rowNumber: row.rowNumber,
        email: row.email,
        name: row.name,
        normalizedEmail: row.normalizedEmail,
        status: "invited",
        membershipId: importResult.membership.id,
        message: `Invitation created.${spaceMessage}`,
        retryable: false,
      };
    }
    if (outcome?.result?.kind === "membership") {
      return {
        rowNumber: row.rowNumber,
        email: row.email,
        name: row.name,
        normalizedEmail: row.normalizedEmail,
        status: "connected",
        membershipId: importResult.membership.id,
        message: `Existing account connected.${spaceMessage}`,
        retryable: false,
      };
    }
    if (spaceChanged) {
      return {
        rowNumber: row.rowNumber,
        email: row.email,
        name: row.name,
        normalizedEmail: row.normalizedEmail,
        status: "space_added",
        membershipId: importResult.membership.id,
        message: `Existing account added to ${preview.destinationSpaceName}.`,
        retryable: false,
      };
    }
    return {
      rowNumber: row.rowNumber,
      email: row.email,
      name: row.name,
      normalizedEmail: row.normalizedEmail,
      status: "skipped",
      membershipId: importResult.membership.id,
      message: row.message,
      retryable: false,
    };
  });

  revalidatePath(`/org/${slug}/admin/members`);
  revalidatePath(`/org/${slug}/admin/cohorts`);
  revalidatePath(`/org/${slug}/admin/spaces`);
  revalidatePath(`/org/${slug}/admin/spaces/${preview.destinationSpaceId}`);
  if (preview.cohortId) revalidatePath(`/org/${slug}/admin/cohorts/${preview.cohortId}`);
  enqueueSpaceMatchRecompute(slug, preview.destinationSpaceId);
  return memberImportResult(
    rows,
    imported.filter(
      (result) => result.spaceMembershipCreated || result.spaceMembershipUpdated,
    ).length,
  );
}

export async function retryMemberInvitationsAction(
  slug: string,
  membershipIds: string[],
): Promise<MemberImportResult> {
  const admin = await requireAdminForAction(slug);
  const ids = [...new Set(membershipIds.map(String).filter(Boolean))];
  if (ids.length > 100) {
    throw new Error("Retry no more than 100 invitations at a time.");
  }
  const records = await listMembershipRecordsByIds(ids, { orgId: admin.org.id });
  const retryableInvitations = records.filter(
    (record) =>
      record.user &&
      !record.membership.clerkMembershipId &&
      (record.membership.clerkInvitationStatus === "failed" ||
        record.membership.clerkInvitationStatus === "expired" ||
      record.membership.clerkInvitationStatus === "revoked") &&
      record.membership.accountStatus !== "suspended" &&
      record.membership.accountStatus !== "deprovisioned",
  );
  const retryableNotifications = records.filter(
    (record) =>
      record.user &&
      Boolean(record.membership.clerkMembershipId) &&
      record.membership.clerkInvitationError?.startsWith("Invitation email failed:") &&
      record.membership.accountStatus !== "suspended" &&
      record.membership.accountStatus !== "deprovisioned",
  );
  const clerkContext = retryableInvitations.length
    ? await requireClerkAdminContextForAction(admin)
    : undefined;
  const outcomes = retryableInvitations.length
    ? await sendExplicitMembershipInvitationsBulk(
        retryableInvitations.map((record) => ({
          forceNew: true,
          inviterUserId: clerkContext!.userId,
          membership: record.membership,
          org: admin.org,
          user: record.user!,
        })),
      )
    : [];
  const outcomesByMembershipId = new Map(
    outcomes.map((outcome) => [outcome.membershipId, outcome]),
  );
  const notificationOutcomes = new Map<
    string,
    { error?: string; sent: boolean }
  >();
  for (const record of retryableNotifications) {
    try {
      await sendNotificationEmail({
        to: record.user!.email,
        subject: "Your Wavesparks invitation",
        html: `<p>Your Wavesparks account is ready.</p><p><a href="${absoluteAppUrl(`/org/${admin.org.slug}/signin`)}">Sign in</a> to open the community or event you were invited to.</p>`,
      });
      await updateMembershipClerkState(record.membership.id, {
        clerkInvitationError: null,
        clerkInvitationUpdatedAt: new Date().toISOString(),
      });
      notificationOutcomes.set(record.membership.id, { sent: true });
    } catch (error) {
      console.error("[wavesparks] Invitation notification email failed", record.membership.id, error);
      const message = "The account is ready, but the notification email could not be sent. Try again.";
      await updateMembershipClerkState(record.membership.id, {
        clerkInvitationError: "Invitation email failed. Try again.",
        clerkInvitationUpdatedAt: new Date().toISOString(),
      });
      notificationOutcomes.set(record.membership.id, {
        error: message,
        sent: false,
      });
    }
  }
  const rows = records.map<MemberImportResultRow>((record, index) => {
    const email = record.user?.email ?? "";
    const base = {
      rowNumber: index + 1,
      email,
      name: record.user?.name ?? "",
      normalizedEmail: email.toLowerCase(),
      membershipId: record.membership.id,
    };
    const notificationOutcome = notificationOutcomes.get(record.membership.id);
    if (notificationOutcome?.error) {
      return {
        ...base,
        status: "failed",
        message: notificationOutcome.error,
        retryable: true,
      };
    }
    if (notificationOutcome?.sent) {
      return {
        ...base,
        status: "connected",
        message: "Sign-in notification sent to the connected account.",
        retryable: false,
      };
    }
    const outcome = outcomesByMembershipId.get(record.membership.id);
    if (outcome?.error) {
      return {
        ...base,
        status: "failed",
        message: outcome.error,
        retryable: true,
      };
    }
    if (outcome?.result?.kind === "membership") {
      return {
        ...base,
        status: "connected",
        message: "Existing account connected.",
        retryable: false,
      };
    }
    if (outcome?.result?.kind === "invitation") {
      return {
        ...base,
        status: "invited",
        message: "Invitation created.",
        retryable: false,
      };
    }
    return {
      ...base,
      status: "skipped",
      message: "This invitation is no longer retryable.",
      retryable: false,
    };
  });

  if (retryableInvitations.length || retryableNotifications.length) {
    revalidatePath(`/org/${slug}/admin/members`);
    revalidatePath(`/org/${slug}/admin/cohorts`);
  }
  return memberImportResult(rows);
}

function eventLifecycle(value: FormDataEntryValue | null) {
  if (
    value === "draft" ||
    value === "upcoming" ||
    value === "active" ||
    value === "ended"
  ) {
    return value satisfies Extract<
      SpaceLifecycle,
      "draft" | "upcoming" | "active" | "ended"
    >;
  }
  throw new Error("Choose a valid Event status.");
}

function optionalFormValue(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

export async function createEventSpaceAction(slug: string, formData: FormData) {
  const { org, membership } = await requireAdminForAction(slug);
  const space = await createEventSpace({
    orgId: org.id,
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    eventLabel: String(formData.get("event_label") ?? ""),
    startsAt: optionalFormValue(formData.get("starts_at")),
    endsAt: optionalFormValue(formData.get("ends_at")),
    lifecycle: eventLifecycle(formData.get("lifecycle") ?? "draft"),
    matchingEnabled: formData.get("matching_enabled") === "on",
    createdByMembershipId: membership.id,
  });

  revalidatePath(`/org/${slug}/admin/spaces`);
  redirect(`/org/${slug}/admin/spaces/${space.id}?status=event_created`);
}

export async function updateEventSpaceAction(
  slug: string,
  spaceId: string,
  formData: FormData,
) {
  const { org } = await requireAdminForAction(slug);
  const space = await updateEventSpace(org.id, spaceId, {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    eventLabel: String(formData.get("event_label") ?? ""),
    startsAt: optionalFormValue(formData.get("starts_at")) ?? null,
    endsAt: optionalFormValue(formData.get("ends_at")) ?? null,
    lifecycle: eventLifecycle(formData.get("lifecycle")),
    matchingEnabled: formData.get("matching_enabled") === "on",
  });
  if (!space) throw new Error("Event not found.");

  revalidatePath(`/org/${slug}/admin/spaces`);
  revalidatePath(`/org/${slug}/admin/spaces/${spaceId}`);
  enqueueSpaceMatchRecompute(slug, spaceId);
  redirect(`/org/${slug}/admin/spaces/${spaceId}?status=event_updated`);
}

export async function archiveEventSpaceAction(slug: string, spaceId: string) {
  const { org } = await requireAdminForAction(slug);
  const space = await archiveEventSpace(org.id, spaceId);
  if (!space) throw new Error("Event not found.");
  revalidatePath(`/org/${slug}/admin/spaces`);
  revalidatePath(`/org/${slug}/admin/spaces/${spaceId}`);
  enqueueSpaceMatchRecompute(slug, spaceId);
  redirect(`/org/${slug}/admin/spaces?status=event_archived`);
}

export async function restoreEventSpaceAction(slug: string, spaceId: string) {
  const { org } = await requireAdminForAction(slug);
  const space = await restoreEventSpace(org.id, spaceId);
  if (!space) throw new Error("Event not found.");
  revalidatePath(`/org/${slug}/admin/spaces`);
  revalidatePath(`/org/${slug}/admin/spaces/${spaceId}`);
  enqueueSpaceMatchRecompute(slug, spaceId);
  redirect(`/org/${slug}/admin/spaces/${spaceId}?status=event_restored`);
}

export async function addMembersToMainCommunityAction(
  slug: string,
  sourceSpaceId: string,
  membershipIds: string[],
  decisionNote = "",
) {
  const admin = await requireAdminForAction(slug);
  const sourceSpace = await getSpaceById(sourceSpaceId);
  if (
    !sourceSpace ||
    sourceSpace.orgId !== admin.org.id ||
    sourceSpace.kind !== "event"
  ) {
    throw new Error("Source Event not found.");
  }
  const spaces = await listSpacesForOrg(admin.org.id);
  const mainSpace = spaces.find((space) => space.kind === "main");
  if (!mainSpace) throw new Error("Wavesparks Community is not configured.");

  const results = await addMembershipsToMainCommunity({
    orgId: admin.org.id,
    sourceSpaceId,
    membershipIds,
    actorMembershipId: admin.membership.id,
    decisionNote,
  });
  const records = await listMembershipRecordsByIds(
    results.map((result) => result.membershipId),
    { orgId: admin.org.id },
  );
  const recordsById = new Map(
    records.map((record) => [record.membership.id, record]),
  );
  const mainUrl = `/org/${slug}/s/${mainSpace.slug}`;
  for (const result of results) {
    if (result.status !== "added") continue;
    const record = recordsById.get(result.membershipId);
    if (!record) continue;
    enqueueNotificationWrite(
      buildNotification(
        `ntf_${nanoid(8)}`,
        admin.org.id,
        result.membershipId,
        "membership_approved",
        `You’ve been added to ${WAVESPARKS_COMMUNITY_NAME}`,
        `You can now join ${WAVESPARKS_COMMUNITY_NAME}. Your access to ${sourceSpace.name} is unchanged.`,
        mainUrl,
        mainSpace.id,
      ),
    );
    if (record.user?.email) {
      enqueueNotificationEmail({
        to: record.user.email,
        subject: `You’ve been added to ${WAVESPARKS_COMMUNITY_NAME}`,
        html: `<p>You can now join ${WAVESPARKS_COMMUNITY_NAME}.</p><p>Your access to ${sourceSpace.name} is unchanged.</p><p><a href="${absoluteAppUrl(mainUrl)}">Open ${WAVESPARKS_COMMUNITY_NAME}</a></p>`,
        membershipId: result.membershipId,
        spaceId: mainSpace.id,
        allowInvited: true,
      });
    }
  }

  revalidatePath(`/org/${slug}/admin/members`);
  revalidatePath(`/org/${slug}/admin/spaces`);
  revalidatePath(`/org/${slug}/admin/spaces/${sourceSpaceId}`);
  revalidatePath(`/org/${slug}/admin/spaces/${mainSpace.id}`);
  revalidatePath(`/org/${slug}/requests`);
  revalidatePath(`/org/${slug}/s/${mainSpace.slug}/requests`);
  if (results.some((result) => result.status === "added")) {
    enqueueSpaceMatchRecompute(slug, mainSpace.id);
  }

  const rows = results.map((result) => {
    const record = recordsById.get(result.membershipId);
    return {
      ...result,
      email: record?.user?.email ?? "Email unavailable",
      name:
        record?.profile?.preferredName ||
        record?.user?.name ||
        "Unnamed member",
    };
  });
  return {
    rows,
    summary: {
      added: rows.filter((row) => row.status === "added").length,
      alreadyInMain: rows.filter((row) => row.status === "already_in_main").length,
      accountConflict: rows.filter((row) => row.status === "account_conflict").length,
      failed: rows.filter((row) => row.status === "failed").length,
    },
  };
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

export async function updateCohortAction(
  slug: string,
  cohortId: string,
  formData: FormData,
) {
  const { org } = await requireAdminForAction(slug);
  const cohort = await updateCohort(org.id, cohortId, {
    name: String(formData.get("name") ?? ""),
    eventLabel: String(formData.get("event_label") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
  if (!cohort) {
    throw new Error("Cohort not found.");
  }

  revalidatePath(`/org/${slug}/admin/cohorts`);
  revalidatePath(`/org/${slug}/admin/cohorts/${cohortId}`);
  redirect(`/org/${slug}/admin/cohorts/${cohortId}?status=cohort_updated`);
}

export async function archiveCohortAction(slug: string, cohortId: string) {
  const { org } = await requireAdminForAction(slug);
  const cohort = await archiveCohort(org.id, cohortId);
  if (!cohort) {
    throw new Error("Cohort not found.");
  }

  revalidatePath(`/org/${slug}/admin/cohorts`);
  revalidatePath(`/org/${slug}/admin/cohorts/${cohortId}`);
  redirect(`/org/${slug}/admin/cohorts?status=cohort_archived`);
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

  const results = await importCohortMembers(org.id, cohortId, students, {
    invitedByUserId: admin.user.id,
  });
  const pendingInvitations = results.filter((result) => result.shouldInvite && result.user);
  let invitationFailures = 0;
  let invitationSuccesses = 0;
  for (let index = 0; index < pendingInvitations.length; index += 10) {
    const batch = pendingInvitations.slice(index, index + 10);
    const settled = await Promise.allSettled(
      batch.map((result) =>
        sendExplicitMembershipInvitation({
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
  await requireAdminForAction(slug);
  void cohortId;
  void formData;
  throw new Error(
    "This old event action is no longer available. Add participants to Wavesparks Community from the event page.",
  );
}

export async function createManagedAccountAction(slug: string, formData: FormData) {
  const admin = await requireAdminForAction(slug);
  const { org } = admin;
  const email = String(formData.get("email") ?? "");
  const name = String(formData.get("name") ?? "");
  const role = membershipRole(formData.get("role") ?? "member");
  if (role === "org_admin" && formData.get("confirm_admin_access") !== "on") {
    throw new Error("Confirm that you want to make this person an administrator.");
  }
  if (!formData.has("destination_space_id")) {
    throw new Error(
      "Choose where this person should be added.",
    );
  }
  const destinationSpaceId =
    String(formData.get("destination_space_id") ?? "").trim() || undefined;
  if (role === "member" && !destinationSpaceId) {
    throw new Error("Choose Wavesparks Community or an event for this person.");
  }
  const accessStatus = destinationSpaceId
    ? importSpaceAccessStatus(formData.get("space_access_status") ?? "active")
    : undefined;
  const destinationSpace = destinationSpaceId
    ? await getSpaceById(destinationSpaceId)
    : undefined;
  if (destinationSpaceId && (!destinationSpace || destinationSpace.orgId !== org.id)) {
    throw new Error("The selected community or event could not be found.");
  }
  if (destinationSpace?.lifecycle === "archived") {
    throw new Error("Restore this archived event before adding participants.");
  }
  const requestedReturnSpaceId = String(
    formData.get("return_to_space_id") ?? "",
  ).trim();
  const returnSpaceId =
    destinationSpaceId && requestedReturnSpaceId === destinationSpaceId
      ? destinationSpaceId
      : undefined;
  const resultPath = returnSpaceId
    ? `/org/${slug}/admin/spaces/${returnSpaceId}`
    : `/org/${slug}/admin/members`;
  const [existingCandidate] = await listMemberImportCandidatesForOrg(
    org.id,
    [email],
    destinationSpaceId,
  );
  if (existingCandidate?.membership) {
    const inactiveConflict =
      existingCandidate.membership.accountStatus === "suspended" ||
      existingCandidate.membership.accountStatus === "deprovisioned";
    if (inactiveConflict) {
      redirect(`${resultPath}?status=account_inactive_conflict`);
    }
    if (destinationSpaceId && accessStatus) {
      const grant = await grantSpaceMembership({
        orgId: org.id,
        spaceId: destinationSpaceId,
        membershipId: existingCandidate.membership.id,
        accessStatus,
        joinedVia: "direct",
        invitedByMembershipId: admin.membership.id,
      });
      if (grant.outcome === "conflict") {
        redirect(`${resultPath}?status=space_access_conflict`);
      }
      revalidatePath(`/org/${slug}/admin/members`);
      revalidatePath(`/org/${slug}/admin/spaces`);
      revalidatePath(`/org/${slug}/admin/spaces/${destinationSpaceId}`);
      enqueueSpaceMatchRecompute(slug, destinationSpaceId);
      redirect(`${resultPath}?status=member_added_to_space`);
    }
    redirect(`${resultPath}?status=member_existing`);
  }
  const clerkContext = await requireClerkAdminContextForAction(admin);

  const { membership, user } = await createManagedAccount({
    orgId: org.id,
    email,
    name: existingCandidate?.user?.name ?? name,
    createPasswordCredential: false,
    role,
    // Migration-era metadata only; role and Space entitlement are authoritative.
    status: "pending",
    invitedByUserId: admin.user.id,
  });

  if (destinationSpaceId && accessStatus) {
    const grant = await grantSpaceMembership({
      orgId: org.id,
      spaceId: destinationSpaceId,
      membershipId: membership.id,
      accessStatus,
      joinedVia: "direct",
      invitedByMembershipId: admin.membership.id,
    });
    if (grant.outcome === "conflict") {
      throw new Error("Review this person’s existing access in member details before continuing.");
    }
  }

  let failed = false;
  try {
    await sendExplicitMembershipInvitation({
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
  revalidatePath(`/org/${slug}/admin/spaces`);
  if (destinationSpaceId) {
    revalidatePath(`/org/${slug}/admin/spaces/${destinationSpaceId}`);
    enqueueSpaceMatchRecompute(slug, destinationSpaceId);
  }
  redirect(`${resultPath}?status=${failed ? "member_invite_failed" : "member_invited"}`);
}

export async function updateMembershipAction(slug: string, membershipId: string, formData: FormData) {
  const admin = await requireAdminForAction(slug);
  const { org } = admin;
  const targetRecord = await getMembershipRecordById(membershipId);
  const targetMembership = targetRecord?.membership;
  const targetUser = targetRecord?.user;
  if (!targetMembership || !targetUser || targetMembership.orgId !== org.id) {
    throw new Error("Unauthorized.");
  }
  if (!formData.has("account_status")) {
    throw new Error(
      "This old member action is no longer available. Manage account status and community or event access separately.",
    );
  }
  const nextRole = membershipRole(formData.get("role") ?? targetMembership.role);
  const affectedAccountSpaceIds = [
    ...new Set(
      (await listSpaceMembershipRecordsByMembershipIds(org.id, [membershipId]))
        .get(membershipId)
        ?.map((record) => record.space.id) ?? [],
    ),
  ];
  const nextAccountStatus = accountStatus(
    formData.get("account_status") ?? targetMembership.accountStatus,
  );
  if (
    targetMembership.id === admin.membership.id &&
    (nextRole !== "org_admin" ||
      nextAccountStatus === "suspended" ||
      nextAccountStatus === "deprovisioned")
  ) {
    throw new Error("You cannot remove your own active admin access.");
  }
  const roleUpdated = await updateMembershipRole(membershipId, nextRole, {
    existingMembership: targetMembership,
  });
  const membership = await updateMembershipAccountStatus(
    membershipId,
    nextAccountStatus,
    {
      adminNote: String(formData.get("approval_note") ?? ""),
      existingMembership: roleUpdated ?? targetMembership,
      recomputeMatches: false,
    },
  );

  if (!membership) return;

  const clerkContext = await requireClerkAdminContextForAction(admin);
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

  revalidatePath(`/org/${slug}/admin/members`);
  revalidatePath(`/org/${slug}/admin/spaces`);
  affectedAccountSpaceIds.forEach((spaceId) =>
    enqueueSpaceMatchRecompute(slug, spaceId),
  );
  redirect(
    `/org/${slug}/admin/members?status=${clerkFailed ? "membership_clerk_failed" : "membership_updated"}`,
  );
}

export async function updateMemberSpaceAccessAction(
  slug: string,
  membershipId: string,
  formData: FormData,
) {
  const admin = await requireAdminForAction(slug);
  const spaceId = String(formData.get("space_id") ?? "").trim();
  const nextAccessStatus = spaceAccessStatus(formData.get("access_status"));
  const [space, targetRecord] = await Promise.all([
    getSpaceById(spaceId),
    getMembershipRecordById(membershipId),
  ]);
  if (
    !space ||
    space.orgId !== admin.org.id ||
    !targetRecord ||
    targetRecord.membership.orgId !== admin.org.id
  ) {
    throw new Error("Unauthorized.");
  }

  await setSpaceMembershipAccessStatus({
    orgId: admin.org.id,
    spaceId,
    membershipId,
    accessStatus: nextAccessStatus,
    actorMembershipId: admin.membership.id,
    decisionNote: String(formData.get("decision_note") ?? ""),
    joinedVia: "direct",
  });

  revalidatePath(`/org/${slug}/admin/members`);
  revalidatePath(`/org/${slug}/admin/spaces`);
  revalidatePath(`/org/${slug}/admin/spaces/${spaceId}`);
  enqueueSpaceMatchRecompute(slug, spaceId);
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
    await sendExplicitMembershipInvitation({
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
  const space = post.spaceId ? await getSpaceById(post.spaceId) : undefined;
  if (post.spaceId && (!space || space.orgId !== org.id)) {
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
  if (
    space &&
    ["ask", "opportunity", "looking_for_cofounder", "looking_for_mentor"].includes(
      post.type,
    )
  ) {
    enqueueSpaceMatchRecompute(slug, space.id);
  }

  revalidatePath(`/org/${slug}/admin/posts`);
  for (const path of getPostCommentRevalidationPaths(slug, postId, post.type)) {
    revalidatePath(path);
  }
  if (space) {
    for (const path of getSpacePostCommentRevalidationPaths(
      slug,
      space.slug,
      postId,
      post.type,
    )) {
      revalidatePath(path);
    }
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
  const spaceId = String(formData.get("space_id") ?? "").trim();
  if (!spaceId) {
    throw new Error("Choose Wavesparks Community or an event for this introduction.");
  }
  const { space } = await requireSpaceAccessForAction({
    slug,
    spaceId,
    membershipId: adminMembership.id,
  });
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
    requesterMembership.accountStatus !== "connected" ||
    receiverMembership.accountStatus !== "connected" ||
    !requesterRecord.profile?.onboardingComplete ||
    !receiverRecord.profile?.onboardingComplete ||
    !requesterRecord.profile?.introOptIn ||
    !receiverRecord.profile?.introOptIn
  ) {
    throw new Error(
      "Both people must have connected accounts, complete profiles, and intro availability.",
    );
  }

  const note = String(formData.get("note") ?? "").trim();
  const suggestedFirstMessage = String(
    formData.get("suggested_first_message") ?? "",
  ).trim();
  if (!note || !suggestedFirstMessage) {
    throw new Error("Add a reason for the introduction and a short first message.");
  }

  const intro = await createIntroRequestInSpace({
    orgId: org.id,
    spaceId: space.id,
    requesterMembershipId: requesterMembership.id,
    receiverMembershipId: receiverMembership.id,
    sourceType: "admin_manual",
    sourceId: `manual_${nanoid(8)}`,
    introPurpose: String(formData.get("intro_purpose") ?? "general connection"),
    note,
    status: "pending",
    suggestedFirstMessage,
  }, { recordAnalytics: false });
  const communityName = getCommunityDisplayName(space);
  enqueueNotificationWrite(
    buildNotification(
      `ntf_${nanoid(8)}`,
      org.id,
      receiverMembership.id,
      "manual_intro",
      `A Wavesparks introduction in ${communityName}`,
      `The Wavesparks team suggested a connection for you in ${communityName}.`,
      `/org/${slug}/s/${space.slug}/requests`,
      space.id,
    ),
  );
  enqueueAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: org.id,
    spaceId: space.id,
    membershipId: adminMembership.id,
    eventName: "intro_requested",
    payload: {
      requesterMembershipId: intro.requesterMembershipId,
      receiverMembershipId: intro.receiverMembershipId,
      sourceType: intro.sourceType,
    },
    createdAt: intro.createdAt,
  });

  const requestsPath = `/org/${slug}/s/${space.slug}/requests`;
  const requestsUrl = absoluteAppUrl(requestsPath);
  enqueueMembershipEmail({
    membershipId: receiverMembership.id,
    spaceId: space.id,
    subject: `A Wavesparks introduction in ${communityName}`,
    html: `<p>The Wavesparks team suggested a connection for you in ${communityName}.</p><p>Open <a href="${requestsUrl}">your requests</a> to respond.</p>`,
  });

  revalidatePath(`/org/${slug}/admin/requests`);
  revalidatePath(`/org/${slug}/requests`);
  revalidatePath(requestsPath);
  redirect(
    `/org/${slug}/admin/requests?space_id=${encodeURIComponent(space.id)}&status=manual_intro_created`,
  );
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
  const space = commentRecord.post.spaceId
    ? await getSpaceById(commentRecord.post.spaceId)
    : undefined;
  if (
    commentRecord.post.spaceId &&
    (!space || space.orgId !== org.id)
  ) {
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
  if (space) {
    for (const path of getSpacePostCommentRevalidationPaths(
      slug,
      space.slug,
      commentRecord.post.id,
      commentRecord.post.type,
    )) {
      revalidatePath(path);
    }
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

import { beforeEach, describe, expect, it, vi } from "vitest";

import { seedOrganization } from "@/data/seed-data";
import type { ViewerContext } from "@/lib/domain";

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
const revalidatePathMock = vi.hoisted(() => vi.fn());
const afterMock = vi.hoisted(() => vi.fn());
const viewerRef = vi.hoisted(() => ({ current: null as ViewerContext | null }));
const createOrganizationInvitationMock = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_wavesparks";
  process.env.CLERK_SECRET_KEY = "sk_test_wavesparks";
  return vi.fn(async ({ emailAddress }: { emailAddress: string }) => ({
    id: `inv_${emailAddress}`,
    emailAddress,
    status: "pending",
  }));
});
const revokeOrganizationInvitationMock = vi.hoisted(() => vi.fn(async () => ({ id: "revoked" })));
const getOrganizationInvitationListMock = vi.hoisted(() =>
  vi.fn(async () => ({ data: [] })),
);
const getUserListMock = vi.hoisted(() => vi.fn(async () => ({ data: [] })));
const getOrganizationMembershipListMock = vi.hoisted(() =>
  vi.fn(async () => ({
    data: [{ id: "clerk_mem_admin", role: "org:admin" }],
  })),
);
const createOrganizationMembershipMock = vi.hoisted(() =>
  vi.fn(async ({ role }: { role: string }) => ({
    id: "clerk_mem_admin",
    role,
  })),
);
const updateOrganizationMembershipMock = vi.hoisted(() =>
  vi.fn(async ({ role }: { role: string }) => ({
    id: "clerk_mem_admin",
    role,
  })),
);
const authMock = vi.hoisted(() =>
  vi.fn(async () => ({
    has: vi.fn(({ role }: { role: string }) => role === "org:admin"),
    orgId: "org_clerk_wavespark",
    userId: "user_clerk_admin",
  })),
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/server", () => ({
  after: afterMock,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: vi.fn(async () => ({
    organizations: {
      createOrganizationInvitation: createOrganizationInvitationMock,
      createOrganizationMembership: createOrganizationMembershipMock,
      getOrganizationMembershipList: getOrganizationMembershipListMock,
      getOrganizationInvitationList: getOrganizationInvitationListMock,
      revokeOrganizationInvitation: revokeOrganizationInvitationMock,
      updateOrganizationMembership: updateOrganizationMembershipMock,
    },
    users: {
      getUserList: getUserListMock,
    },
  })),
}));

vi.mock("@/lib/auth", () => ({
  getViewerContextForAction: vi.fn(() => viewerRef.current),
}));

import {
  createCohortAction,
  createManagedAccountAction,
  importCohortStudentsAction,
  createManualIntroAction,
  moderateCommentAction,
  promoteCohortMembersAction,
  updatePostModerationAction,
  updateMembershipAction,
  updateProfileFlagsAction,
} from "@/actions/admin";
import {
  createComment,
  createCohort,
  getMembershipById,
  getProfileByMembershipId,
  getStore,
  getUserById,
  importCohortMembers,
  listCohortMemberRecordsForCohort,
  resetStore,
} from "@/server/store";
import { getNotificationViews } from "@/server/view-models";

async function setAdminViewer() {
  const membership = (await getMembershipById("mem_avery"))!;
  const user = (await getUserById(membership.userId))!;
  const profile = await getProfileByMembershipId(membership.id);

  viewerRef.current = {
    org: { ...seedOrganization, clerkOrgId: "org_clerk_wavespark" },
    user,
    membership,
    profile,
    canAdmin: true,
    scopes: ["org:admin", "org:member"],
  };

  return membership;
}

function formDataFromEntries(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

async function runAfterCallbacks() {
  const callbacks = afterMock.mock.calls.map(
    ([callback]) => callback as () => Promise<void>,
  );

  for (const callback of callbacks) {
    await callback();
  }
}

describe("admin server actions", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    viewerRef.current = null;
  });

  it("confirms the Clerk invitation before reporting success", async () => {
    await setAdminViewer();
    const formData = formDataFromEntries({
      email: "new.clerk.member@example.com",
      name: "New Clerk Member",
      role: "member",
      status: "approved",
    });

    await expect(
      createManagedAccountAction("wavespark", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/admin/members?status=member_invited");

    const user = getStore().users.find(
      (candidate) => candidate.email === "new.clerk.member@example.com",
    );
    const membership = getStore().memberships.find(
      (candidate) => candidate.userId === user?.id,
    );

    expect(user).toBeDefined();
    expect(membership).toMatchObject({
      clerkInvitationStatus: "pending",
      role: "member",
      status: "approved",
    });
    expect(createOrganizationInvitationMock).toHaveBeenCalledTimes(1);
    expect(afterMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/members");

    expect(createOrganizationInvitationMock).toHaveBeenCalledWith({
      emailAddress: "new.clerk.member@example.com",
      inviterUserId: "user_clerk_admin",
      organizationId: "org_clerk_wavespark",
      redirectUrl: "http://localhost:3000/org/wavespark/accept-invitation",
      role: "org:member",
      publicMetadata: {
        orgSlug: "wavespark",
        membershipId: membership?.id,
        membershipRole: "member",
      },
    });
  });

  it("records a failed Clerk invitation instead of reporting success", async () => {
    await setAdminViewer();
    createOrganizationInvitationMock.mockRejectedValueOnce(new Error("Clerk invitation failed"));
    const formData = formDataFromEntries({
      email: "failed.clerk.member@example.com",
      name: "Failed Clerk Member",
      role: "member",
      status: "pending",
    });

    await expect(createManagedAccountAction("wavespark", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavespark/admin/members?status=member_invite_failed",
    );

    const user = getStore().users.find(
      (candidate) => candidate.email === "failed.clerk.member@example.com",
    );
    const membership = getStore().memberships.find(
      (candidate) => candidate.userId === user?.id,
    );
    expect(membership).toMatchObject({
      clerkInvitationStatus: "failed",
      clerkInvitationError: "Clerk invitation failed",
      status: "pending",
    });
  });

  it("creates a cohort and redirects admins into the cohort detail", async () => {
    await setAdminViewer();
    const formData = formDataFromEntries({
      name: "Cohort Action Demo",
      event_label: "July 2026",
      description: "Action-created cohort.",
    });

    await expect(
      createCohortAction("wavespark", formData),
    ).rejects.toThrow(/NEXT_REDIRECT:\/org\/wavespark\/admin\/cohorts\/coh_/);

    const cohort = getStore().cohorts.find(
      (candidate) => candidate.name === "Cohort Action Demo",
    );

    expect(cohort).toMatchObject({
      eventLabel: "July 2026",
      orgId: seedOrganization.id,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/cohorts");
  });

  it("imports cohort students in confirmed Clerk batches", async () => {
    await setAdminViewer();
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Admin Import Cohort",
      createdByMembershipId: "mem_avery",
    });
    const formData = formDataFromEntries({
      students: "cohort.student@example.com,Cohort Student",
    });

    await expect(
      importCohortStudentsAction("wavespark", cohort.id, formData),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/org/wavespark/admin/cohorts/${cohort.id}?status=cohort_students_imported&sent=1&failed=0`,
    );

    const [record] = await listCohortMemberRecordsForCohort(seedOrganization.id, cohort.id);

    expect(record.membership.status).toBe("waitlist");
    expect(record.cohortMember).toMatchObject({
      invitedEmail: "cohort.student@example.com",
      status: "invited",
    });
    expect(createOrganizationInvitationMock).toHaveBeenCalledTimes(1);
    expect(afterMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/cohorts");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/org/wavespark/admin/cohorts/${cohort.id}`,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/members");

    expect(createOrganizationInvitationMock).toHaveBeenCalledWith({
      emailAddress: "cohort.student@example.com",
      inviterUserId: "user_clerk_admin",
      organizationId: "org_clerk_wavespark",
      redirectUrl: "http://localhost:3000/org/wavespark/accept-invitation",
      role: "org:member",
      publicMetadata: {
        orgSlug: "wavespark",
        membershipId: record.membership.id,
        membershipRole: "member",
      },
    });
  });

  it("keeps cohort import validation errors on the detail page", async () => {
    await setAdminViewer();
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Invalid Import Cohort",
      createdByMembershipId: "mem_avery",
    });
    const formData = formDataFromEntries({
      students: "\nemail,name\nnot-an-email,Missing At Sign",
    });

    await expect(
      importCohortStudentsAction("wavespark", cohort.id, formData),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/org/wavespark/admin/cohorts/${cohort.id}?status=cohort_import_invalid`,
    );

    expect(await listCohortMemberRecordsForCohort(seedOrganization.id, cohort.id)).toEqual([]);
    expect(afterMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("keeps empty cohort imports on the detail page", async () => {
    await setAdminViewer();
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Empty Import Cohort",
      createdByMembershipId: "mem_avery",
    });
    const formData = formDataFromEntries({ students: "email,name\n\n" });

    await expect(
      importCohortStudentsAction("wavespark", cohort.id, formData),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/org/wavespark/admin/cohorts/${cohort.id}?status=cohort_import_empty`,
    );

    expect(await listCohortMemberRecordsForCohort(seedOrganization.id, cohort.id)).toEqual([]);
    expect(afterMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("uses the linked Wavespark organization when no Clerk org is active", async () => {
    await setAdminViewer();
    authMock.mockResolvedValueOnce({
      has: vi.fn(() => false),
      orgId: "",
      userId: "user_clerk_admin",
    });
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Clerk Context Cohort",
      createdByMembershipId: "mem_avery",
    });
    const formData = formDataFromEntries({
      students: "clerk.context@example.com,Clerk Context",
    });

    await expect(
      importCohortStudentsAction("wavespark", cohort.id, formData),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/org/wavespark/admin/cohorts/${cohort.id}?status=cohort_students_imported&sent=1&failed=0`,
    );

    expect(await listCohortMemberRecordsForCohort(seedOrganization.id, cohort.id)).toHaveLength(1);
    expect(afterMock).not.toHaveBeenCalled();
    expect(createOrganizationInvitationMock).toHaveBeenCalledTimes(1);
  });

  it("promotes selected cohort members before notifying after the response", async () => {
    await setAdminViewer();
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Promotion Cohort",
      createdByMembershipId: "mem_avery",
    });
    const [imported] = await importCohortMembers(seedOrganization.id, cohort.id, [
      { email: "promote.student@example.com", name: "Promote Student" },
    ]);
    expect(imported.profile).toBeUndefined();
    const formData = new FormData();
    formData.append("membership_id", imported.membership.id);
    formData.set("approval_note", "Promoted from action test.");

    await expect(
      promoteCohortMembersAction("wavespark", cohort.id, formData),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/org/wavespark/admin/cohorts/${cohort.id}?status=cohort_members_promoted`,
    );

    const [record] = await listCohortMemberRecordsForCohort(seedOrganization.id, cohort.id);

    await expect(getMembershipById(imported.membership.id)).resolves.toMatchObject({
      status: "approved",
      approvalNote: "Promoted from action test.",
    });
    expect(record.cohortMember.status).toBe("promoted");
    expect(afterMock).toHaveBeenCalledTimes(2);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/cohorts");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/org/wavespark/admin/cohorts/${cohort.id}`,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/members");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/pending");

    await runAfterCallbacks();

    await expect(getNotificationViews(imported.membership.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: "Your membership request was approved. You can now access the feed and matches.",
          link: "/org/wavespark/feed",
        }),
      ]),
    );
  });

  it("creates a manual intro before writing receiver side effects after the response", async () => {
    const adminMembership = await setAdminViewer();
    const receiverMembership = (await getMembershipById("mem_jules"))!;
    const formData = formDataFromEntries({
      requester_membership_id: adminMembership.id,
      receiver_membership_id: receiverMembership.id,
      intro_purpose: "mentor guidance",
      note: "This intro is curated by an admin.",
    });

    await expect(
      createManualIntroAction("wavespark", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/admin/requests?status=manual_intro_created");

    const intro = getStore().introRequests.find(
      (request) =>
        request.requesterMembershipId === adminMembership.id &&
        request.receiverMembershipId === receiverMembership.id &&
        request.sourceType === "admin_manual",
    );
    expect(intro).toBeDefined();
    expect(
      getStore().analyticsEvents.some(
        (event) =>
          event.eventName === "intro_requested" &&
          event.payload.receiverMembershipId === receiverMembership.id &&
          event.payload.sourceType === "admin_manual",
      ),
    ).toBe(false);
    expect(
      getStore().introRequests.some(
        (request) =>
          request.requesterMembershipId === adminMembership.id &&
          request.receiverMembershipId === receiverMembership.id &&
          request.sourceType === "admin_manual",
      ),
    ).toBe(true);
    await expect(getNotificationViews(receiverMembership.id)).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          title: "An admin created an introduction for you",
          link: "/org/wavespark/requests",
        }),
      ]),
    );
    expect(afterMock).toHaveBeenCalledTimes(3);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/requests");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/requests");

    await runAfterCallbacks();

    await expect(getNotificationViews(receiverMembership.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "An admin created an introduction for you",
          link: "/org/wavespark/requests",
        }),
      ]),
    );
    expect(
      getStore().analyticsEvents.some(
        (event) =>
          event.eventName === "intro_requested" &&
          event.payload.receiverMembershipId === receiverMembership.id &&
          event.payload.sourceType === "admin_manual",
      ),
    ).toBe(true);
  });

  it("rejects manual intros with the same member or an opted-out participant", async () => {
    const adminMembership = await setAdminViewer();
    const sameMemberForm = formDataFromEntries({
      requester_membership_id: adminMembership.id,
      receiver_membership_id: adminMembership.id,
      intro_purpose: "invalid self intro",
    });

    await expect(createManualIntroAction("wavespark", sameMemberForm)).rejects.toThrow(
      "Unauthorized.",
    );

    const receiverProfile = getStore().profiles.find(
      (profile) => profile.membershipId === "mem_jules",
    );
    if (!receiverProfile) {
      throw new Error("Seed receiver profile missing.");
    }
    receiverProfile.introOptIn = false;
    const optedOutForm = formDataFromEntries({
      requester_membership_id: adminMembership.id,
      receiver_membership_id: "mem_jules",
      intro_purpose: "invalid opted-out intro",
    });

    await expect(createManualIntroAction("wavespark", optedOutForm)).rejects.toThrow(
      "Both members must be approved and available for introductions.",
    );
    expect(
      getStore().introRequests.some(
        (request) =>
          request.sourceType === "admin_manual" &&
          request.receiverMembershipId === "mem_jules",
      ),
    ).toBe(false);
  });

  it("updates membership status before recomputing matches after the response", async () => {
    await setAdminViewer();
    const formData = formDataFromEntries({
      status: "approved",
      approval_note: "Approved after profile review.",
    });

    await expect(
      updateMembershipAction("wavespark", "mem_priya", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/admin/members?status=membership_updated");

    await expect(getMembershipById("mem_priya")).resolves.toMatchObject({
      status: "approved",
    });
    await expect(getNotificationViews("mem_priya")).resolves.toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          body: "Your membership request was approved. You can now access the feed and matches.",
          link: "/org/wavespark/feed",
        }),
      ]),
    );
    expect(afterMock).toHaveBeenCalledTimes(3);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/members");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/pending");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/org/wavespark/matches");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/org/wavespark/admin/matches");

    await runAfterCallbacks();

    await expect(getNotificationViews("mem_priya")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: "Your membership request was approved. You can now access the feed and matches.",
          link: "/org/wavespark/feed",
        }),
      ]),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/matches");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/matches");
  });

  it("does not resend approval notifications or reset approvedAt on duplicate saves", async () => {
    await setAdminViewer();
    const formData = formDataFromEntries({
      status: "approved",
      approval_note: "Approved once.",
    });

    await expect(updateMembershipAction("wavespark", "mem_priya", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavespark/admin/members?status=membership_updated",
    );
    await runAfterCallbacks();
    const firstApprovedAt = (await getMembershipById("mem_priya"))?.approvedAt;
    const approvalNotificationCount = () =>
      getStore().notifications.filter(
        (notification) =>
          notification.membershipId === "mem_priya" &&
          notification.type === "membership_approved",
      ).length;
    expect(firstApprovedAt).toBeTruthy();
    expect(approvalNotificationCount()).toBe(1);

    vi.clearAllMocks();
    const duplicateFormData = formDataFromEntries({
      status: "approved",
      approval_note: "Saved again without a state transition.",
    });
    await expect(
      updateMembershipAction("wavespark", "mem_priya", duplicateFormData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/admin/members?status=membership_updated");

    expect(afterMock).toHaveBeenCalledTimes(1);
    await runAfterCallbacks();
    expect((await getMembershipById("mem_priya"))?.approvedAt).toBe(firstApprovedAt);
    expect(approvalNotificationCount()).toBe(1);
  });

  it("updates profile flags before recomputing matches after the response", async () => {
    await setAdminViewer();
    const profile = (await getProfileByMembershipId("mem_jules"))!;
    const formData = formDataFromEntries({
      featured: "true",
      stale: "true",
    });

    await expect(
      updateProfileFlagsAction("wavespark", profile.id, formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/admin/profiles?status=profile_flags_updated");

    await expect(getProfileByMembershipId("mem_jules")).resolves.toMatchObject({
      featured: true,
      stale: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/profiles");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/org/wavespark/matches");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/org/wavespark/admin/matches");
    expect(afterMock).toHaveBeenCalledTimes(1);

    const backgroundTask = afterMock.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    await backgroundTask?.();

    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/matches");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/matches");
  });

  it("moderates opportunity posts with detail and opportunity list revalidation", async () => {
    await setAdminViewer();
    const post = getStore().posts.find((candidate) => candidate.type === "opportunity")!;
    const formData = formDataFromEntries({
      hidden: "true",
    });

    await expect(
      updatePostModerationAction("wavespark", post.id, formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/admin/posts?status=post_moderation_updated");

    expect(getStore().posts.find((candidate) => candidate.id === post.id)).toMatchObject({
      hidden: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/posts");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/org/wavespark/posts/${post.id}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/opportunities");
  });

  it("moderates comments with post detail and affected list revalidation", async () => {
    await setAdminViewer();
    const post = getStore().posts.find((candidate) => candidate.type === "opportunity")!;
    const comment = await createComment(
      {
        postId: post.id,
        authorMembershipId: "mem_jules",
        body: "This comment should be removed from member surfaces.",
      },
      { orgId: seedOrganization.id },
    );

    await expect(
      moderateCommentAction("wavespark", comment.id, "removed"),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavespark/admin/posts?status=comment_moderation_updated");

    expect(getStore().comments.find((candidate) => candidate.id === comment.id)).toMatchObject({
      status: "removed",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/admin/posts");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/org/wavespark/posts/${post.id}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavespark/opportunities");
  });
});

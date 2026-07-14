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
  delete process.env.RESEND_API_KEY;
  return vi.fn(async ({ emailAddress }: { emailAddress: string }) => ({
    id: `inv_${emailAddress}`,
    emailAddress,
    status: "pending",
  }));
});
const createOrganizationInvitationBulkMock = vi.hoisted(() =>
  vi.fn(
    async (
      _organizationId: string,
      invitations: Array<{ emailAddress: string }>,
    ) => ({
      data: invitations.map(({ emailAddress }) => ({
        id: `inv_bulk_${emailAddress}`,
        emailAddress,
        role: "org:member",
        status: "pending",
      })),
    }),
  ),
);
const revokeOrganizationInvitationMock = vi.hoisted(() => vi.fn(async () => ({ id: "revoked" })));
const getOrganizationInvitationListMock = vi.hoisted(() =>
  vi.fn(async (input?: { organizationId?: string; limit?: number; offset?: number }) => {
    void input;
    return {
      data: [] as Array<{
        emailAddress: string;
        id: string;
        role: string;
        status: string;
      }>,
      totalCount: 0,
    };
  }),
);
const getUserListMock = vi.hoisted(() =>
  vi.fn(async (input?: unknown) => {
    void input;
    return {
      data: [] as Array<{
        emailAddresses: Array<{ emailAddress: string }>;
        id: string;
      }>,
    };
  }),
);
const getOrganizationMembershipListMock = vi.hoisted(() =>
  vi.fn(async (input?: { userId?: string[] }) => {
    void input;
    return { data: [{ id: "clerk_mem_admin", role: "org:admin" }] };
  }),
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
      createOrganizationInvitationBulk: createOrganizationInvitationBulkMock,
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
  confirmMemberImportAction,
  createCohortAction,
  createManagedAccountAction,
  importCohortStudentsAction,
  createManualIntroAction,
  moderateCommentAction,
  promoteCohortMembersAction,
  previewMemberImportAction,
  retryMemberInvitationsAction,
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
    getUserListMock.mockImplementation(async () => ({ data: [] }));
    getOrganizationInvitationListMock.mockImplementation(async () => ({
      data: [],
      totalCount: 0,
    }));
    getOrganizationMembershipListMock.mockImplementation(async () => ({
      data: [{ id: "clerk_mem_admin", role: "org:admin" }],
    }));
    createOrganizationInvitationBulkMock.mockImplementation(
      async (
        _organizationId: string,
        invitations: Array<{ emailAddress: string }>,
      ) => ({
        data: invitations.map(({ emailAddress }) => ({
          id: `inv_bulk_${emailAddress}`,
          emailAddress,
          role: "org:member",
          status: "pending",
        })),
      }),
    );
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

  it("reuses a pending invitation found in the unfiltered Clerk response", async () => {
    await setAdminViewer();
    const email = "already.pending@example.com";
    getOrganizationInvitationListMock.mockResolvedValueOnce({
      data: [
        {
          id: "orginv_existing",
          emailAddress: email,
          role: "org:member",
          status: "pending",
        },
      ],
      totalCount: 1,
    });
    const formData = formDataFromEntries({
      email,
      name: "Already Pending",
      role: "member",
      status: "pending",
    });

    await expect(createManagedAccountAction("wavespark", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavespark/admin/members?status=member_invited",
    );

    expect(getOrganizationInvitationListMock).toHaveBeenCalledWith({
      organizationId: "org_clerk_wavespark",
      limit: 500,
      offset: 0,
    });
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
    const user = getStore().users.find((candidate) => candidate.email === email);
    const membership = getStore().memberships.find(
      (candidate) => candidate.userId === user?.id,
    );
    expect(membership).toMatchObject({
      clerkInvitationId: "orginv_existing",
      clerkInvitationStatus: "pending",
    });
  });

  it("adds an existing Clerk user and sends the explicit sign-in notification", async () => {
    await setAdminViewer();
    const email = "existing.clerk.member@example.com";
    getUserListMock.mockResolvedValueOnce({
      data: [
        {
          id: "user_clerk_existing",
          emailAddresses: [{ emailAddress: email }],
        },
      ],
    });
    getOrganizationMembershipListMock.mockImplementation(
      async (input?: { userId?: string[] }) =>
        input?.userId?.[0] === "user_clerk_existing"
          ? { data: [] }
          : { data: [{ id: "clerk_mem_admin", role: "org:admin" }] },
    );
    const emailLog = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const formData = formDataFromEntries({
      email,
      name: "Existing Clerk Member",
      role: "member",
      status: "pending",
    });

    await expect(createManagedAccountAction("wavespark", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavespark/admin/members?status=member_invited",
    );

    expect(createOrganizationMembershipMock).toHaveBeenCalledWith({
      organizationId: "org_clerk_wavespark",
      role: "org:member",
      userId: "user_clerk_existing",
    });
    expect(emailLog).toHaveBeenCalledWith(
      "[wavesparks] email skipped",
      "You’ve been invited to Wavespark",
      email,
    );
    const user = getStore().users.find((candidate) => candidate.email === email);
    const membership = getStore().memberships.find(
      (candidate) => candidate.userId === user?.id,
    );
    expect(user?.clerkUserId).toBe("user_clerk_existing");
    expect(membership?.clerkMembershipId).toBe("clerk_mem_admin");
  });

  it("rejects inactive statuses before creating an invitation record", async () => {
    await setAdminViewer();
    const formData = formDataFromEntries({
      email: "inactive.invite@example.com",
      name: "Inactive Invite",
      role: "member",
      status: "suspended",
    });

    await expect(createManagedAccountAction("wavespark", formData)).rejects.toThrow(
      "New invitations require an active membership status.",
    );
    expect(
      getStore().users.some((candidate) => candidate.email === "inactive.invite@example.com"),
    ).toBe(false);
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
  });

  it("requires confirmation for admin access and approves the new admin", async () => {
    await setAdminViewer();
    const formData = formDataFromEntries({
      email: "new.admin@example.com",
      name: "New Admin",
      role: "org_admin",
      status: "pending",
    });

    await expect(createManagedAccountAction("wavespark", formData)).rejects.toThrow(
      "Administrator access must be explicitly confirmed.",
    );
    expect(
      getStore().users.some((candidate) => candidate.email === "new.admin@example.com"),
    ).toBe(false);

    formData.set("confirm_admin_access", "on");
    await expect(createManagedAccountAction("wavespark", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavespark/admin/members?status=member_invited",
    );

    const user = getStore().users.find(
      (candidate) => candidate.email === "new.admin@example.com",
    );
    expect(
      getStore().memberships.find((membership) => membership.userId === user?.id),
    ).toMatchObject({ role: "org_admin", status: "approved" });
    expect(createOrganizationInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: "org:admin" }),
    );
  });

  it("adds an existing member to a cohort without overwriting member data", async () => {
    await setAdminViewer();
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Existing Member Cohort",
      createdByMembershipId: "mem_avery",
    });
    const existingUser = (await getUserById("usr_priya"))!;
    const existingMembership = (await getMembershipById("mem_priya"))!;
    const formData = formDataFromEntries({
      email: existingUser.email,
      name: "Overwrite Attempt",
      role: "member",
      status: "approved",
      cohort_id: cohort.id,
      return_to_cohort_id: cohort.id,
    });

    await expect(createManagedAccountAction("wavespark", formData)).rejects.toThrow(
      `NEXT_REDIRECT:/org/wavespark/admin/cohorts/${cohort.id}?status=member_added_to_cohort`,
    );

    expect(await getUserById(existingUser.id)).toMatchObject({ name: "Priya Desai" });
    expect(await getMembershipById(existingMembership.id)).toMatchObject({
      role: "member",
      status: "pending",
    });
    const records = await listCohortMemberRecordsForCohort(
      seedOrganization.id,
      cohort.id,
    );
    expect(records.map(({ membership }) => membership.id)).toContain(existingMembership.id);
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
  });

  it("previews new, duplicate, pending, connected, existing, and inactive rows", async () => {
    await setAdminViewer();
    const store = getStore();
    const pending = store.memberships.find((membership) => membership.id === "mem_priya")!;
    pending.clerkInvitationId = "orginv_priya";
    pending.clerkInvitationStatus = "pending";
    const connected = store.memberships.find((membership) => membership.id === "mem_jules")!;
    connected.clerkMembershipId = "clerk_mem_jules";
    const existing = store.memberships.find((membership) => membership.id === "mem_rhea")!;
    existing.clerkInvitationStatus = "accepted";

    const preview = await previewMemberImportAction("wavespark", {
      accessStatus: "pending",
      rows: [
        { rowNumber: 2, email: " New.Person@external.example ", name: "New Person" },
        { rowNumber: 3, email: "new.person@external.example", name: "Duplicate Person" },
        { rowNumber: 4, email: "not-an-email", name: "Invalid" },
        { rowNumber: 5, email: "priya@example.com", name: "Do Not Replace" },
        { rowNumber: 6, email: "jules@example.com", name: "Do Not Replace" },
        { rowNumber: 7, email: "rhea@example.com", name: "Do Not Replace" },
        { rowNumber: 8, email: "nora@example.com", name: "Do Not Restore" },
      ],
    });

    expect(preview.rows.map((row) => row.classification)).toEqual([
      "ready",
      "duplicate",
      "invalid",
      "already_invited",
      "already_connected",
      "existing_member",
      "inactive_conflict",
    ]);
    expect(preview.rows[0]).toMatchObject({
      normalizedEmail: "new.person@external.example",
      warnings: ["Email domain is outside the organization’s configured domain list."],
    });
    expect(preview.rows[1].message).toContain("row 2");
    expect(preview.summary).toMatchObject({
      ready: 1,
      duplicate: 1,
      invalid: 1,
      already_invited: 1,
      already_connected: 1,
      existing_member: 1,
      inactive_conflict: 1,
    });
    expect(preview.canInviteCount).toBe(1);
  });

  it("confirms imports through Clerk bulk calls of at most ten invitations", async () => {
    await setAdminViewer();
    const rows = Array.from({ length: 12 }, (_, index) => ({
      rowNumber: index + 2,
      email: `bulk-${index + 1}@example.com`,
      name: `Bulk Member ${index + 1}`,
    }));

    const result = await confirmMemberImportAction("wavespark", {
      accessStatus: "approved",
      rows,
    });

    expect(createOrganizationInvitationBulkMock).toHaveBeenCalledTimes(2);
    expect(
      createOrganizationInvitationBulkMock.mock.calls.map(
        ([organizationId, invitations]) => [organizationId, invitations.length],
      ),
    ).toEqual([
      ["org_clerk_wavespark", 10],
      ["org_clerk_wavespark", 2],
    ]);
    expect(
      createOrganizationInvitationBulkMock.mock.calls.every(
        ([, invitations]) => invitations.length <= 10,
      ),
    ).toBe(true);
    expect(result.summary).toEqual({
      invited: 12,
      connected: 0,
      cohortAdded: 0,
      skipped: 0,
      failed: 0,
    });
    expect(result.rows.every((row) => row.message === "Invitation created.")).toBe(true);
    for (const row of rows) {
      const user = getStore().users.find((candidate) => candidate.email === row.email);
      expect(
        getStore().memberships.find((membership) => membership.userId === user?.id),
      ).toMatchObject({
        invitedByUserId: "usr_avery",
        role: "member",
        status: "approved",
        clerkInvitationStatus: "pending",
      });
    }
  });

  it("reports a missing Clerk bulk result as a retryable per-row failure", async () => {
    await setAdminViewer();
    createOrganizationInvitationBulkMock.mockImplementationOnce(
      async (_organizationId, invitations) => ({
        data: invitations
          .filter((_, index) => index !== 1)
          .map(({ emailAddress }) => ({
            id: `inv_partial_${emailAddress}`,
            emailAddress,
            role: "org:member",
            status: "pending",
          })),
      }),
    );

    const result = await confirmMemberImportAction("wavespark", {
      accessStatus: "pending",
      rows: [
        { rowNumber: 2, email: "partial-1@example.com", name: "Partial One" },
        { rowNumber: 3, email: "partial-2@example.com", name: "Partial Two" },
        { rowNumber: 4, email: "partial-3@example.com", name: "Partial Three" },
      ],
    });

    expect(result.summary).toMatchObject({ invited: 2, failed: 1 });
    expect(result.rows[1]).toMatchObject({
      email: "partial-2@example.com",
      status: "failed",
      retryable: true,
      message: "Clerk did not return a matching invitation.",
    });
    const failedUser = getStore().users.find(
      (user) => user.email === "partial-2@example.com",
    );
    expect(
      getStore().memberships.find((membership) => membership.userId === failedUser?.id),
    ).toMatchObject({
      clerkInvitationError: "Clerk did not return a matching invitation.",
      clerkInvitationStatus: "failed",
    });
  });

  it("isolates a Clerk 429 to its ten-person batch and continues later batches", async () => {
    await setAdminViewer();
    createOrganizationInvitationBulkMock.mockRejectedValueOnce(
      Object.assign(new Error("Too many requests"), { status: 429 }),
    );
    const rows = Array.from({ length: 11 }, (_, index) => ({
      rowNumber: index + 2,
      email: `rate-limit-${index + 1}@example.com`,
      name: `Rate Limit ${index + 1}`,
    }));

    const result = await confirmMemberImportAction("wavespark", {
      accessStatus: "waitlist",
      rows,
    });

    expect(createOrganizationInvitationBulkMock).toHaveBeenCalledTimes(2);
    expect(result.summary).toMatchObject({ invited: 1, failed: 10 });
    expect(result.rows.slice(0, 10).every((row) => row.retryable)).toBe(true);
    expect(result.rows.slice(0, 10).every((row) => row.message === "Too many requests")).toBe(
      true,
    );
    expect(result.rows[10]).toMatchObject({
      email: "rate-limit-11@example.com",
      status: "invited",
    });
  });

  it("connects existing Clerk users, reuses pending invitations, and bulks only new rows", async () => {
    await setAdminViewer();
    const connectedEmail = "bulk-existing@example.com";
    const pendingEmail = "bulk-pending@example.com";
    getUserListMock.mockResolvedValueOnce({
      data: [
        {
          id: "user_clerk_bulk_existing",
          emailAddresses: [{ emailAddress: connectedEmail }],
        },
      ],
    });
    getOrganizationInvitationListMock.mockResolvedValueOnce({
      data: [
        {
          id: "orginv_bulk_pending",
          emailAddress: pendingEmail,
          role: "org:member",
          status: "pending",
        },
      ],
      totalCount: 1,
    });
    getOrganizationMembershipListMock.mockImplementation(
      async (input?: { userId?: string[] }) =>
        input?.userId?.[0] === "user_clerk_bulk_existing"
          ? { data: [] }
          : { data: [{ id: "clerk_mem_admin", role: "org:admin" }] },
    );
    const emailLog = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = await confirmMemberImportAction("wavespark", {
      accessStatus: "pending",
      rows: [
        { rowNumber: 2, email: connectedEmail, name: "Existing Clerk User" },
        { rowNumber: 3, email: pendingEmail, name: "Pending Invitation" },
        { rowNumber: 4, email: "bulk-new@example.com", name: "Brand New" },
      ],
    });

    expect(result.summary).toMatchObject({ connected: 1, invited: 2, failed: 0 });
    expect(createOrganizationMembershipMock).toHaveBeenCalledWith({
      organizationId: "org_clerk_wavespark",
      role: "org:member",
      userId: "user_clerk_bulk_existing",
    });
    expect(createOrganizationInvitationBulkMock).toHaveBeenCalledTimes(1);
    expect(createOrganizationInvitationBulkMock.mock.calls[0]?.[1]).toHaveLength(1);
    expect(createOrganizationInvitationBulkMock.mock.calls[0]?.[1]?.[0]).toMatchObject({
      emailAddress: "bulk-new@example.com",
    });
    const pendingUser = getStore().users.find((user) => user.email === pendingEmail);
    expect(
      getStore().memberships.find((membership) => membership.userId === pendingUser?.id),
    ).toMatchObject({
      clerkInvitationId: "orginv_bulk_pending",
      clerkInvitationStatus: "pending",
    });
    expect(emailLog).toHaveBeenCalledWith(
      "[wavesparks] email skipped",
      "You’ve been invited to Wavespark",
      connectedEmail,
    );
  });

  it("retries only retryable memberships from the current organization", async () => {
    await setAdminViewer();
    const store = getStore();
    const retryable = store.memberships.find((membership) => membership.id === "mem_priya")!;
    retryable.clerkInvitationId = "orginv_failed_priya";
    retryable.clerkInvitationStatus = "failed";
    retryable.clerkInvitationError = "Previous failure";
    const sourceUser = store.users.find((user) => user.id === retryable.userId)!;
    const otherUser = {
      ...sourceUser,
      id: "usr_other_org_retry",
      email: "other-org-retry@example.com",
      name: "Other Org Retry",
    };
    const otherMembership = {
      ...retryable,
      id: "mem_other_org_retry",
      orgId: "org_other",
      userId: otherUser.id,
    };
    store.users.push(otherUser);
    store.memberships.push(otherMembership);

    const result = await retryMemberInvitationsAction("wavespark", [
      retryable.id,
      otherMembership.id,
      "mem_nora",
      retryable.id,
    ]);

    expect(result.rows.map((row) => row.membershipId)).toEqual(
      expect.arrayContaining([retryable.id, "mem_nora"]),
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows.some((row) => row.membershipId === otherMembership.id)).toBe(false);
    expect(result.summary).toMatchObject({ invited: 1, skipped: 1, failed: 0 });
    expect(createOrganizationInvitationBulkMock).toHaveBeenCalledTimes(1);
    expect(createOrganizationInvitationBulkMock.mock.calls[0]?.[1]).toHaveLength(1);
    expect(createOrganizationInvitationBulkMock.mock.calls[0]?.[1]?.[0]).toMatchObject({
      emailAddress: "priya@example.com",
    });
  });

  it("retries a failed sign-in notification for an already connected account", async () => {
    await setAdminViewer();
    const connected = (await getMembershipById("mem_jules"))!;
    connected.clerkMembershipId = "clerk_mem_jules";
    connected.clerkInvitationError = "Invitation email failed: Resend unavailable";
    const emailLog = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const result = await retryMemberInvitationsAction("wavespark", [connected.id]);

    expect(result.rows).toEqual([
      expect.objectContaining({
        membershipId: connected.id,
        status: "connected",
        retryable: false,
        message: "Sign-in notification sent to the connected account.",
      }),
    ]);
    expect(await getMembershipById(connected.id)).toMatchObject({
      clerkMembershipId: "clerk_mem_jules",
      clerkInvitationError: undefined,
    });
    expect(createOrganizationInvitationBulkMock).not.toHaveBeenCalled();
    expect(emailLog).toHaveBeenCalledWith(
      "[wavesparks] email skipped",
      "You’ve been invited to Wavespark",
      "jules@example.com",
    );
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

  it("requires rejected or suspended cohort members to be restored in member details", async () => {
    await setAdminViewer();
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Inactive Review Cohort",
      createdByMembershipId: "mem_avery",
    });
    const [imported] = await importCohortMembers(seedOrganization.id, cohort.id, [
      { email: "inactive.review@example.com", name: "Inactive Review" },
    ]);
    imported.membership.status = "suspended";
    const formData = new FormData();
    formData.append("membership_id", imported.membership.id);

    await expect(
      promoteCohortMembersAction("wavespark", cohort.id, formData),
    ).rejects.toThrow(
      "Rejected or suspended members must be restored explicitly from their member details.",
    );
    expect(await getMembershipById(imported.membership.id)).toMatchObject({
      status: "suspended",
    });
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

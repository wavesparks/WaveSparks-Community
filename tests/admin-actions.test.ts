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
const sendNotificationEmailMock = vi.hoisted(() =>
  vi.fn(async () => ({ id: "email_test" })),
);
const createClerkIdentityInvitationMock = vi.hoisted(() =>
  vi.fn(async ({ emailAddress }: { emailAddress: string }) => ({
    id: `app_inv_${emailAddress}`,
  })),
);
const revokeClerkIdentityInvitationMock = vi.hoisted(() =>
  vi.fn(async () => undefined),
);
const createOrganizationInvitationMock = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_wavesparks";
  process.env.CLERK_SECRET_KEY = "sk_test_wavesparks";
  process.env.RESEND_API_KEY = "re_test_wavesparks";
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

vi.mock("@/server/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/notifications")>()),
  sendNotificationEmail: sendNotificationEmailMock,
}));

vi.mock("@/server/clerk-identity-invitations", () => ({
  createClerkIdentityInvitation: createClerkIdentityInvitationMock,
  revokeClerkIdentityInvitation: revokeClerkIdentityInvitationMock,
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
  resendMembershipInvitationAction,
  updatePostModerationAction,
  updateMentorDesignationAction,
  updateMembershipAction,
  updateProfileFlagsAction,
} from "@/actions/admin";
import {
  createComment,
  createCohort,
  getMembershipById,
  getProfileByMembershipId,
  getSpaceMembership,
  getStore,
  getUserById,
  grantSpaceMembership,
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
    isApprovedMentor: membership.mentorStatus === "approved",
    canMentor: membership.mentorStatus === "approved",
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

function mainSpace() {
  return getStore().spaces.find((space) => space.kind === "main")!;
}

function addLocalInvitation(input: {
  membershipId: string;
  email: string;
  status?: "pending" | "accepted" | "revoked" | "expired";
  deliveryError?: string;
}) {
  const now = new Date().toISOString();
  const invitation = {
    id: `minv_test_${input.membershipId}_${getStore().membershipInvitations.length}`,
    orgId: seedOrganization.id,
    membershipId: input.membershipId,
    email: input.email.toLowerCase(),
    tokenHash: `${getStore().membershipInvitations.length + 1}`.padStart(64, "0"),
    status: input.status ?? "pending",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    createdByMembershipId: "mem_avery",
    ...(input.status === "accepted"
      ? { acceptedAt: now, acceptedByClerkUserId: "user_test_accepted" }
      : {}),
    ...(input.status === "revoked" ? { revokedAt: now } : {}),
    deliveryError: input.deliveryError,
    createdAt: now,
    updatedAt: now,
  } as const;
  getStore().membershipInvitations.unshift(invitation);
  return invitation;
}

async function createEventDestination(name: string) {
  return createCohort({
    orgId: seedOrganization.id,
    name,
    createdByMembershipId: "mem_avery",
  });
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
    sendNotificationEmailMock.mockImplementation(async () => ({ id: "email_test" }));
    createClerkIdentityInvitationMock.mockImplementation(async ({ emailAddress }) => ({
      id: `app_inv_${emailAddress}`,
    }));
    revokeClerkIdentityInvitationMock.mockImplementation(async () => undefined);
    viewerRef.current = null;
  });

  it("persists and emails a local invitation before reporting success", async () => {
    await setAdminViewer();
    const destination = await createEventDestination("Clerk invitation destination");
    const formData = formDataFromEntries({
      email: "new.member@example.com",
      name: "New Member",
      role: "member",
      status: "approved",
      destination_space_id: destination.id,
      space_access_status: "active",
    });

    await expect(
      createManagedAccountAction("wavesparks", formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/admin/members?status=member_invited");

    const user = getStore().users.find(
      (candidate) => candidate.email === "new.member@example.com",
    );
    const membership = getStore().memberships.find(
      (candidate) => candidate.userId === user?.id,
    );

    expect(user).toBeDefined();
    expect(membership).toMatchObject({
      accountStatus: "invited",
      mentorStatus: "not_mentor",
      role: "member",
      status: "pending",
    });
    expect(
      getStore().membershipInvitations.find(
        (invitation) => invitation.membershipId === membership?.id,
      ),
    ).toMatchObject({
      email: "new.member@example.com",
      status: "pending",
      sentAt: expect.any(String),
      deliveryError: undefined,
    });
    await expect(getSpaceMembership(destination.id, membership!.id)).resolves.toMatchObject({
      accessStatus: "active",
    });
    await expect(getSpaceMembership(mainSpace().id, membership!.id)).resolves.toBeUndefined();
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
    expect(createClerkIdentityInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: "new.member@example.com",
        redirectUrl: expect.stringContaining(
          "/api/internal/membership-invitations/accept?orgSlug=wavesparks&token=",
        ),
      }),
    );
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/admin/members");

  });

  it("persists an approved mentor invitation independently from account permissions", async () => {
    const adminMembership = await setAdminViewer();
    const destination = await createEventDestination("Mentor invitation destination");
    const formData = formDataFromEntries({
      email: "new.mentor@example.com",
      name: "New Mentor",
      role: "member",
      mentor_status: "approved",
      destination_space_id: destination.id,
      space_access_status: "active",
    });

    await expect(createManagedAccountAction("wavesparks", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavesparks/admin/members?status=member_invited",
    );

    const user = getStore().users.find(
      (candidate) => candidate.email === "new.mentor@example.com",
    );
    const membership = getStore().memberships.find(
      (candidate) => candidate.userId === user?.id,
    );
    expect(membership).toMatchObject({
      role: "member",
      mentorStatus: "approved",
      mentorReviewedAt: expect.any(String),
      mentorReviewedByMembershipId: adminMembership.id,
    });
    await expect(getSpaceMembership(destination.id, membership!.id)).resolves.toMatchObject({
      accessStatus: "active",
    });
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
  });

  it("does not allow invitations to forge a pending mentor review", async () => {
    await setAdminViewer();
    const destination = await createEventDestination("Invalid mentor invitation destination");
    const formData = formDataFromEntries({
      email: "pending.mentor@example.com",
      name: "Pending Mentor",
      role: "member",
      mentor_status: "needs_review",
      destination_space_id: destination.id,
      space_access_status: "active",
    });

    await expect(createManagedAccountAction("wavesparks", formData)).rejects.toThrow(
      "New invitations can be Not a mentor or Approved mentor.",
    );
    expect(
      getStore().users.some((candidate) => candidate.email === "pending.mentor@example.com"),
    ).toBe(false);
  });

  it("records a failed Clerk identity invitation delivery instead of reporting success", async () => {
    await setAdminViewer();
    const destination = await createEventDestination("Failed invitation destination");
    createClerkIdentityInvitationMock.mockRejectedValueOnce(
      new Error("Clerk identity invitation unavailable"),
    );
    const formData = formDataFromEntries({
      email: "failed.member@example.com",
      name: "Failed Member",
      role: "member",
      status: "pending",
      destination_space_id: destination.id,
      space_access_status: "active",
    });

    await expect(createManagedAccountAction("wavesparks", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavesparks/admin/members?status=member_invite_failed",
    );

    const user = getStore().users.find(
      (candidate) => candidate.email === "failed.member@example.com",
    );
    const membership = getStore().memberships.find(
      (candidate) => candidate.userId === user?.id,
    );
    expect(membership).toMatchObject({ status: "pending" });
    expect(
      getStore().membershipInvitations.find(
        (invitation) => invitation.membershipId === membership?.id,
      ),
    ).toMatchObject({
      status: "pending",
      sentAt: undefined,
      deliveryError:
        "The invitation email could not be sent. Check the email service, then try again.",
    });
  });

  it("rotates an existing local invitation when an admin resends it", async () => {
    await setAdminViewer();
    const destination = await createEventDestination("Pending invitation destination");
    const email = "already.pending@example.com";
    const formData = formDataFromEntries({
      email,
      name: "Already Pending",
      role: "member",
      status: "pending",
      destination_space_id: destination.id,
      space_access_status: "active",
    });

    await expect(createManagedAccountAction("wavesparks", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavesparks/admin/members?status=member_invited",
    );

    const user = getStore().users.find((candidate) => candidate.email === email);
    const membership = getStore().memberships.find(
      (candidate) => candidate.userId === user?.id,
    )!;
    const firstInvitation = getStore().membershipInvitations.find(
      (invitation) => invitation.membershipId === membership.id,
    )!;

    await expect(
      resendMembershipInvitationAction("wavesparks", membership.id),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavesparks/admin/members?status=member_invited",
    );

    const invitations = getStore().membershipInvitations.filter(
      (invitation) => invitation.membershipId === membership.id,
    );
    expect(invitations).toHaveLength(2);
    expect(invitations.find((invitation) => invitation.id === firstInvitation.id)?.status)
      .toBe("revoked");
    expect(invitations.filter((invitation) => invitation.status === "pending"))
      .toHaveLength(1);
  });

  it("does not query Clerk Organizations or auto-connect a matching Clerk directory user", async () => {
    await setAdminViewer();
    const destination = await createEventDestination("Existing Clerk destination");
    const email = "existing.clerk.member@example.com";
    getUserListMock.mockResolvedValueOnce({
      data: [
        {
          id: "user_clerk_existing",
          emailAddresses: [{ emailAddress: email }],
        },
      ],
    });
    const formData = formDataFromEntries({
      email,
      name: "Existing Clerk Member",
      role: "member",
      status: "pending",
      destination_space_id: destination.id,
      space_access_status: "active",
    });

    await expect(createManagedAccountAction("wavesparks", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavesparks/admin/members?status=member_invited",
    );

    expect(getUserListMock).not.toHaveBeenCalled();
    expect(createOrganizationMembershipMock).not.toHaveBeenCalled();
    const user = getStore().users.find((candidate) => candidate.email === email);
    const membership = getStore().memberships.find(
      (candidate) => candidate.userId === user?.id,
    );
    expect(user?.clerkUserId).toBeUndefined();
    expect(membership?.accountStatus).toBe("invited");
    expect(
      getStore().membershipInvitations.some(
        (invitation) => invitation.membershipId === membership?.id,
      ),
    ).toBe(true);
  });

  it("ignores legacy membership status and grants only the explicit destination Space", async () => {
    await setAdminViewer();
    const destination = await createEventDestination("Legacy status destination");
    const formData = formDataFromEntries({
      email: "inactive.invite@example.com",
      name: "Inactive Invite",
      role: "member",
      status: "suspended",
      destination_space_id: destination.id,
      space_access_status: "active",
    });

    await expect(createManagedAccountAction("wavesparks", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavesparks/admin/members?status=member_invited",
    );
    const user = getStore().users.find(
      (candidate) => candidate.email === "inactive.invite@example.com",
    )!;
    const membership = getStore().memberships.find(
      (candidate) => candidate.userId === user.id,
    )!;
    expect(membership).toMatchObject({ accountStatus: "invited", status: "pending" });
    await expect(getSpaceMembership(destination.id, membership.id)).resolves.toMatchObject({
      accessStatus: "active",
    });
    await expect(getSpaceMembership(mainSpace().id, membership.id)).resolves.toBeUndefined();
  });

  it("requires confirmation for admin access and approves the new admin", async () => {
    await setAdminViewer();
    const formData = formDataFromEntries({
      email: "new.admin@example.com",
      name: "New Admin",
      role: "org_admin",
      mentor_status: "approved",
      status: "pending",
      destination_space_id: "",
    });

    await expect(createManagedAccountAction("wavesparks", formData)).rejects.toThrow(
      "Confirm that you want to make this person an administrator.",
    );
    expect(
      getStore().users.some((candidate) => candidate.email === "new.admin@example.com"),
    ).toBe(false);

    formData.set("confirm_admin_access", "on");
    await expect(createManagedAccountAction("wavesparks", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavesparks/admin/members?status=member_invited",
    );

    const user = getStore().users.find(
      (candidate) => candidate.email === "new.admin@example.com",
    );
    expect(
      getStore().memberships.find((membership) => membership.userId === user?.id),
    ).toMatchObject({
      mentorStatus: "approved",
      role: "org_admin",
      status: "pending",
    });
    const membership = getStore().memberships.find(
      (candidate) => candidate.userId === user?.id,
    )!;
    expect(
      getStore().spaceMemberships.some(
        (spaceMembership) => spaceMembership.membershipId === membership.id,
      ),
    ).toBe(false);
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
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
      destination_space_id: cohort.id,
      space_access_status: "active",
      return_to_space_id: cohort.id,
    });

    await expect(createManagedAccountAction("wavesparks", formData)).rejects.toThrow(
      `NEXT_REDIRECT:/org/wavesparks/admin/spaces/${cohort.id}?status=member_added_to_space`,
    );

    expect(await getUserById(existingUser.id)).toMatchObject({ name: "Priya Desai" });
    expect(await getMembershipById(existingMembership.id)).toMatchObject({
      mentorStatus: "needs_review",
      role: "member",
      status: "pending",
    });
    const records = await listCohortMemberRecordsForCohort(
      seedOrganization.id,
      cohort.id,
    );
    expect(records.map(({ membership }) => membership.id)).toContain(existingMembership.id);
    await expect(getSpaceMembership(cohort.id, existingMembership.id)).resolves.toMatchObject({
      accessStatus: "active",
    });
    await expect(
      getSpaceMembership(mainSpace().id, existingMembership.id),
    ).resolves.toBeUndefined();
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
  });

  it("previews new, duplicate, pending, connected, existing, and inactive rows", async () => {
    await setAdminViewer();
    const store = getStore();
    const destination = mainSpace();
    const pending = store.memberships.find((membership) => membership.id === "mem_priya")!;
    pending.accountStatus = "invited";
    addLocalInvitation({ membershipId: pending.id, email: "priya@example.com" });
    const connected = store.memberships.find((membership) => membership.id === "mem_jules")!;
    connected.accountStatus = "connected";
    const existing = store.memberships.find((membership) => membership.id === "mem_rhea")!;
    existing.accountStatus = "invited";
    addLocalInvitation({
      membershipId: existing.id,
      email: "rhea@example.com",
      status: "accepted",
    });

    const preview = await previewMemberImportAction("wavesparks", {
      destinationSpaceId: destination.id,
      accessStatus: "active",
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
    expect(preview).toMatchObject({
      destinationSpaceId: destination.id,
      destinationSpaceKind: "main",
    });
  });

  it("sends local imports in bounded email batches", async () => {
    await setAdminViewer();
    const destination = mainSpace();
    const rows = Array.from({ length: 12 }, (_, index) => ({
      rowNumber: index + 2,
      email: `bulk-${index + 1}@example.com`,
      name: `Bulk Member ${index + 1}`,
    }));

    const result = await confirmMemberImportAction("wavesparks", {
      destinationSpaceId: destination.id,
      accessStatus: "active",
      rows,
    });

    expect(createClerkIdentityInvitationMock).toHaveBeenCalledTimes(12);
    expect(createOrganizationInvitationBulkMock).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({
      invited: 12,
      connected: 0,
      spaceAdded: 12,
      skipped: 0,
      failed: 0,
    });
    expect(
      result.rows.every(
        (row) =>
          row.message === "Invitation sent. Access to Wavesparks Community added.",
      ),
    ).toBe(true);
    for (const row of rows) {
      const user = getStore().users.find((candidate) => candidate.email === row.email);
      expect(
        getStore().memberships.find((membership) => membership.userId === user?.id),
      ).toMatchObject({
        invitedByUserId: "usr_avery",
        accountStatus: "invited",
        mentorStatus: "not_mentor",
        role: "member",
        status: "pending",
      });
      const membership = getStore().memberships.find(
        (candidate) => candidate.userId === user?.id,
      )!;
      expect(
        getStore().membershipInvitations.find(
          (invitation) => invitation.membershipId === membership.id,
        ),
      ).toMatchObject({ status: "pending", sentAt: expect.any(String) });
      await expect(getSpaceMembership(destination.id, membership.id)).resolves.toMatchObject({
        accessStatus: "active",
      });
    }
  });

  it("reports a Clerk invitation failure as a retryable per-row failure", async () => {
    await setAdminViewer();
    const destination = mainSpace();
    createClerkIdentityInvitationMock
      .mockResolvedValueOnce({ id: "app_inv_first" })
      .mockRejectedValueOnce(new Error("Clerk identity invitation unavailable"))
      .mockResolvedValueOnce({ id: "app_inv_third" });

    const result = await confirmMemberImportAction("wavesparks", {
      destinationSpaceId: destination.id,
      accessStatus: "active",
      rows: [
        { rowNumber: 2, email: "partial-1@example.com", name: "Partial One" },
        { rowNumber: 3, email: "partial-2@example.com", name: "Partial Two" },
        { rowNumber: 4, email: "partial-3@example.com", name: "Partial Three" },
      ],
    });

    expect(result.summary).toMatchObject({ invited: 2, spaceAdded: 3, failed: 1 });
    expect(result.rows[1]).toMatchObject({
      email: "partial-2@example.com",
      status: "failed",
      retryable: true,
      message:
        "The invitation email could not be sent. Check the email service, then try again. Access to Wavesparks Community added.",
    });
    const failedUser = getStore().users.find(
      (user) => user.email === "partial-2@example.com",
    );
    const failedMembership = getStore().memberships.find(
      (membership) => membership.userId === failedUser?.id,
    )!;
    expect(
      getStore().membershipInvitations.find(
        (invitation) => invitation.membershipId === failedMembership.id,
      ),
    ).toMatchObject({
      status: "pending",
      deliveryError:
        "The invitation email could not be sent. Check the email service, then try again.",
    });
  });

  it("isolates a Clerk invitation 429 and continues the batch", async () => {
    await setAdminViewer();
    const destination = mainSpace();
    createClerkIdentityInvitationMock.mockRejectedValueOnce(
      Object.assign(new Error("Too many requests"), { status: 429 }),
    );
    const rows = Array.from({ length: 11 }, (_, index) => ({
      rowNumber: index + 2,
      email: `rate-limit-${index + 1}@example.com`,
      name: `Rate Limit ${index + 1}`,
    }));

    const result = await confirmMemberImportAction("wavesparks", {
      destinationSpaceId: destination.id,
      accessStatus: "waitlist",
      rows,
    });

    expect(createOrganizationInvitationBulkMock).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({ invited: 10, spaceAdded: 11, failed: 1 });
    expect(result.rows[0]).toMatchObject({
      email: "rate-limit-1@example.com",
      status: "failed",
      retryable: true,
      message:
        "The invitation service is busy. Wait a few minutes, then try again. Access to Wavesparks Community added.",
    });
    expect(result.rows.slice(1).every((row) => row.status === "invited")).toBe(true);
  });

  it("uses only local invitations even when Clerk directory mocks contain matching users", async () => {
    await setAdminViewer();
    const destination = mainSpace();
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
    const result = await confirmMemberImportAction("wavesparks", {
      destinationSpaceId: destination.id,
      accessStatus: "active",
      rows: [
        { rowNumber: 2, email: connectedEmail, name: "Existing Clerk User" },
        { rowNumber: 3, email: pendingEmail, name: "Pending Invitation" },
        { rowNumber: 4, email: "bulk-new@example.com", name: "Brand New" },
      ],
    });

    expect(result.summary).toMatchObject({
      connected: 0,
      invited: 3,
      spaceAdded: 3,
      failed: 0,
    });
    expect(getUserListMock).not.toHaveBeenCalled();
    expect(createOrganizationMembershipMock).not.toHaveBeenCalled();
    expect(createOrganizationInvitationBulkMock).not.toHaveBeenCalled();
    expect(createClerkIdentityInvitationMock).toHaveBeenCalledTimes(3);
    const pendingUser = getStore().users.find((user) => user.email === pendingEmail);
    const pendingMembership = getStore().memberships.find(
      (membership) => membership.userId === pendingUser?.id,
    )!;
    expect(
      getStore().membershipInvitations.find(
        (invitation) => invitation.membershipId === pendingMembership.id,
      ),
    ).toMatchObject({ status: "pending", sentAt: expect.any(String) });
  });

  it("retries only retryable memberships from the current organization", async () => {
    await setAdminViewer();
    const store = getStore();
    const retryable = store.memberships.find((membership) => membership.id === "mem_priya")!;
    retryable.accountStatus = "invited";
    addLocalInvitation({
      membershipId: retryable.id,
      email: "priya@example.com",
      deliveryError: "Previous failure",
    });
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

    const result = await retryMemberInvitationsAction("wavesparks", [
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
    expect(createOrganizationInvitationBulkMock).not.toHaveBeenCalled();
    expect(createClerkIdentityInvitationMock).toHaveBeenCalledTimes(1);
    expect(
      getStore().membershipInvitations.filter(
        (invitation) => invitation.membershipId === retryable.id,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "pending", sentAt: expect.any(String) }),
        expect.objectContaining({ status: "revoked" }),
      ]),
    );
  });

  it("does not create membership invitations for an already connected account", async () => {
    await setAdminViewer();
    const connected = (await getMembershipById("mem_jules"))!;
    connected.accountStatus = "connected";

    const result = await retryMemberInvitationsAction("wavesparks", [connected.id]);

    expect(result.rows).toEqual([
      expect.objectContaining({
        membershipId: connected.id,
        status: "skipped",
        retryable: false,
        message: "This invitation is no longer retryable.",
      }),
    ]);
    expect(createOrganizationInvitationBulkMock).not.toHaveBeenCalled();
    expect(createClerkIdentityInvitationMock).not.toHaveBeenCalled();
  });

  it("creates a cohort and redirects admins into the cohort detail", async () => {
    await setAdminViewer();
    const formData = formDataFromEntries({
      name: "Cohort Action Demo",
      event_label: "July 2026",
      description: "Action-created cohort.",
    });

    await expect(
      createCohortAction("wavesparks", formData),
    ).rejects.toThrow(/NEXT_REDIRECT:\/org\/wavesparks\/admin\/cohorts\/coh_/);

    const cohort = getStore().cohorts.find(
      (candidate) => candidate.name === "Cohort Action Demo",
    );

    expect(cohort).toMatchObject({
      eventLabel: "July 2026",
      orgId: seedOrganization.id,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/admin/cohorts");
  });

  it("imports cohort students with local invitations", async () => {
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
      importCohortStudentsAction("wavesparks", cohort.id, formData),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/org/wavesparks/admin/cohorts/${cohort.id}?status=cohort_students_imported&sent=1&failed=0`,
    );

    const [record] = await listCohortMemberRecordsForCohort(seedOrganization.id, cohort.id);

    expect(record.membership.status).toBe("pending");
    await expect(getSpaceMembership(cohort.id, record.membership.id)).resolves.toMatchObject({
      accessStatus: "active",
    });
    expect(record.cohortMember).toMatchObject({
      invitedEmail: "cohort.student@example.com",
      status: "invited",
    });
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
    expect(createClerkIdentityInvitationMock).toHaveBeenCalledTimes(1);
    expect(afterMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/admin/cohorts");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      `/org/wavesparks/admin/cohorts/${cohort.id}`,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/admin/members");

    expect(
      getStore().membershipInvitations.find(
        (invitation) => invitation.membershipId === record.membership.id,
      ),
    ).toMatchObject({ status: "pending", sentAt: expect.any(String) });
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
      importCohortStudentsAction("wavesparks", cohort.id, formData),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/org/wavesparks/admin/cohorts/${cohort.id}?status=cohort_import_invalid`,
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
      importCohortStudentsAction("wavesparks", cohort.id, formData),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/org/wavesparks/admin/cohorts/${cohort.id}?status=cohort_import_empty`,
    );

    expect(await listCohortMemberRecordsForCohort(seedOrganization.id, cohort.id)).toEqual([]);
    expect(afterMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not require an active Clerk organization for cohort invitations", async () => {
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
      importCohortStudentsAction("wavesparks", cohort.id, formData),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/org/wavesparks/admin/cohorts/${cohort.id}?status=cohort_students_imported&sent=1&failed=0`,
    );

    expect(await listCohortMemberRecordsForCohort(seedOrganization.id, cohort.id)).toHaveLength(1);
    expect(afterMock).not.toHaveBeenCalled();
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
    expect(createClerkIdentityInvitationMock).toHaveBeenCalledTimes(1);
  });

  it("keeps legacy Cohort promotion disabled without granting Main access", async () => {
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
      promoteCohortMembersAction("wavesparks", cohort.id, formData),
    ).rejects.toThrow(
      "This old event action is no longer available. Add participants to Wavesparks Community from the event page.",
    );

    const [record] = await listCohortMemberRecordsForCohort(seedOrganization.id, cohort.id);

    await expect(getMembershipById(imported.membership.id)).resolves.toMatchObject({
      status: "pending",
    });
    expect(record.cohortMember.status).toBe("invited");
    await expect(getSpaceMembership(cohort.id, imported.membership.id)).resolves.toMatchObject({
      accessStatus: "active",
    });
    await expect(
      getSpaceMembership(mainSpace().id, imported.membership.id),
    ).resolves.toBeUndefined();
    expect(afterMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not let inactive legacy Cohort rows bypass the disabled promotion path", async () => {
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
      promoteCohortMembersAction("wavesparks", cohort.id, formData),
    ).rejects.toThrow(
      "This old event action is no longer available. Add participants to Wavesparks Community from the event page.",
    );
    expect(await getMembershipById(imported.membership.id)).toMatchObject({
      status: "suspended",
    });
  });

  it("creates a manual intro before writing receiver side effects after the response", async () => {
    const adminMembership = await setAdminViewer();
    const receiverMembership = (await getMembershipById("mem_jules"))!;
    const space = mainSpace();
    const formData = formDataFromEntries({
      space_id: space.id,
      requester_membership_id: adminMembership.id,
      receiver_membership_id: receiverMembership.id,
      intro_purpose: "mentor guidance",
      note: "This intro is curated by an admin.",
      suggested_first_message: "Would you be open to a short conversation?",
    });

    await expect(
      createManualIntroAction("wavesparks", formData),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/org/wavesparks/admin/requests?space_id=${space.id}&status=manual_intro_created`,
    );

    const intro = getStore().introRequests.find(
      (request) =>
        request.requesterMembershipId === adminMembership.id &&
        request.receiverMembershipId === receiverMembership.id &&
        request.sourceType === "admin_manual",
    );
    expect(intro).toMatchObject({ spaceId: space.id });
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
          title: "A Wavesparks introduction in Wavesparks Community",
          link: "/org/wavesparks/s/main/requests",
        }),
      ]),
    );
    expect(afterMock).toHaveBeenCalledTimes(3);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/admin/requests");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/requests");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/s/main/requests");

    await runAfterCallbacks();

    await expect(getNotificationViews(receiverMembership.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "A Wavesparks introduction in Wavesparks Community",
          link: "/org/wavesparks/s/main/requests",
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
    const space = mainSpace();
    const sameMemberForm = formDataFromEntries({
      space_id: space.id,
      requester_membership_id: adminMembership.id,
      receiver_membership_id: adminMembership.id,
      intro_purpose: "invalid self intro",
      note: "The same person cannot be introduced to themselves.",
      suggested_first_message: "Would you be open to connecting?",
    });

    await expect(createManualIntroAction("wavesparks", sameMemberForm)).rejects.toThrow(
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
      space_id: space.id,
      requester_membership_id: adminMembership.id,
      receiver_membership_id: "mem_jules",
      intro_purpose: "invalid opted-out intro",
      note: "This person is not currently open to introductions.",
      suggested_first_message: "Would you be open to connecting?",
    });

    await expect(createManualIntroAction("wavesparks", optedOutForm)).rejects.toThrow(
      "Both people must have connected accounts, complete profiles, and intro availability.",
    );
    expect(
      getStore().introRequests.some(
        (request) =>
          request.sourceType === "admin_manual" &&
          request.receiverMembershipId === "mem_jules",
      ),
    ).toBe(false);
  });

  it("requires the admin, requester, and receiver to be active in the same intro Space", async () => {
    const adminMembership = await setAdminViewer();
    const event = await createEventDestination("Manual intro boundary event");
    await grantSpaceMembership({
      orgId: seedOrganization.id,
      spaceId: event.id,
      membershipId: adminMembership.id,
      accessStatus: "active",
    });
    const formData = formDataFromEntries({
      space_id: event.id,
      requester_membership_id: adminMembership.id,
      receiver_membership_id: "mem_jules",
      intro_purpose: "cross-Space attempt",
      note: "Both people should belong to the same Event.",
      suggested_first_message: "Would you be open to connecting?",
    });

    await expect(createManualIntroAction("wavesparks", formData)).rejects.toThrow(
      "Both people need active access to this community or event.",
    );
    expect(
      getStore().introRequests.some(
        (request) => request.spaceId === event.id && request.sourceType === "admin_manual",
      ),
    ).toBe(false);
  });

  it("rejects legacy community status updates without restoring Main access", async () => {
    await setAdminViewer();
    const main = mainSpace();
    await expect(getSpaceMembership(main.id, "mem_priya")).resolves.toBeUndefined();
    const formData = formDataFromEntries({
      status: "approved",
      approval_note: "Approved after profile review.",
    });

    await expect(
      updateMembershipAction("wavesparks", "mem_priya", formData),
    ).rejects.toThrow(
      "This old member action is no longer available. Manage account status and community or event access separately.",
    );

    await expect(getMembershipById("mem_priya")).resolves.toMatchObject({
      status: "pending",
    });
    await expect(getSpaceMembership(main.id, "mem_priya")).resolves.toBeUndefined();
    expect(afterMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("updates account safety without changing legacy status or Main entitlement", async () => {
    await setAdminViewer();
    const main = mainSpace();
    const formData = formDataFromEntries({
      account_status: "connected",
      approval_note: "Account safety reviewed.",
    });

    await expect(updateMembershipAction("wavesparks", "mem_priya", formData)).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavesparks/admin/members?status=membership_updated",
    );
    await expect(getMembershipById("mem_priya")).resolves.toMatchObject({
      accountStatus: "connected",
      approvalNote: "Account safety reviewed.",
      status: "pending",
    });
    await expect(getSpaceMembership(main.id, "mem_priya")).resolves.toBeUndefined();
    expect(
      getStore().notifications.some(
        (notification) =>
          notification.membershipId === "mem_priya" &&
          notification.type === "membership_approved",
      ),
    ).toBe(false);
  });

  it("approves a mentor independently and schedules every affected Space for recompute", async () => {
    const adminMembership = await setAdminViewer();
    const main = mainSpace();
    await grantSpaceMembership({
      orgId: seedOrganization.id,
      spaceId: main.id,
      membershipId: "mem_priya",
      accessStatus: "active",
    });
    const formData = formDataFromEntries({ mentor_status: "approved" });

    await expect(
      updateMentorDesignationAction("wavesparks", "mem_priya", formData),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavesparks/admin/members?status=membership_updated",
    );

    await expect(getMembershipById("mem_priya")).resolves.toMatchObject({
      role: "member",
      mentorStatus: "approved",
      mentorReviewedAt: expect.any(String),
      mentorReviewedByMembershipId: adminMembership.id,
    });
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/mentoring");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/people");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/people/mem_priya");
  });

  it("re-authorizes mentor designation changes inside the Server Action", async () => {
    const before = (await getMembershipById("mem_priya"))!.mentorStatus;
    const formData = formDataFromEntries({ mentor_status: "approved" });

    await expect(
      updateMentorDesignationAction("wavesparks", "mem_priya", formData),
    ).rejects.toThrow("Unauthorized.");

    await expect(getMembershipById("mem_priya")).resolves.toMatchObject({
      mentorStatus: before,
    });
    expect(afterMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("updates profile flags before recomputing matches after the response", async () => {
    await setAdminViewer();
    const profile = (await getProfileByMembershipId("mem_jules"))!;
    const formData = formDataFromEntries({
      featured: "true",
      stale: "true",
    });

    await expect(
      updateProfileFlagsAction("wavesparks", profile.id, formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/admin/profiles?status=profile_flags_updated");

    await expect(getProfileByMembershipId("mem_jules")).resolves.toMatchObject({
      featured: true,
      stale: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/admin/profiles");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/org/wavesparks/matches");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/org/wavesparks/admin/matches");
    expect(afterMock).toHaveBeenCalledTimes(1);

    const backgroundTask = afterMock.mock.calls[0]?.[0] as
      | (() => Promise<void>)
      | undefined;
    await backgroundTask?.();

    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/matches");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/admin/matches");
  });

  it("moderates opportunity posts with detail and opportunity list revalidation", async () => {
    await setAdminViewer();
    const post = getStore().posts.find((candidate) => candidate.type === "opportunity")!;
    const formData = formDataFromEntries({
      hidden: "true",
    });

    await expect(
      updatePostModerationAction("wavesparks", post.id, formData),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/admin/posts?status=post_moderation_updated");

    expect(getStore().posts.find((candidate) => candidate.id === post.id)).toMatchObject({
      hidden: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/admin/posts");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/org/wavesparks/posts/${post.id}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/opportunities");
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
      moderateCommentAction("wavesparks", comment.id, "removed"),
    ).rejects.toThrow("NEXT_REDIRECT:/org/wavesparks/admin/posts?status=comment_moderation_updated");

    expect(getStore().comments.find((candidate) => candidate.id === comment.id)).toMatchObject({
      status: "removed",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/admin/posts");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/org/wavesparks/posts/${post.id}`);
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/org/wavesparks/opportunities");
  });
});

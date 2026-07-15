import { beforeEach, describe, expect, it } from "vitest";

import { seedOrganization } from "@/data/seed-data";
import {
  addMembershipToCohort,
  archiveCohort,
  bulkImportMembersForOrg,
  createCohort,
  createManagedAccount,
  getStore,
  listCohortRecordsForOrg,
  listMemberImportCandidatesForOrg,
  listMemberWorkspaceForOrg,
  resetStore,
  updateCohort,
  updateMembershipClerkState,
  updateMembershipStatus,
} from "@/server/store";

describe("admin member workspace store", () => {
  beforeEach(() => {
    resetStore();
  });

  it("imports idempotently without overwriting existing member data", async () => {
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Store Import",
      createdByMembershipId: "mem_avery",
    });
    const [first] = await bulkImportMembersForOrg({
      orgId: seedOrganization.id,
      cohortId: cohort.id,
      members: [
        { email: "new.store.member@example.com", name: "Original Name", rowNumber: 2 },
        { email: "NEW.STORE.MEMBER@example.com", name: "Duplicate Name", rowNumber: 3 },
      ],
      status: "waitlist",
      invitedByUserId: "usr_avery",
    });
    const [second] = await bulkImportMembersForOrg({
      orgId: seedOrganization.id,
      cohortId: cohort.id,
      members: [{ email: "new.store.member@example.com", name: "Replacement Name" }],
      status: "approved",
      invitedByUserId: "usr_maya",
    });

    expect(first).toMatchObject({
      input: { name: "Original Name", rowNumber: 2 },
      membershipCreated: true,
      cohortMemberCreated: true,
      classification: "created",
      shouldInvite: true,
    });
    expect(first.membership).toMatchObject({
      status: "waitlist",
      role: "member",
      invitedByUserId: "usr_avery",
    });
    expect(second).toMatchObject({
      membershipCreated: false,
      cohortMemberCreated: false,
      classification: "existing",
    });
    expect(second.user.name).toBe("Original Name");
    expect(second.membership).toMatchObject({
      id: first.membership.id,
      status: "waitlist",
      role: "member",
      invitedByUserId: "usr_avery",
    });
    expect(
      getStore().memberships.filter(
        (membership) =>
          membership.orgId === seedOrganization.id && membership.userId === first.user.id,
      ),
    ).toHaveLength(1);
  });

  it("tracks the inviter for single creates and adds the member to a cohort idempotently", async () => {
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Single Invite",
      createdByMembershipId: "mem_avery",
    });
    const created = await createManagedAccount({
      orgId: seedOrganization.id,
      email: "single.store.member@example.com",
      name: "Single Store Member",
      role: "member",
      status: "pending",
      invitedByUserId: "usr_avery",
    });
    const firstLink = await addMembershipToCohort(
      seedOrganization.id,
      cohort.id,
      created.membership,
      created.user,
    );
    const secondLink = await addMembershipToCohort(
      seedOrganization.id,
      cohort.id,
      created.membership,
      { email: created.user.email, name: "Replacement Snapshot" },
    );
    const updated = await createManagedAccount({
      orgId: seedOrganization.id,
      email: created.user.email,
      name: created.user.name,
      role: "member",
      status: "pending",
      invitedByUserId: "usr_maya",
    });

    expect(created.membership.invitedByUserId).toBe("usr_avery");
    expect(updated.membership.invitedByUserId).toBe("usr_avery");
    expect(firstLink.created).toBe(true);
    expect(secondLink).toMatchObject({
      created: false,
      cohortMember: {
        id: firstLink.cohortMember.id,
        invitedName: "Single Store Member",
      },
    });
  });

  it("links active members but keeps inactive members as explicit conflicts", async () => {
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Existing Members",
      createdByMembershipId: "mem_avery",
    });
    const approvedUser = getStore().users.find((user) => user.id === "usr_jules")!;
    const suspendedUser = getStore().users.find((user) => user.id === "usr_nora")!;
    const results = await bulkImportMembersForOrg({
      orgId: seedOrganization.id,
      cohortId: cohort.id,
      members: [
        { email: approvedUser.email, name: "Do Not Rename" },
        { email: suspendedUser.email, name: "Do Not Restore" },
      ],
      status: "pending",
      invitedByUserId: "usr_avery",
    });
    const approved = results.find((result) => result.user.id === approvedUser.id)!;
    const suspended = results.find((result) => result.user.id === suspendedUser.id)!;

    expect(approved).toMatchObject({
      classification: "existing",
      membershipCreated: false,
      cohortMemberCreated: true,
    });
    expect(approved.user.name).toBe(approvedUser.name);
    expect(approved.membership).toMatchObject({ status: "approved", role: "member" });
    expect(suspended).toMatchObject({
      classification: "conflict",
      conflictReason: "suspended",
      cohortMemberCreated: false,
      shouldInvite: false,
    });
    expect(suspended.cohortMember).toBeUndefined();
  });

  it("supports batch preview and paginated member workspace filters", async () => {
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Workspace Filter",
      createdByMembershipId: "mem_avery",
    });
    const imported = await bulkImportMembersForOrg({
      orgId: seedOrganization.id,
      cohortId: cohort.id,
      members: Array.from({ length: 30 }, (_, index) => ({
        email: `workspace.${String(index).padStart(2, "0")}@example.com`,
        name: `Workspace Person ${String(index).padStart(2, "0")}`,
      })),
      status: "pending",
      invitedByUserId: "usr_avery",
    });
    await updateMembershipClerkState(imported[0].membership.id, {
      clerkInvitationId: "inv_workspace_pending",
      clerkInvitationStatus: "pending",
    });
    await updateMembershipClerkState(imported[1].membership.id, {
      clerkMembershipId: "clm_workspace_connected",
      clerkInvitationStatus: "accepted",
    });

    const preview = await listMemberImportCandidatesForOrg(
      seedOrganization.id,
      ["WORKSPACE.00@example.com", "workspace.00@example.com", "missing@example.com"],
      cohort.id,
    );
    const firstPage = await listMemberWorkspaceForOrg(seedOrganization.id, {
      query: "Workspace Person",
      status: "pending",
      cohortId: cohort.id,
    });
    const secondPage = await listMemberWorkspaceForOrg(seedOrganization.id, {
      query: "workspace.",
      status: "pending",
      cohortId: cohort.id,
      page: 2,
    });
    const pendingInvitation = await listMemberWorkspaceForOrg(seedOrganization.id, {
      invitationStatus: "pending",
    });
    const connected = await listMemberWorkspaceForOrg(seedOrganization.id, {
      invitationStatus: "connected",
    });

    expect(preview).toHaveLength(2);
    expect(preview[0]).toMatchObject({
      email: "workspace.00@example.com",
      inCohort: true,
    });
    expect(preview[1]).toEqual({ email: "missing@example.com", inCohort: false });
    expect(firstPage).toMatchObject({ total: 30, page: 1, pageSize: 25, pageCount: 2 });
    expect(firstPage.records).toHaveLength(25);
    expect(firstPage.records.every((record) => record.cohorts[0]?.id === cohort.id)).toBe(true);
    expect(secondPage.records).toHaveLength(5);
    expect(
      pendingInvitation.records.some(
        (record) => record.membership.id === imported[0].membership.id,
      ),
    ).toBe(true);
    expect(
      connected.records.some((record) => record.membership.id === imported[1].membership.id),
    ).toBe(true);
  });

  it("derives cohort metrics from membership and invitation state and safely archives", async () => {
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Metrics Cohort",
      createdByMembershipId: "mem_avery",
    });
    const [imported] = await bulkImportMembersForOrg({
      orgId: seedOrganization.id,
      cohortId: cohort.id,
      members: [{ email: "metrics.member@example.com", name: "Metrics Member" }],
      status: "waitlist",
      invitedByUserId: "usr_avery",
    });
    imported.cohortMember!.status = "promoted";
    await updateMembershipClerkState(imported.membership.id, {
      clerkInvitationStatus: "failed",
      clerkInvitationError: "rate_limited",
    });

    let [summary] = await listCohortRecordsForOrg(seedOrganization.id);
    expect(summary).toMatchObject({
      totalMembers: 1,
      needsDecisionMembers: 1,
      activeMembers: 0,
      needsAttentionMembers: 1,
      invitedMembers: 1,
      promotedMembers: 0,
    });

    await updateMembershipStatus(imported.membership.id, "approved", "Approved in test.");
    summary = (await listCohortRecordsForOrg(seedOrganization.id))[0];
    expect(summary).toMatchObject({
      totalMembers: 1,
      needsDecisionMembers: 0,
      activeMembers: 1,
      needsAttentionMembers: 1,
      invitedMembers: 0,
      promotedMembers: 1,
    });

    const edited = await updateCohort(seedOrganization.id, cohort.id, {
      name: "Edited Metrics Cohort",
      eventLabel: "August 2026",
    });
    const archived = await archiveCohort(seedOrganization.id, cohort.id);
    expect(edited).toMatchObject({ name: "Edited Metrics Cohort", eventLabel: "August 2026" });
    expect(archived?.status).toBe("archived");
    await expect(
      bulkImportMembersForOrg({
        orgId: seedOrganization.id,
        cohortId: cohort.id,
        members: [{ email: "late.member@example.com" }],
        status: "waitlist",
        invitedByUserId: "usr_avery",
      }),
    ).rejects.toThrow("Archived cohorts cannot accept new members.");
  });
});

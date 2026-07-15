import { beforeEach, describe, expect, it } from "vitest";

import { seedOrganization } from "@/data/seed-data";
import { canAccessFeed } from "@/server/permissions";
import {
  createCohort,
  getMembershipById,
  getProfileByMembershipId,
  getSpaceMembership,
  getUserById,
  importCohortMembers,
  listCohortMemberRecordsForCohort,
  listCohortRecordsForOrg,
  promoteCohortMembers,
  resetStore,
} from "@/server/store";

describe("cohort management", () => {
  beforeEach(() => {
    resetStore();
  });

  it("imports event students without downgrading existing approved members", async () => {
    const existingApprovedMembership = (await getMembershipById("mem_jules"))!;
    const existingApprovedUser = (await getUserById(existingApprovedMembership.userId))!;
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Demo Day July",
      eventLabel: "July 2026",
      createdByMembershipId: "mem_avery",
    });

    const imported = await importCohortMembers(seedOrganization.id, cohort.id, [
      { email: "new.student@example.com", name: "New Student" },
      { email: existingApprovedUser.email, name: "Existing Member" },
      { email: "new.student@example.com", name: "Duplicate Student" },
    ]);

    const newStudent = imported.find(
      (result) => result.cohortMember.invitedEmail === "new.student@example.com",
    );
    const existingStudent = imported.find(
      (result) => result.membership.id === existingApprovedMembership.id,
    );
    const summaries = await listCohortRecordsForOrg(seedOrganization.id);
    const members = await listCohortMemberRecordsForCohort(seedOrganization.id, cohort.id);

    expect(imported).toHaveLength(2);
    expect(newStudent?.membership).toMatchObject({
      status: "pending",
      programName: "Demo Day July",
      cohortNameOrYear: "July 2026",
    });
    expect(newStudent).toMatchObject({
      membershipCreated: true,
      cohortMemberCreated: true,
      shouldInvite: true,
    });
    await expect(
      getSpaceMembership(cohort.id, newStudent!.membership.id),
    ).resolves.toMatchObject({ accessStatus: "active" });
    expect(existingStudent?.membership.status).toBe("approved");
    expect(existingStudent?.cohortMember.status).toBe("promoted");
    expect(summaries[0]).toMatchObject({
      invitedMembers: 1,
      promotedMembers: 1,
      totalMembers: 2,
    });
    expect(members.map((record) => record.membership.id).sort()).toEqual(
      [newStudent?.membership.id, existingApprovedMembership.id].sort(),
    );
  });

  it("promotes selected cohort members into the main community without completing onboarding", async () => {
    const cohort = await createCohort({
      orgId: seedOrganization.id,
      name: "Student Pitch Night",
      createdByMembershipId: "mem_avery",
    });
    const [imported] = await importCohortMembers(seedOrganization.id, cohort.id, [
      { email: "pitch.student@example.com", name: "Pitch Student" },
    ]);

    expect(canAccessFeed(imported.membership, imported.profile)).toBe(false);

    const promoted = await promoteCohortMembers(
      seedOrganization.id,
      cohort.id,
      [imported.membership.id],
      "Approved after cohort review.",
    );
    const membership = (await getMembershipById(imported.membership.id))!;
    const profile = await getProfileByMembershipId(imported.membership.id);
    const members = await listCohortMemberRecordsForCohort(seedOrganization.id, cohort.id);

    expect(promoted).toHaveLength(1);
    expect(promoted[0]).toMatchObject({ statusChanged: true });
    expect(membership).toMatchObject({
      status: "approved",
      approvalNote: "Approved after cohort review.",
    });
    expect(members[0].cohortMember).toMatchObject({ status: "promoted" });
    expect(canAccessFeed(membership, profile)).toBe(false);
  });
});

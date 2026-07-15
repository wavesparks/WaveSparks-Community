import { beforeEach, describe, expect, it } from "vitest";

import { seedOrganization } from "@/data/seed-data";
import { buildMemberImportPreview } from "@/server/member-import";
import {
  addMembershipsToMainCommunity,
  archiveEventSpace,
  bulkImportMembersForOrg,
  createEventSpace,
  createManagedAccount,
  getSpaceMembership,
  getStore,
  grantSpaceMembership,
  listSpacesForOrg,
  resetStore,
  restoreEventSpace,
  setSpaceMembershipAccessStatus,
  updateEventSpace,
  updateMembershipAccountStatus,
} from "@/server/store";

describe("Admin Space access and import store", () => {
  beforeEach(() => {
    resetStore();
  });

  async function createEvent(name = "Space Test Event") {
    return createEventSpace({
      orgId: seedOrganization.id,
      name,
      lifecycle: "active",
      createdByMembershipId: "mem_avery",
    });
  }

  it("imports into one required destination without granting Main or rewriting legacy status", async () => {
    const event = await createEvent();
    const [first] = await bulkImportMembersForOrg({
      orgId: seedOrganization.id,
      destinationSpaceId: event.id,
      accessStatus: "active",
      members: [{ email: "event.only@example.com", name: "Event Only" }],
      invitedByUserId: "usr_avery",
    });
    const [second] = await bulkImportMembersForOrg({
      orgId: seedOrganization.id,
      destinationSpaceId: event.id,
      accessStatus: "active",
      members: [{ email: "event.only@example.com", name: "Replacement Name" }],
      invitedByUserId: "usr_maya",
    });
    const main = (await listSpacesForOrg(seedOrganization.id)).find(
      (space) => space.kind === "main",
    )!;

    expect(first).toMatchObject({
      membershipCreated: true,
      spaceMembershipCreated: true,
      cohortMemberCreated: true,
      classification: "created",
    });
    expect(first.membership).toMatchObject({
      role: "member",
      status: "pending",
      invitedByUserId: "usr_avery",
    });
    expect(first.spaceMembership).toMatchObject({
      spaceId: event.id,
      accessStatus: "active",
    });
    expect(await getSpaceMembership(main.id, first.membership.id)).toBeUndefined();
    expect(second).toMatchObject({
      membershipCreated: false,
      spaceMembershipCreated: false,
      spaceMembershipUpdated: false,
      classification: "existing",
    });
    expect(second.user.name).toBe("Event Only");
  });

  it("never silently restores rejected, suspended, or removed Space access", async () => {
    const event = await createEvent();
    await grantSpaceMembership({
      orgId: seedOrganization.id,
      spaceId: event.id,
      membershipId: "mem_priya",
      accessStatus: "active",
      invitedByMembershipId: "mem_avery",
    });
    await setSpaceMembershipAccessStatus({
      orgId: seedOrganization.id,
      spaceId: event.id,
      membershipId: "mem_priya",
      accessStatus: "removed",
      actorMembershipId: "mem_avery",
    });

    const [result] = await bulkImportMembersForOrg({
      orgId: seedOrganization.id,
      destinationSpaceId: event.id,
      accessStatus: "active",
      members: [{ email: "priya@example.com" }],
      invitedByUserId: "usr_avery",
    });

    expect(result).toMatchObject({
      classification: "conflict",
      conflictReason: "removed",
      spaceMembershipCreated: false,
      spaceMembershipUpdated: false,
      shouldInvite: false,
    });
    expect((await getSpaceMembership(event.id, "mem_priya"))?.accessStatus).toBe("removed");
  });

  it("adds Event participants to Main idempotently and keeps Event access unchanged", async () => {
    const event = await createEvent();
    await grantSpaceMembership({
      orgId: seedOrganization.id,
      spaceId: event.id,
      membershipId: "mem_priya",
      accessStatus: "active",
      invitedByMembershipId: "mem_avery",
    });

    const first = await addMembershipsToMainCommunity({
      orgId: seedOrganization.id,
      sourceSpaceId: event.id,
      membershipIds: ["mem_priya"],
      actorMembershipId: "mem_avery",
    });
    const second = await addMembershipsToMainCommunity({
      orgId: seedOrganization.id,
      sourceSpaceId: event.id,
      membershipIds: ["mem_priya"],
      actorMembershipId: "mem_avery",
    });
    const main = getStore().spaces.find((space) => space.kind === "main")!;

    expect(first[0]).toMatchObject({ status: "added" });
    expect(second[0]).toMatchObject({ status: "already_in_main" });
    expect((await getSpaceMembership(main.id, "mem_priya"))?.accessStatus).toBe("active");
    expect((await getSpaceMembership(event.id, "mem_priya"))?.accessStatus).toBe("active");
    expect(getStore().memberships.find((membership) => membership.id === "mem_priya")?.status)
      .toBe("pending");
  });

  it("reports global account conflicts without changing either Space", async () => {
    const event = await createEvent();
    await grantSpaceMembership({
      orgId: seedOrganization.id,
      spaceId: event.id,
      membershipId: "mem_priya",
      accessStatus: "active",
      invitedByMembershipId: "mem_avery",
    });
    await updateMembershipAccountStatus("mem_priya", "suspended", {
      recomputeMatches: false,
    });

    const [result] = await addMembershipsToMainCommunity({
      orgId: seedOrganization.id,
      sourceSpaceId: event.id,
      membershipIds: ["mem_priya"],
      actorMembershipId: "mem_avery",
    });
    const main = getStore().spaces.find((space) => space.kind === "main")!;

    expect(result).toMatchObject({ status: "account_conflict" });
    expect(await getSpaceMembership(main.id, "mem_priya")).toBeUndefined();
    expect((await getSpaceMembership(event.id, "mem_priya"))?.accessStatus).toBe("active");
  });

  it("keeps global admin role separate from social Space participation", async () => {
    const created = await createManagedAccount({
      orgId: seedOrganization.id,
      email: "admin.no.space@example.com",
      name: "Global Admin Only",
      role: "org_admin",
      status: "pending",
      invitedByUserId: "usr_avery",
    });

    expect(created.membership).toMatchObject({ role: "org_admin", accountStatus: "invited" });
    expect(
      getStore().spaceMemberships.some(
        (spaceMembership) => spaceMembership.membershipId === created.membership.id,
      ),
    ).toBe(false);
  });

  it("supports Event archive and restore while Main remains permanent", async () => {
    const event = await createEvent();
    const main = getStore().spaces.find((space) => space.kind === "main")!;

    await expect(archiveEventSpace(seedOrganization.id, main.id)).rejects.toThrow(
      "Main Community cannot be archived",
    );
    expect((await archiveEventSpace(seedOrganization.id, event.id))?.lifecycle).toBe("archived");
    await expect(
      grantSpaceMembership({
        orgId: seedOrganization.id,
        spaceId: event.id,
        membershipId: "mem_priya",
      }),
    ).rejects.toThrow("Archived Spaces cannot accept new members");
    expect((await restoreEventSpace(seedOrganization.id, event.id, "ended"))?.lifecycle)
      .toBe("ended");
    await expect(
      grantSpaceMembership({
        orgId: seedOrganization.id,
        spaceId: event.id,
        membershipId: "mem_priya",
      }),
    ).resolves.toMatchObject({ outcome: "added" });
  });

  it("requires explicit archive instead of silently returning a published Event to draft", async () => {
    const event = await createEvent();

    await expect(
      updateEventSpace(seedOrganization.id, event.id, { lifecycle: "draft" }),
    ).rejects.toThrow(
      "A published Event cannot return to draft. Archive it explicitly to close member access.",
    );
    expect(getStore().spaces.find((space) => space.id === event.id)?.lifecycle).toBe(
      "active",
    );
  });

  it("previews account and destination-Space conflicts independently", async () => {
    const event = await createEvent();
    await setSpaceMembershipAccessStatus({
      orgId: seedOrganization.id,
      spaceId: event.id,
      membershipId: "mem_priya",
      accessStatus: "rejected",
      actorMembershipId: "mem_avery",
    });

    const preview = await buildMemberImportPreview(seedOrganization, {
      destinationSpaceId: event.id,
      accessStatus: "active",
      rows: [{ rowNumber: 2, email: "priya@example.com", name: "Priya" }],
    });

    expect(preview).toMatchObject({
      destinationSpaceId: event.id,
      destinationSpaceKind: "event",
      accessStatus: "active",
    });
    expect(preview.rows[0]).toMatchObject({
      classification: "inactive_conflict",
      spaceAction: "conflict",
    });
  });
});

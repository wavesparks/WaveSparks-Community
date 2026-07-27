import { and, eq } from "drizzle-orm";

import { loadScriptEnv } from "./load-script-env";
import { assertWriteAllowed, databaseTarget, readScriptTarget } from "./script-safety";

async function main() {
  const target = readScriptTarget();
  loadScriptEnv(target.environment);

  const { getDb, getSqlClient } = await import("@/db/client");
  const { memberships, organizations } = await import("@/db/schema");
  const { env } = await import("@/lib/env");
  const { sendMembershipInvitation } = await import(
    "@/server/membership-invitations"
  );
  const {
    getMembershipRecordById,
    getOrganizationBySlug,
    listMembershipInvitationsForMembership,
  } = await import("@/server/store");

  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const db = getDb();
  try {
    const legacyPending = await db
      .select({
        clerkInvitationId: memberships.clerkInvitationId,
        clerkOrgId: organizations.clerkOrgId,
        membershipId: memberships.id,
        orgId: memberships.orgId,
        orgSlug: organizations.slug,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(
        and(
          eq(memberships.accountStatus, "invited"),
          eq(memberships.clerkInvitationStatus, "pending"),
        ),
      );
    const adminRows = await db
      .select({
        membershipId: memberships.id,
        orgId: memberships.orgId,
      })
      .from(memberships)
      .where(
        and(
          eq(memberships.role, "org_admin"),
          eq(memberships.accountStatus, "connected"),
        ),
      );
    const creatorByOrgId = new Map(
      adminRows.map((row) => [row.orgId, row.membershipId]),
    );

    console.info(
      `Invitation migration target: ${target.environment} (${databaseTarget(env.databaseUrl)}).`,
    );
    console.info(`Legacy pending invitations: ${legacyPending.length}.`);
    if (legacyPending.length) {
      console.info(
        `Membership IDs: ${legacyPending.map((row) => row.membershipId).join(", ")}`,
      );
    }

    if (!assertWriteAllowed(target)) {
      console.info(
        "Dry run only. Re-run with --apply to create local invitations and send replacement emails.",
      );
      return;
    }
    if (!env.clerkSecretKey) {
      throw new Error("CLERK_SECRET_KEY is required to revoke legacy Clerk invitations.");
    }

    const { createClerkClient } = await import("@clerk/backend");
    const clerk = createClerkClient({ secretKey: env.clerkSecretKey });

    let sent = 0;
    let alreadySent = 0;
    let legacyRevoked = 0;
    const failedMembershipIds: string[] = [];
    for (const row of legacyPending) {
      const creatorMembershipId = creatorByOrgId.get(row.orgId);
      if (!creatorMembershipId) {
        console.error(
          `Invitation migration skipped membership ${row.membershipId}: no connected local administrator.`,
        );
        failedMembershipIds.push(row.membershipId);
        continue;
      }

      const [org, record] = await Promise.all([
        getOrganizationBySlug(row.orgSlug),
        getMembershipRecordById(row.membershipId),
      ]);
      if (!org || !record?.user || record.membership.orgId !== org.id) {
        console.error(
          `Invitation migration skipped membership ${row.membershipId}: local record unavailable.`,
        );
        failedMembershipIds.push(row.membershipId);
        continue;
      }

      try {
        const now = new Date().toISOString();
        const localInvitations = await listMembershipInvitationsForMembership(
          row.membershipId,
          { orgId: row.orgId },
        );
        const alreadyDelivered = localInvitations.some(
          (invitation) =>
            invitation.status === "pending" &&
            invitation.expiresAt > now &&
            Boolean(invitation.sentAt) &&
            !invitation.deliveryError,
        );

        if (alreadyDelivered) {
          alreadySent += 1;
        } else {
          await sendMembershipInvitation({
            forceNew: true,
            inviterMembershipId: creatorMembershipId,
            membership: record.membership,
            org,
            user: record.user,
          });
          sent += 1;
        }

        if (row.clerkInvitationId && row.clerkOrgId) {
          try {
            await clerk.organizations.revokeOrganizationInvitation({
              invitationId: row.clerkInvitationId,
              organizationId: row.clerkOrgId,
            });
          } catch (error) {
            const status =
              error && typeof error === "object"
                ? Number(
                    "status" in error
                      ? error.status
                      : "statusCode" in error
                        ? error.statusCode
                        : NaN,
                  )
                : NaN;
            if (status !== 404) throw error;
          }
        }

        await db
          .update(memberships)
          .set({
            clerkInvitationStatus: "revoked",
            clerkInvitationUpdatedAt: new Date(),
          })
          .where(
            and(
              eq(memberships.id, row.membershipId),
              eq(memberships.orgId, row.orgId),
              eq(memberships.clerkInvitationStatus, "pending"),
            ),
          );
        legacyRevoked += 1;
      } catch (error) {
        console.error(
          `Invitation migration failed for membership ${row.membershipId}:`,
          error instanceof Error ? error.message : "unknown error",
        );
        failedMembershipIds.push(row.membershipId);
      }
    }

    console.info(
      `Invitation migration complete: ${sent} sent, ${alreadySent} already delivered, ${legacyRevoked} legacy invitations revoked, ${failedMembershipIds.length} failed.`,
    );
    if (failedMembershipIds.length) {
      console.error(`Failed membership IDs: ${failedMembershipIds.join(", ")}`);
      process.exitCode = 1;
    }
  } finally {
    await getSqlClient().end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

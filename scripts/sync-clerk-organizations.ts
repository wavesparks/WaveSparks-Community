import type { Organization, OrganizationMembership, User } from "@clerk/nextjs/server";

import { loadScriptEnv } from "./load-script-env";

type ClerkClientFactory = typeof import("@clerk/nextjs/server").clerkClient;
type ClerkRolesModule = typeof import("@/lib/clerk-roles");
type EnvModule = typeof import("@/lib/env");
type SeedOrganization = typeof import("@/data/seed-data").seedOrganization;
type StoreModule = typeof import("@/server/store");
type UrlsModule = typeof import("@/lib/urls");
type CreateManagedAccountInput = Parameters<StoreModule["createManagedAccount"]>[0];

type SyncStats = {
  linked: number;
  alreadyMember: number;
  invited: number;
  existingInvitation: number;
  missingClerkUser: number;
  skippedMissingEmail: number;
  failed: number;
};

let clerkClient: ClerkClientFactory;
let clerkRoleFromLocalRole: ClerkRolesModule["clerkRoleFromLocalRole"];
let createManagedAccount: StoreModule["createManagedAccount"];
let env: EnvModule["env"];
let getBootstrapAdminEmails: EnvModule["getBootstrapAdminEmails"];
let getOrganizationBySlug: StoreModule["getOrganizationBySlug"];
let isClerkConfigured: EnvModule["isClerkConfigured"];
let linkOrganizationToClerkOrg: StoreModule["linkOrganizationToClerkOrg"];
let listMembershipRecordsForOrg: StoreModule["listMembershipRecordsForOrg"];
let localRoleFromClerkRole: ClerkRolesModule["localRoleFromClerkRole"];
let seedOrganization: SeedOrganization;
let absoluteAppUrl: UrlsModule["absoluteAppUrl"];

function flagEnabled(flag: string) {
  return process.argv.includes(flag);
}

function primaryEmailForUser(user: User) {
  const primary = user.primaryEmailAddressId
    ? user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)
    : undefined;
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
}

function displayNameForUser(user: User, fallbackEmail: string) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.username || fallbackEmail;
}

async function findClerkUserByEmail(email: string) {
  const client = await clerkClient();
  const result = await client.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });
  return result.data[0];
}

async function getMembershipForUser(organizationId: string, userId: string) {
  const client = await clerkClient();
  const result = await client.organizations.getOrganizationMembershipList({
    organizationId,
    userId: [userId],
    limit: 1,
  });
  return result.data[0];
}

async function ensureClerkOrganization(creatorUserId?: string) {
  const client = await clerkClient();

  try {
    return await client.organizations.getOrganization({
      slug: seedOrganization.slug,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("not found")) {
      throw error;
    }
  }

  return client.organizations.createOrganization({
    ...(creatorUserId ? { createdBy: creatorUserId } : {}),
    name: seedOrganization.name,
    slug: seedOrganization.slug,
  });
}

async function addOrUpdateMembership(input: {
  clerkOrganization: Organization;
  clerkUser: User;
  localOrgId: string;
  localStatus: CreateManagedAccountInput["status"];
  localRole: CreateManagedAccountInput["role"];
}) {
  const client = await clerkClient();
  const clerkRole = clerkRoleFromLocalRole(input.localRole);
  const existingMembership = await getMembershipForUser(
    input.clerkOrganization.id,
    input.clerkUser.id,
  );
  let membership: OrganizationMembership;

  if (existingMembership) {
    membership =
      existingMembership.role === clerkRole
        ? existingMembership
        : await client.organizations.updateOrganizationMembership({
            organizationId: input.clerkOrganization.id,
            role: clerkRole,
            userId: input.clerkUser.id,
          });
  } else {
    membership = await client.organizations.createOrganizationMembership({
      organizationId: input.clerkOrganization.id,
      role: clerkRole,
      userId: input.clerkUser.id,
    });
  }

  const email = primaryEmailForUser(input.clerkUser);
  if (!email) {
    throw new Error(`Clerk user ${input.clerkUser.id} has no email address.`);
  }

  await createManagedAccount({
    clerkMembershipId: membership.id,
    clerkRole: membership.role,
    clerkUserId: input.clerkUser.id,
    createPasswordCredential: false,
    email,
    name: displayNameForUser(input.clerkUser, email),
    orgId: input.localOrgId,
    role: localRoleFromClerkRole(membership.role),
    status: input.localStatus,
  });

  return { created: !existingMembership };
}

async function inviteMissingClerkUser(input: {
  clerkOrganization: Organization;
  creatorUserId?: string;
  email: string;
  membershipId: string;
  role: CreateManagedAccountInput["role"];
}) {
  const client = await clerkClient();
  const clerkRole = clerkRoleFromLocalRole(input.role);
  const existingInvitations = await client.organizations.getOrganizationInvitationList({
    organizationId: input.clerkOrganization.id,
    status: ["pending"],
    limit: 100,
  });
  const existingInvitation = existingInvitations.data.find(
    (invitation) => invitation.emailAddress.toLowerCase() === input.email.toLowerCase(),
  );

  if (existingInvitation) {
    return { created: false };
  }

  await client.organizations.createOrganizationInvitation({
    emailAddress: input.email,
    ...(input.creatorUserId ? { inviterUserId: input.creatorUserId } : {}),
    organizationId: input.clerkOrganization.id,
    publicMetadata: {
      membershipId: input.membershipId,
      membershipRole: input.role,
      orgSlug: seedOrganization.slug,
    },
    redirectUrl: absoluteAppUrl(`/org/${seedOrganization.slug}/signin`),
    role: clerkRole,
  });
  return { created: true };
}

async function main() {
  loadScriptEnv("production");
  const clerkServer = await import("@clerk/nextjs/server");
  const seedData = await import("@/data/seed-data");
  const clerkRoles = await import("@/lib/clerk-roles");
  const envModule = await import("@/lib/env");
  const urlsModule = await import("@/lib/urls");
  const storeModule = await import("@/server/store");

  clerkClient = clerkServer.clerkClient;
  clerkRoleFromLocalRole = clerkRoles.clerkRoleFromLocalRole;
  createManagedAccount = storeModule.createManagedAccount;
  env = envModule.env;
  getBootstrapAdminEmails = envModule.getBootstrapAdminEmails;
  getOrganizationBySlug = storeModule.getOrganizationBySlug;
  isClerkConfigured = envModule.isClerkConfigured;
  linkOrganizationToClerkOrg = storeModule.linkOrganizationToClerkOrg;
  listMembershipRecordsForOrg = storeModule.listMembershipRecordsForOrg;
  localRoleFromClerkRole = clerkRoles.localRoleFromClerkRole;
  seedOrganization = seedData.seedOrganization;
  absoluteAppUrl = urlsModule.absoluteAppUrl;

  if (!isClerkConfigured()) {
    throw new Error("Clerk keys are required: set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.");
  }
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is required so Clerk IDs can be persisted locally.");
  }

  const sendInvites = flagEnabled("--send-invites");
  const bootstrapEmails = getBootstrapAdminEmails();
  const creatorEmail = bootstrapEmails[0];
  if (!creatorEmail) {
    throw new Error("WAVESPARK_ADMIN_EMAILS must include at least one Clerk admin email.");
  }

  const creatorUser = await findClerkUserByEmail(creatorEmail);

  const localOrg = await getOrganizationBySlug(seedOrganization.slug);
  if (!localOrg) {
    throw new Error(`Local organization ${seedOrganization.slug} does not exist. Run pnpm db:bootstrap first.`);
  }

  const clerkOrganization = await ensureClerkOrganization(creatorUser?.id);
  await linkOrganizationToClerkOrg(localOrg.id, clerkOrganization.id);

  const records = await listMembershipRecordsForOrg(localOrg.id, {
    orderBy: "none",
  });
  const stats: SyncStats = {
    alreadyMember: 0,
    existingInvitation: 0,
    failed: 0,
    invited: 0,
    linked: 0,
    missingClerkUser: 0,
    skippedMissingEmail: 0,
  };

  const sortedRecords = [...records].sort((left, right) => {
    const roleRank = Number(right.membership.role === "org_admin") -
      Number(left.membership.role === "org_admin");
    if (roleRank !== 0) {
      return roleRank;
    }
    return left.membership.createdAt.localeCompare(right.membership.createdAt);
  });

  for (const record of sortedRecords) {
    const email = record.user?.email.toLowerCase();
    if (!email) {
      stats.skippedMissingEmail += 1;
      continue;
    }

    try {
      const clerkUser = await findClerkUserByEmail(email);
      if (!clerkUser) {
        if (sendInvites) {
          const invitation = await inviteMissingClerkUser({
            clerkOrganization,
            creatorUserId: creatorUser?.id,
            email,
            membershipId: record.membership.id,
            role: record.membership.role,
          });
          if (invitation.created) {
            stats.invited += 1;
          } else {
            stats.existingInvitation += 1;
          }
        } else {
          stats.missingClerkUser += 1;
        }
        continue;
      }

      const result = await addOrUpdateMembership({
        clerkOrganization,
        clerkUser,
        localOrgId: localOrg.id,
        localRole: record.membership.role,
        localStatus: record.membership.status,
      });

      if (result.created) {
        stats.linked += 1;
      } else {
        stats.alreadyMember += 1;
      }
    } catch (error) {
      stats.failed += 1;
      console.error(
        "[wavesparks] Clerk sync failed for membership",
        record.membership.id,
        error,
      );
    }
  }

  console.info(
    `Clerk org sync complete for ${seedOrganization.slug}: org=${clerkOrganization.id}, linked=${stats.linked}, alreadyMember=${stats.alreadyMember}, invited=${stats.invited}, existingInvitation=${stats.existingInvitation}, missingClerkUser=${stats.missingClerkUser}, skippedMissingEmail=${stats.skippedMissingEmail}, failed=${stats.failed}.`,
  );

  if (stats.missingClerkUser > 0 && !sendInvites) {
    console.info("Run pnpm clerk:sync-orgs -- --send-invites to send Clerk organization invitations for missing users.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

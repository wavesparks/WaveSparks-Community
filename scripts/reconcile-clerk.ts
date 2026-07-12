import { writeFile } from "node:fs/promises";

import type {
  OrganizationInvitation,
  OrganizationMembership,
  User as ClerkUser,
} from "@clerk/nextjs/server";
import postgres from "postgres";

import type { MembershipRole, MembershipStatus } from "@/lib/domain";
import { loadScriptEnv } from "./load-script-env";
import { clerkKeyTarget, databaseTarget, readScriptTarget } from "./script-safety";

const activeStatuses = new Set<MembershipStatus>(["pending", "waitlist", "approved"]);
const reportPaths = {
  development: "/tmp/wavespark-clerk-reconcile-development.json",
  production: "/tmp/wavespark-clerk-reconcile-production.json",
} as const;

interface OrganizationSettings {
  admin_delete_enabled?: boolean;
  force_organization_selection?: boolean;
  max_allowed_memberships?: number;
  organization_creation_defaults?: { enabled?: boolean };
  slug_disabled?: boolean;
}

interface ReconcileItem {
  clerkId?: string;
  email: string;
  localMembershipId?: string;
  localRole?: MembershipRole;
  localStatus?: MembershipStatus;
  reason?: string;
  targetRole?: string;
}

interface ReconcileLocalRecord {
  membership: {
    id: string;
    role: MembershipRole;
    status: MembershipStatus;
  };
  user?: {
    anonymizedAt?: string;
    email: string;
  };
}

async function listProductionRecords(databaseUrl: string, orgId: string) {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const rows = await sql<
      Array<{
        email: string;
        membership_id: string;
        role: MembershipRole;
        status: MembershipStatus;
      }>
    >`
      select
        u.email,
        m.id as membership_id,
        m.role,
        m.status
      from memberships m
      inner join users u on u.id = m.user_id
      where m.org_id = ${orgId}
      order by lower(u.email), m.id
    `;
    return rows.map(
      (row): ReconcileLocalRecord => ({
        membership: {
          id: row.membership_id,
          role: row.role,
          status: row.status,
        },
        user: { email: row.email },
      }),
    );
  } finally {
    await sql.end();
  }
}

function primaryEmailForUser(user: ClerkUser) {
  const primary = user.primaryEmailAddressId
    ? user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)
    : undefined;
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
}

function displayNameForUser(user: ClerkUser, fallback: string) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || fallback;
}

function membershipEmail(membership: OrganizationMembership) {
  return membership.publicUserData?.identifier?.toLowerCase() ?? "";
}

function invitationEmail(invitation: OrganizationInvitation) {
  return invitation.emailAddress.toLowerCase();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function backendRequest<T>(secretKey: string, path: string, init?: RequestInit) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(`Clerk ${init?.method ?? "GET"} ${path} failed (${response.status}).`);
  }
  return body;
}

async function main() {
  const target = readScriptTarget();
  if (target.environment === "production" && target.apply) {
    throw new Error("Production reconciliation is preview-only in this release.");
  }

  loadScriptEnv(target.environment);
  const [{ clerkClient }, { seedOrganization }, clerkRoles, envModule, store, urls] =
    await Promise.all([
      import("@clerk/nextjs/server"),
      import("@/data/seed-data"),
      import("@/lib/clerk-roles"),
      import("@/lib/env"),
      import("@/server/store"),
      import("@/lib/urls"),
    ]);
  const { env } = envModule;
  if (!env.clerkSecretKey || !env.clerkPublishableKey || !env.databaseUrl) {
    throw new Error("Clerk keys and DATABASE_URL are required for reconciliation.");
  }

  const client = await clerkClient();
  const localOrg = await store.getOrganizationBySlug(seedOrganization.slug);
  if (!localOrg) {
    throw new Error(`Local organization ${seedOrganization.slug} does not exist.`);
  }

  const [settings, organizationList, localRecords] = await Promise.all([
    backendRequest<OrganizationSettings>(env.clerkSecretKey, "/instance/organization_settings"),
    client.organizations.getOrganizationList({ includeMembersCount: true, limit: 100 }),
    target.environment === "production"
      ? listProductionRecords(env.databaseUrl, localOrg.id)
      : (store.listMembershipRecordsForOrg(localOrg.id, {
          orderBy: "none",
        }) as Promise<ReconcileLocalRecord[]>),
  ]);
  let clerkOrg = organizationList.data.find(
    (organization) => organization.slug === seedOrganization.slug,
  );
  const extraOrganizations = organizationList.data
    .filter((organization) => organization.slug !== seedOrganization.slug)
    .map((organization) => ({ id: organization.id, name: organization.name, slug: organization.slug }));

  const [clerkMemberships, clerkInvitations] = clerkOrg
    ? await Promise.all([
        client.organizations.getOrganizationMembershipList({
          organizationId: clerkOrg.id,
          limit: 500,
        }),
        client.organizations.getOrganizationInvitationList({
          organizationId: clerkOrg.id,
          status: ["pending", "accepted", "revoked", "expired"],
          limit: 500,
        }),
      ])
    : [{ data: [] as OrganizationMembership[] }, { data: [] as OrganizationInvitation[] }];

  const clerkUsersByEmail = new Map<string, ClerkUser>();
  for (const record of localRecords) {
    const email = record.user?.email.toLowerCase();
    if (!email || record.user?.anonymizedAt) {
      continue;
    }
    const users = await client.users.getUserList({ emailAddress: [email], limit: 1 });
    if (users.data[0]) {
      clerkUsersByEmail.set(email, users.data[0]);
    }
  }

  const membershipsByUserId = new Map(
    clerkMemberships.data.flatMap((membership) =>
      membership.publicUserData?.userId
        ? [[membership.publicUserData.userId, membership] as const]
        : [],
    ),
  );
  const pendingInvitationsByEmail = new Map(
    clerkInvitations.data
      .filter((invitation) => invitation.status === "pending")
      .map((invitation) => [invitationEmail(invitation), invitation]),
  );
  const additions: ReconcileItem[] = [];
  const invitations: ReconcileItem[] = [];
  const roleChanges: ReconcileItem[] = [];
  const removals: ReconcileItem[] = [];
  const invitationRevocations: ReconcileItem[] = [];
  const localEmails = new Set<string>();

  for (const record of localRecords) {
    const email = record.user?.email.toLowerCase();
    if (!email || record.user?.anonymizedAt) {
      continue;
    }
    localEmails.add(email);
    const clerkUser = clerkUsersByEmail.get(email);
    const clerkMembership = clerkUser ? membershipsByUserId.get(clerkUser.id) : undefined;
    const pendingInvitation = pendingInvitationsByEmail.get(email);
    const targetRole = clerkRoles.clerkRoleFromLocalRole(record.membership.role);

    if (!activeStatuses.has(record.membership.status)) {
      if (clerkMembership) {
        removals.push({
          clerkId: clerkUser?.id,
          email,
          localMembershipId: record.membership.id,
          localRole: record.membership.role,
          localStatus: record.membership.status,
          reason: "Local membership is inactive.",
        });
      }
      if (pendingInvitation) {
        invitationRevocations.push({
          clerkId: pendingInvitation.id,
          email,
          localMembershipId: record.membership.id,
          localStatus: record.membership.status,
          reason: "Local membership is inactive.",
        });
      }
      continue;
    }

    if (clerkUser) {
      if (!clerkMembership) {
        additions.push({
          clerkId: clerkUser.id,
          email,
          localMembershipId: record.membership.id,
          localRole: record.membership.role,
          localStatus: record.membership.status,
          targetRole,
        });
      } else if (clerkMembership.role !== targetRole) {
        roleChanges.push({
          clerkId: clerkUser.id,
          email,
          localMembershipId: record.membership.id,
          localRole: record.membership.role,
          localStatus: record.membership.status,
          reason: `Clerk currently has ${clerkMembership.role}.`,
          targetRole,
        });
      }
    } else if (!pendingInvitation) {
      invitations.push({
        email,
        localMembershipId: record.membership.id,
        localRole: record.membership.role,
        localStatus: record.membership.status,
        targetRole,
      });
    }
  }

  const untrackedClerkMemberships = clerkMemberships.data
    .filter((membership) => !localEmails.has(membershipEmail(membership)))
    .map((membership) => ({
      id: membership.id,
      email: membershipEmail(membership),
      role: membership.role,
      userId: membership.publicUserData?.userId ?? null,
    }));
  const staleInvitations = clerkInvitations.data
    .filter((invitation) => {
      const email = invitationEmail(invitation);
      if (invitation.status === "accepted") {
        return false;
      }
      if (invitation.status === "pending") {
        return (
          !localEmails.has(email) || pendingInvitationsByEmail.get(email)?.id !== invitation.id
        );
      }
      return true;
    })
    .map((invitation) => ({
      id: invitation.id,
      email: invitationEmail(invitation),
      role: invitation.role,
      status: invitation.status,
    }));
  const organizationSettingChanges = [
    settings.organization_creation_defaults?.enabled !== false
      ? { field: "organization_creation_defaults.enabled", from: true, to: false }
      : null,
    settings.admin_delete_enabled !== false
      ? { field: "admin_delete_enabled", from: settings.admin_delete_enabled, to: false }
      : null,
    settings.force_organization_selection !== true
      ? {
          field: "force_organization_selection",
          from: settings.force_organization_selection,
          to: true,
        }
      : null,
    settings.max_allowed_memberships !== 0
      ? {
          field: "max_allowed_memberships",
          from: settings.max_allowed_memberships,
          to: 0,
        }
      : null,
    settings.slug_disabled !== false
      ? { field: "slug_disabled", from: settings.slug_disabled, to: false }
      : null,
  ].filter(Boolean);

  const report = {
    environment: target.environment,
    generatedAt: new Date().toISOString(),
    mode: target.apply ? "apply" : "dry-run",
    resources: {
      clerk: clerkKeyTarget(env.clerkPublishableKey),
      database: databaseTarget(env.databaseUrl),
      localOrganizationId: localOrg.id,
      linkedClerkOrganizationId: localOrg.clerkOrgId ?? null,
      targetClerkOrganizationId: clerkOrg?.id ?? null,
    },
    organizationSettingChanges,
    organizationToCreate: clerkOrg
      ? null
      : { name: seedOrganization.name, slug: seedOrganization.slug },
    extraOrganizations,
    membershipsToAdd: additions,
    invitationsToCreate: invitations,
    rolesToUpdate: roleChanges,
    membershipsToRemove: removals,
    invitationsToRevoke: invitationRevocations,
    staleInvitations,
    untrackedClerkMemberships,
  };

  const reportPath = reportPaths[target.environment];
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.info(`Reconciliation report: ${reportPath}`);

  if (!target.apply) {
    console.info(JSON.stringify(report, null, 2));
    return;
  }

  await backendRequest<OrganizationSettings>(
    env.clerkSecretKey,
    "/instance/organization_settings",
    {
      method: "PATCH",
      body: JSON.stringify({
        admin_delete_enabled: false,
        force_organization_selection: true,
        max_allowed_memberships: 0,
        organization_creation_defaults: { enabled: false },
        slug_disabled: false,
      }),
    },
  );

  if (!clerkOrg) {
    clerkOrg = await client.organizations.createOrganization({
      name: seedOrganization.name,
      slug: seedOrganization.slug,
      maxAllowedMemberships: 0,
    });
  } else {
    clerkOrg = await client.organizations.updateOrganization(clerkOrg.id, {
      adminDeleteEnabled: false,
      maxAllowedMemberships: 0,
      name: seedOrganization.name,
      slug: seedOrganization.slug,
    });
  }
  await store.linkOrganizationToClerkOrg(localOrg.id, clerkOrg.id);

  const e2eSpecs = [
    {
      email: process.env.E2E_CLERK_ADMIN_EMAIL ?? "wavespark.e2e.admin+clerk_test@example.com",
      firstName: "E2E",
      lastName: "Admin",
      role: "org_admin" as const,
      status: "approved" as const,
    },
    {
      email: process.env.E2E_CLERK_USER_EMAIL ?? "wavespark.e2e.member+clerk_test@example.com",
      firstName: "E2E",
      lastName: "Member",
      role: "member" as const,
      status: "pending" as const,
    },
  ];
  for (const spec of e2eSpecs) {
    const existing = await client.users.getUserList({ emailAddress: [spec.email], limit: 1 });
    const clerkUser =
      existing.data[0] ??
      (await client.users.createUser({
        emailAddress: [spec.email],
        firstName: spec.firstName,
        lastName: spec.lastName,
        skipLegalChecks: true,
        skipPasswordChecks: true,
        skipPasswordRequirement: true,
      }));
    const local = await store.createManagedAccount({
      clerkUserId: clerkUser.id,
      email: spec.email,
      name: `${spec.firstName} ${spec.lastName}`,
      orgId: localOrg.id,
      role: spec.role,
      status: spec.status,
      approvalNote: "Synthetic Clerk E2E account.",
    });
    const clerkRole = clerkRoles.clerkRoleFromLocalRole(spec.role);
    const existingMembership = await client.organizations.getOrganizationMembershipList({
      organizationId: clerkOrg.id,
      userId: [clerkUser.id],
      limit: 1,
    });
    const clerkMembership = existingMembership.data[0]
      ? existingMembership.data[0].role === clerkRole
        ? existingMembership.data[0]
        : await client.organizations.updateOrganizationMembership({
            organizationId: clerkOrg.id,
            role: clerkRole,
            userId: clerkUser.id,
          })
      : await client.organizations.createOrganizationMembership({
          organizationId: clerkOrg.id,
          role: clerkRole,
          userId: clerkUser.id,
        });
    await store.updateMembershipClerkState(local.membership.id, {
      clerkInvitationError: null,
      clerkInvitationStatus: "accepted",
      clerkInvitationUpdatedAt: new Date().toISOString(),
      clerkMembershipId: clerkMembership.id,
      clerkRole: clerkMembership.role,
    });
  }

  const inviter = await client.users.getUserList({
    emailAddress: [e2eSpecs[0].email],
    limit: 1,
  });
  const inviterUserId = inviter.data[0]?.id;
  if (!inviterUserId) {
    throw new Error("Synthetic E2E admin could not be created.");
  }

  const records = await store.listMembershipRecordsForOrg(localOrg.id, { orderBy: "none" });
  for (const record of records) {
    const email = record.user?.email.toLowerCase();
    if (!email || record.user?.anonymizedAt) {
      continue;
    }
    try {
      const userList = await client.users.getUserList({ emailAddress: [email], limit: 1 });
      const clerkUser = userList.data[0];
      const memberList = clerkUser
        ? await client.organizations.getOrganizationMembershipList({
            organizationId: clerkOrg.id,
            userId: [clerkUser.id],
            limit: 1,
          })
        : { data: [] as OrganizationMembership[] };
      const pendingInvitationList = await client.organizations.getOrganizationInvitationList({
        organizationId: clerkOrg.id,
        status: ["pending"],
        limit: 500,
      });
      const pendingInvitation = pendingInvitationList.data.find(
        (invitation) => invitationEmail(invitation) === email,
      );

      if (!activeStatuses.has(record.membership.status)) {
        if (memberList.data[0] && clerkUser) {
          await client.organizations.deleteOrganizationMembership({
            organizationId: clerkOrg.id,
            userId: clerkUser.id,
          });
        }
        if (pendingInvitation) {
          await client.organizations.revokeOrganizationInvitation({
            invitationId: pendingInvitation.id,
            organizationId: clerkOrg.id,
            requestingUserId: inviterUserId,
          });
        }
        await store.updateMembershipClerkState(record.membership.id, {
          clerkInvitationError: null,
          clerkInvitationStatus: pendingInvitation ? "revoked" : null,
          clerkInvitationUpdatedAt: new Date().toISOString(),
          clerkMembershipId: null,
          clerkRole: null,
        });
        continue;
      }

      const role = clerkRoles.clerkRoleFromLocalRole(record.membership.role);
      if (clerkUser) {
        const clerkMembership = memberList.data[0]
          ? memberList.data[0].role === role
            ? memberList.data[0]
            : await client.organizations.updateOrganizationMembership({
                organizationId: clerkOrg.id,
                role,
                userId: clerkUser.id,
              })
          : await client.organizations.createOrganizationMembership({
              organizationId: clerkOrg.id,
              role,
              userId: clerkUser.id,
            });
        const clerkEmail = primaryEmailForUser(clerkUser) ?? email;
        await store.upsertSessionUser({
          clerkUserId: clerkUser.id,
          email: clerkEmail,
          imageUrl: clerkUser.imageUrl,
          name: displayNameForUser(clerkUser, clerkEmail),
        });
        await store.updateMembershipClerkState(record.membership.id, {
          clerkInvitationError: null,
          clerkInvitationStatus: record.membership.clerkInvitationId ? "accepted" : null,
          clerkInvitationUpdatedAt: new Date().toISOString(),
          clerkMembershipId: clerkMembership.id,
          clerkRole: clerkMembership.role,
        });
        continue;
      }

      const invitation =
        pendingInvitation ??
        (await client.organizations.createOrganizationInvitation({
          emailAddress: email,
          inviterUserId,
          organizationId: clerkOrg.id,
          publicMetadata: {
            membershipId: record.membership.id,
            membershipRole: record.membership.role,
            orgSlug: seedOrganization.slug,
          },
          redirectUrl: urls.absoluteAppUrl(
            `/org/${seedOrganization.slug}/accept-invitation`,
          ),
          role,
        }));
      await store.updateMembershipClerkState(record.membership.id, {
        clerkInvitationError: null,
        clerkInvitationId: invitation.id,
        clerkInvitationStatus: "pending",
        clerkInvitationUpdatedAt: new Date().toISOString(),
      });
    } catch (error) {
      await store.updateMembershipClerkState(record.membership.id, {
        clerkInvitationError: errorMessage(error),
        clerkInvitationStatus: "failed",
        clerkInvitationUpdatedAt: new Date().toISOString(),
      });
    }
  }

  for (const organization of extraOrganizations) {
    await client.organizations.deleteOrganization(organization.id);
  }
  console.info("Development Clerk reconciliation applied successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

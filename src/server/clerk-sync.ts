import { clerkRoleFromLocalRole } from "@/lib/clerk-roles";
import type { ClerkOrgRole, Membership, Organization, User } from "@/lib/domain";
import { isClerkConfigured, isVercelPreviewEnvironment } from "@/lib/env";
import {
  ensureMembership,
  linkOrganizationToClerkOrg,
  upsertSessionUser,
} from "@/server/store";

type ClerkServer = typeof import("@clerk/nextjs/server");
type ClerkClient = Awaited<ReturnType<ClerkServer["clerkClient"]>>;

interface SyncMembershipOptions {
  clerkRole?: ClerkOrgRole | string;
  clerkUserId?: string;
  membership: Membership;
  org: Organization;
  throwOnFailure?: boolean;
  user: User;
}

interface ClerkAdminContextOptions {
  clerkUserId?: string;
  membership: Membership;
  org: Organization;
  user: User;
}

function errorStatus(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }

  return undefined;
}

function isNotFoundError(error: unknown) {
  if (errorStatus(error) === 404) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("not found");
}

async function getClerkClient() {
  const { clerkClient } = await import("@clerk/nextjs/server");
  return clerkClient();
}

async function getMembershipForUser(
  client: ClerkClient,
  organizationId: string,
  userId: string,
) {
  const result = await client.organizations.getOrganizationMembershipList({
    organizationId,
    userId: [userId],
    limit: 1,
  });

  return result.data[0];
}

async function upsertClerkOrganizationMembership(input: {
  client: ClerkClient;
  organizationId: string;
  role: string;
  userId: string;
}) {
  const existingMembership = await getMembershipForUser(
    input.client,
    input.organizationId,
    input.userId,
  );

  if (existingMembership) {
    return existingMembership.role === input.role
      ? existingMembership
      : input.client.organizations.updateOrganizationMembership({
          organizationId: input.organizationId,
          role: input.role,
          userId: input.userId,
        });
  }

  try {
    return await input.client.organizations.createOrganizationMembership({
      organizationId: input.organizationId,
      role: input.role,
      userId: input.userId,
    });
  } catch (error) {
    const membership = await getMembershipForUser(
      input.client,
      input.organizationId,
      input.userId,
    );

    if (membership) {
      return membership.role === input.role
        ? membership
        : input.client.organizations.updateOrganizationMembership({
            organizationId: input.organizationId,
            role: input.role,
            userId: input.userId,
          });
    }

    throw error;
  }
}

export async function resolveClerkOrganizationId(
  org: Organization,
) {
  if (!isClerkConfigured()) {
    return undefined;
  }

  if (org.clerkOrgId) {
    return org.clerkOrgId;
  }

  const client = await getClerkClient();
  try {
    const clerkOrg = await client.organizations.getOrganization({ slug: org.slug });
    if (!isVercelPreviewEnvironment()) {
      await linkOrganizationToClerkOrg(org.id, clerkOrg.id);
    }
    return clerkOrg.id;
  } catch (error) {
    if (!isNotFoundError(error)) {
      console.warn("[wavesparks] clerk organization lookup failed", org.slug, error);
    }
    return undefined;
  }
}

export async function syncMembershipToClerkOrganization(
  options: SyncMembershipOptions,
) {
  if (!isClerkConfigured()) {
    return null;
  }
  if (options.membership.status === "rejected" || options.membership.status === "suspended") {
    if (options.throwOnFailure) {
      throw new Error("Inactive memberships cannot be added to Clerk.");
    }
    return null;
  }

  const clerkUserId = options.clerkUserId ?? options.user.clerkUserId;
  const organizationId = await resolveClerkOrganizationId(options.org);

  if (!clerkUserId || !organizationId) {
    if (options.throwOnFailure) {
      throw new Error("A linked Clerk user and organization are required.");
    }
    return null;
  }

  const clerkRole = options.clerkRole ?? clerkRoleFromLocalRole(options.membership.role);

  try {
    const client = await getClerkClient();
    const clerkMembership = await upsertClerkOrganizationMembership({
      client,
      organizationId,
      role: clerkRole,
      userId: clerkUserId,
    });
    const user =
      options.user.clerkUserId === clerkUserId
        ? options.user
        : await upsertSessionUser({
            clerkUserId,
            email: options.user.email,
            imageUrl: options.user.imageUrl,
            name: options.user.name,
          });
    const localMembership = await ensureMembership(user.id, options.org.id, {
      clerkMembershipId: clerkMembership.id,
      clerkRole: clerkMembership.role,
      existingMembership: options.membership,
      existingUser: user,
    });

    return {
      clerkMembershipId: clerkMembership.id,
      clerkOrgId: organizationId,
      clerkRole: clerkMembership.role as ClerkOrgRole,
      localMembership,
      user,
    };
  } catch (error) {
    if (options.throwOnFailure) {
      throw error;
    }
    console.warn(
      "[wavesparks] clerk membership sync failed",
      options.org.slug,
      clerkUserId,
      error,
    );
    return null;
  }
}

export async function syncViewerClerkOrganization(
  options: Omit<SyncMembershipOptions, "clerkRole" | "throwOnFailure">,
) {
  return syncMembershipToClerkOrganization({
    ...options,
    clerkRole: clerkRoleFromLocalRole(options.membership.role),
  });
}

export async function ensureClerkAdminOrganizationContext(
  options: ClerkAdminContextOptions,
) {
  const syncResult = await syncMembershipToClerkOrganization({
    clerkRole: "org:admin",
    clerkUserId: options.clerkUserId,
    membership: options.membership,
    org: options.org,
    throwOnFailure: true,
    user: options.user,
  });

  if (!syncResult) {
    throw new Error("A linked Clerk organization is required.");
  }
  const userId =
    syncResult.user.clerkUserId ?? options.clerkUserId ?? options.user.clerkUserId;

  if (!userId) {
    throw new Error("A Clerk user session is required.");
  }

  return {
    organizationId: syncResult.clerkOrgId,
    userId,
  };
}

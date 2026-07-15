import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthIdentity } from "@/lib/auth-identity";
import type { Membership, Organization, Profile, User } from "@/lib/domain";

const calls = vi.hoisted(() => [] as string[]);
const mockState = vi.hoisted(() => ({
  identity: Promise.resolve(null) as Promise<AuthIdentity | null>,
  org: Promise.resolve(undefined) as Promise<Organization | undefined>,
  viewerRecord: Promise.resolve({}) as Promise<{
    user?: User;
    membership?: Membership;
    profile?: Profile;
  }>,
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/auth-identity", () => ({
  getCurrentAuthIdentity: vi.fn(() => {
    calls.push("identity");
    return mockState.identity;
  }),
}));

vi.mock("@/server/store", () => ({
  getOrganizationBySlug: vi.fn(() => {
    calls.push("org");
    return mockState.org;
  }),
  getViewerRecordByClerkUserIdAndOrgId: vi.fn(() => Promise.resolve({})),
  getViewerRecordByEmailAndOrgId: vi.fn((orgId: string, email: string) => {
    calls.push(`viewer:${orgId}:${email}`);
    return mockState.viewerRecord;
  }),
  upsertSessionUser: vi.fn(() => user),
}));

import { getAuthCompletionViewerContext, getOrganizationViewerContext } from "@/lib/auth";
import {
  getViewerRecordByEmailAndOrgId,
} from "@/server/store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

const org: Organization = {
  id: "org_test",
  name: "Test Org",
  slug: "test",
  logoUrl: "",
  theme: {
    accent: "#111827",
    accentSoft: "#f3f4f6",
    canvas: "#ffffff",
    ink: "#111827",
  },
  tagline: "Test",
  description: "Test organization",
  membershipRules: [],
  allowedDomains: [],
  inviteSettings: "admin",
  status: "active",
  createdAt: "2030-01-01T00:00:00.000Z",
};

const user: User = {
  id: "usr_test",
  email: "member@example.com",
  name: "Member Example",
  imageUrl: "",
  platformRole: "standard",
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};

const membership: Membership = {
  id: "mem_test",
  orgId: org.id,
  userId: user.id,
      role: "member",
      accountStatus: "connected",
      affiliationType: "current participant",
  status: "approved",
  archetypes: [],
  programName: "Test",
  cohortNameOrYear: "2030",
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
};

const profile = {
  id: "pro_test",
  membershipId: membership.id,
  onboardingComplete: true,
} as Profile;

describe("organization viewer context", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.VERCEL_ENV;
    delete org.clerkOrgId;
    mockState.identity = Promise.resolve(null);
    mockState.org = Promise.resolve(org);
    mockState.viewerRecord = Promise.resolve({});
  });

  it("starts identity and organization lookup together for public org routes", async () => {
    const identity = deferred<AuthIdentity | null>();
    const organization = deferred<Organization | undefined>();
    mockState.identity = identity.promise;
    mockState.org = organization.promise;

    const pending = getOrganizationViewerContext("test");
    await Promise.resolve();

    expect(calls).toEqual(["identity", "org"]);

    identity.resolve(null);
    organization.resolve(org);

    await expect(pending).resolves.toEqual({ org, viewer: null });
  });

  it("reuses the known organization id when resolving an authenticated viewer", async () => {
    mockState.identity = Promise.resolve({
      canManageOrgMemberships: false,
      clerkOrgId: "org_clerk_test",
      clerkOrgRole: "org:member",
      clerkOrgSlug: "test",
      clerkUserId: "user_clerk_test",
      email: user.email,
      name: user.name,
      provider: "clerk",
    });
    mockState.viewerRecord = Promise.resolve({ user, membership, profile });

    const context = await getOrganizationViewerContext("test");

    expect(getViewerRecordByEmailAndOrgId).toHaveBeenCalledWith(org.id, user.email);
    expect(context.viewer?.membership.id).toBe(membership.id);
    expect(context.viewer?.profile?.id).toBe(profile.id);
  });

  it("uses the local membership when the active Clerk org slug differs", async () => {
    mockState.identity = Promise.resolve({
      canManageOrgMemberships: false,
      clerkOrgId: "org_clerk_test",
      clerkOrgRole: "org:member",
      clerkOrgSlug: "wavesparks",
      clerkUserId: "user_clerk_test",
      email: user.email,
      name: user.name,
      provider: "clerk",
    });
    mockState.viewerRecord = Promise.resolve({ user, membership, profile });

    const context = await getAuthCompletionViewerContext("test");

    expect(context.status).toBe("authenticated");
    expect(context.viewer?.membership.id).toBe(membership.id);
    expect(context.viewer?.membership.role).toBe("member");
  });

  it("keeps the Wavesparks role when another Clerk organization is active", async () => {
    mockState.org = Promise.resolve({
      ...org,
      clerkOrgId: "org_clerk_other",
    });
    mockState.identity = Promise.resolve({
      canManageOrgMemberships: false,
      clerkOrgId: "org_clerk_test",
      clerkOrgRole: "org:member",
      clerkOrgSlug: "test",
      clerkUserId: "user_clerk_test",
      email: user.email,
      name: user.name,
      provider: "clerk",
    });
    mockState.viewerRecord = Promise.resolve({ user, membership, profile });

    const context = await getAuthCompletionViewerContext("test");

    expect(context.status).toBe("authenticated");
    expect(context.viewer?.membership.role).toBe("member");
    expect(context.clerkOrgId).toBe("org_clerk_other");
  });

  it("does not rewrite a linked organization during preview auth completion", async () => {
    process.env.VERCEL_ENV = "preview";
    mockState.org = Promise.resolve({
      ...org,
      clerkOrgId: "org_clerk_live",
    });
    mockState.identity = Promise.resolve({
      canManageOrgMemberships: false,
      clerkOrgId: "org_clerk_preview",
      clerkOrgRole: "org:member",
      clerkOrgSlug: "test",
      clerkUserId: "user_clerk_test",
      email: user.email,
      name: user.name,
      provider: "clerk",
    });
    mockState.viewerRecord = Promise.resolve({ user, membership, profile });

    const context = await getAuthCompletionViewerContext("test");

    expect(context.status).toBe("authenticated");
    expect(context.viewer?.membership.id).toBe(membership.id);
    expect(context.clerkOrgId).toBe("org_clerk_live");
  });

  it("rejects authenticated Clerk users without a local invitation record", async () => {
    mockState.identity = Promise.resolve({
      canManageOrgMemberships: true,
      clerkOrgId: "org_unrelated",
      clerkOrgRole: "org:admin",
      clerkOrgSlug: "unrelated",
      clerkUserId: "user_without_invite",
      email: "no-invite@example.com",
      name: "No Invite",
      provider: "clerk",
    });

    const context = await getAuthCompletionViewerContext("test");

    expect(context.status).toBe("forbidden");
    expect(context.viewer).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthIdentity } from "@/lib/auth-identity";
import type { Membership, Organization, Profile, User } from "@/lib/domain";

type ViewerRecord = {
  user?: User;
  membership?: Membership;
  profile?: Profile;
};

const calls = vi.hoisted(() => [] as string[]);
const mockState = vi.hoisted(() => ({
  clerkViewerRecord: Promise.resolve({}) as Promise<ViewerRecord>,
  emailViewerRecord: Promise.resolve({}) as Promise<ViewerRecord>,
  identity: Promise.resolve(null) as Promise<AuthIdentity | null>,
  org: Promise.resolve(undefined) as Promise<Organization | undefined>,
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
  getViewerRecordByClerkUserIdAndOrgId: vi.fn(
    (orgId: string, clerkUserId: string) => {
      calls.push(`viewer-clerk:${orgId}:${clerkUserId}`);
      return mockState.clerkViewerRecord;
    },
  ),
  getViewerRecordByEmailAndOrgId: vi.fn((orgId: string, email: string) => {
    calls.push(`viewer-email:${orgId}:${email}`);
    return mockState.emailViewerRecord;
  }),
  upsertSessionUser: vi.fn(() => user),
}));

import {
  getAuthCompletionViewerContext,
  getOrganizationViewerContext,
} from "@/lib/auth";
import {
  getViewerRecordByClerkUserIdAndOrgId,
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
  clerkUserId: "user_clerk_test",
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
  mentorStatus: "not_mentor",
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
    mockState.identity = Promise.resolve(null);
    mockState.org = Promise.resolve(org);
    mockState.clerkViewerRecord = Promise.resolve({});
    mockState.emailViewerRecord = Promise.resolve({});
  });

  it("resolves the organization before the organization-scoped identity lookup", async () => {
    const identity = deferred<AuthIdentity | null>();
    const organization = deferred<Organization | undefined>();
    mockState.identity = identity.promise;
    mockState.org = organization.promise;

    const pending = getOrganizationViewerContext("test");
    await Promise.resolve();

    expect(calls).toEqual(["org"]);

    organization.resolve(org);
    await Promise.resolve();

    expect(calls).toEqual(["org", "identity"]);

    identity.resolve(null);
    await expect(pending).resolves.toEqual({ org, viewer: null });
  });

  it("resolves production Clerk users only by Clerk user ID", async () => {
    mockState.identity = Promise.resolve({
      clerkUserId: "user_clerk_test",
      email: user.email,
      name: user.name,
      provider: "clerk",
    });
    mockState.clerkViewerRecord = Promise.resolve({ user, membership, profile });

    const context = await getOrganizationViewerContext("test");

    expect(getViewerRecordByClerkUserIdAndOrgId).toHaveBeenCalledWith(
      org.id,
      "user_clerk_test",
    );
    expect(getViewerRecordByEmailAndOrgId).not.toHaveBeenCalled();
    expect(context.viewer?.membership.id).toBe(membership.id);
  });

  it("does not auto-connect an unbound Clerk account with a matching email", async () => {
    mockState.identity = Promise.resolve({
      clerkUserId: "user_unbound",
      email: user.email,
      name: user.name,
      provider: "clerk",
    });
    mockState.emailViewerRecord = Promise.resolve({ user, membership, profile });

    const context = await getAuthCompletionViewerContext("test");

    expect(context).toEqual({ status: "forbidden", viewer: null });
    expect(getViewerRecordByEmailAndOrgId).not.toHaveBeenCalled();
  });

  it("keeps the signed local E2E email lookup for seed accounts", async () => {
    const seedUser = { ...user, clerkUserId: undefined };
    mockState.identity = Promise.resolve({
      clerkUserId: `e2e:${user.email}`,
      email: user.email,
      name: user.name,
      provider: "e2e",
    });
    mockState.emailViewerRecord = Promise.resolve({
      user: seedUser,
      membership,
      profile,
    });

    const context = await getAuthCompletionViewerContext("test");

    expect(getViewerRecordByEmailAndOrgId).toHaveBeenCalledWith(org.id, user.email);
    expect(context.status).toBe("authenticated");
    expect(context.state).toBe("ready");
  });
});

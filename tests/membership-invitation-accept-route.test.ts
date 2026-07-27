import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthIdentity } from "@/lib/auth-identity";
import type {
  Membership,
  MembershipInvitation,
  Organization,
  User,
} from "@/lib/domain";
import {
  generateMembershipInvitationToken,
  hashMembershipInvitationToken,
  membershipInvitationCookieName,
  serializeMembershipInvitationCookie,
} from "@/lib/membership-invitation-token";

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  clerkClient: vi.fn(),
  getIdentity: vi.fn(),
  getInvitation: vi.fn(),
  getOrganization: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: mocks.clerkClient,
}));

vi.mock("@/lib/auth-identity", () => ({
  getCurrentAuthIdentity: mocks.getIdentity,
}));

vi.mock("@/server/store", () => ({
  acceptMembershipInvitation: mocks.accept,
  getMembershipInvitationByTokenHash: mocks.getInvitation,
  getOrganizationBySlug: mocks.getOrganization,
}));

import {
  GET,
  POST,
} from "@/app/api/internal/membership-invitations/accept/route";

const org: Organization = {
  id: "org_wavesparks",
  name: "Wavesparks",
  slug: "wavesparks",
  logoUrl: "",
  theme: {
    accent: "#111827",
    accentSoft: "#f3f4f6",
    canvas: "#ffffff",
    ink: "#111827",
  },
  tagline: "",
  description: "",
  membershipRules: [],
  allowedDomains: [],
  inviteSettings: "admin",
  status: "active",
  createdAt: "2030-01-01T00:00:00.000Z",
};

const user = {
  id: "usr_invited",
  email: "invited@example.com",
  name: "Invited Member",
  imageUrl: "",
  platformRole: "standard",
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
} satisfies User;

const membership = {
  id: "mem_invited",
  orgId: org.id,
  userId: user.id,
  role: "member",
  mentorStatus: "not_mentor",
  accountStatus: "connected",
  affiliationType: "invited outsider",
  status: "approved",
  archetypes: [],
  programName: "",
  cohortNameOrYear: "",
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
} satisfies Membership;

function invitationFor(token: string): MembershipInvitation {
  return {
    id: "minv_test",
    orgId: org.id,
    membershipId: membership.id,
    email: user.email,
    tokenHash: hashMembershipInvitationToken(token),
    status: "pending",
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdByMembershipId: "mem_admin",
    createdAt: "2030-01-01T00:00:00.000Z",
    updatedAt: "2030-01-01T00:00:00.000Z",
  };
}

function invitationCookie(token: string) {
  return serializeMembershipInvitationCookie({
    orgSlug: org.slug,
    token,
  });
}

describe("membership invitation acceptance route", () => {
  let token: string;
  let invitation: MembershipInvitation;

  beforeEach(() => {
    vi.clearAllMocks();
    token = generateMembershipInvitationToken();
    invitation = invitationFor(token);
    mocks.getOrganization.mockResolvedValue(org);
    mocks.getInvitation.mockResolvedValue(invitation);
    mocks.getIdentity.mockResolvedValue({
      clerkUserId: "user_clerk_invited",
      email: user.email,
      name: user.name,
      provider: "clerk",
    } satisfies AuthIdentity);
    mocks.getUser.mockResolvedValue({
      id: "user_clerk_invited",
      emailAddresses: [
        {
          id: "email_verified",
          emailAddress: user.email,
          verification: { status: "verified" },
        },
      ],
      primaryEmailAddressId: "email_verified",
    });
    mocks.clerkClient.mockResolvedValue({
      users: { getUser: mocks.getUser },
    });
    mocks.accept.mockResolvedValue({
      ok: true,
      invitation: { ...invitation, status: "accepted" },
      membership,
      user: { ...user, clerkUserId: "user_clerk_invited" },
    });
  });

  it("GET validates and exchanges the raw token for a short-lived HttpOnly cookie", async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost/api/internal/membership-invitations/accept?orgSlug=wavesparks&token=${token}`,
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/org/wavesparks/accept-invitation",
    );
    expect(response.headers.get("location")).not.toContain(token);
    expect(response.headers.get("set-cookie")).toContain(
      `${membershipInvitationCookieName}=`,
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=900");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("GET preserves only the allowlisted Clerk handoff after hiding the local token", async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost/api/internal/membership-invitations/accept?orgSlug=wavesparks&token=${token}&__clerk_status=sign_up&__clerk_ticket=ticket_test_123`,
      ),
    );

    expect(response.status).toBe(303);
    const location = response.headers.get("location");
    expect(location).toBe(
      "http://localhost/org/wavesparks/accept-invitation?__clerk_status=sign_up&__clerk_ticket=ticket_test_123",
    );
    expect(location).not.toContain(token);
    expect(location).not.toContain("orgSlug");
    expect(response.headers.get("set-cookie")).toContain(
      `${membershipInvitationCookieName}=`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("GET keeps an application-invitation ticket that has no organization status", async () => {
    const response = await GET(
      new NextRequest(
        `http://localhost/api/internal/membership-invitations/accept?orgSlug=wavesparks&token=${token}&__clerk_ticket=application_ticket_123`,
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/org/wavesparks/accept-invitation?__clerk_ticket=application_ticket_123",
    );
    expect(response.headers.get("location")).not.toContain(token);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("GET does not exchange an expired invitation", async () => {
    mocks.getInvitation.mockResolvedValue({
      ...invitation,
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/api/internal/membership-invitations/accept?orgSlug=wavesparks&token=${token}`,
      ),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("state=expired");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("POST is a no-op when there is no pending invitation cookie", async () => {
    const response = await POST(
      new NextRequest(
        "http://localhost/api/internal/membership-invitations/accept?orgSlug=wavesparks",
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(204);
    expect(mocks.getIdentity).not.toHaveBeenCalled();
    expect(mocks.accept).not.toHaveBeenCalled();
  });

  it("POST verifies the invited email with Clerk Backend before atomic acceptance", async () => {
    const response = await POST(
      new NextRequest(
        "http://localhost/api/internal/membership-invitations/accept?orgSlug=wavesparks",
        {
          method: "POST",
          headers: {
            authorization: "Bearer session-token",
            cookie: `${membershipInvitationCookieName}=${invitationCookie(token)}`,
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.getUser).toHaveBeenCalledWith("user_clerk_invited");
    expect(mocks.accept).toHaveBeenCalledWith({
      clerkUserId: "user_clerk_invited",
      orgId: org.id,
      tokenHash: invitation.tokenHash,
      verifiedEmail: user.email,
    });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects an unverified matching email without consuming or clearing the invitation", async () => {
    mocks.getUser.mockResolvedValue({
      id: "user_clerk_invited",
      emailAddresses: [
        {
          id: "email_unverified",
          emailAddress: user.email,
          verification: { status: "unverified" },
        },
      ],
      primaryEmailAddressId: "email_unverified",
    });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/internal/membership-invitations/accept?orgSlug=wavesparks",
        {
          method: "POST",
          headers: {
            cookie: `${membershipInvitationCookieName}=${invitationCookie(token)}`,
          },
        },
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.accept).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not log Clerk response payloads when identity verification is unavailable", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getUser.mockRejectedValueOnce(
      Object.assign(
        new Error("request for invited@example.com with secret metadata"),
        { status: 503 },
      ),
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/internal/membership-invitations/accept?orgSlug=wavesparks",
        {
          method: "POST",
          headers: {
            cookie: `${membershipInvitationCookieName}=${invitationCookie(token)}`,
          },
        },
      ),
    );

    expect(response.status).toBe(503);
    expect(errorLog).toHaveBeenCalledWith(
      "[wavesparks] Failed to verify invitation email with Clerk",
      { providerStatus: 503 },
    );
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(user.email);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret metadata");
    errorLog.mockRestore();
  });

  it("clears a stale cookie when atomic acceptance reports an expired invitation", async () => {
    mocks.accept.mockResolvedValue({ ok: false, reason: "expired" });

    const response = await POST(
      new NextRequest(
        "http://localhost/api/internal/membership-invitations/accept?orgSlug=wavesparks",
        {
          method: "POST",
          headers: {
            cookie: `${membershipInvitationCookieName}=${invitationCookie(token)}`,
          },
        },
      ),
    );

    expect(response.status).toBe(410);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listFollowed: vi.fn(),
  listMembers: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock("@/lib/space-auth", () => ({
  requireSpaceAccessForAction: mocks.requireAccess,
}));

vi.mock("@/server/store", () => ({
  listActiveSpaceMemberRecords: mocks.listMembers,
  listFollowedMembershipIdsForMembershipInSpace: mocks.listFollowed,
}));

import { GET } from "@/app/api/org/[slug]/spaces/[spaceId]/mention-candidates/route";

function request(query = "") {
  return new Request(
    `http://localhost/api/org/wavesparks/spaces/space_main/mention-candidates${query}`,
  );
}

function context(spaceId = "space_main") {
  return { params: Promise.resolve({ slug: "wavesparks", spaceId }) };
}

function memberRecord(input: {
  id: string;
  name: string;
  orgId?: string;
  complete?: boolean;
  headline?: string;
}) {
  return {
    membership: {
      id: input.id,
      orgId: input.orgId ?? "org_1",
      accountStatus: "connected",
    },
    profile: {
      displayNamePreference: "preferred_name",
      fullName: input.name,
      preferredName: input.name,
      profilePhoto: `/avatars/${input.id}.webp`,
      headline: input.headline ?? "Founder",
      onboardingComplete: input.complete ?? true,
    },
    spaceMembership: {
      spaceId: "space_main",
      orgId: input.orgId ?? "org_1",
      accessStatus: "active",
    },
    user: {
      email: `${input.id}@private.example`,
    },
  };
}

describe("mention candidate route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAccess.mockResolvedValue({
      viewer: {
        org: { id: "org_1" },
        membership: { id: "mem_viewer" },
      },
      space: { id: "space_main" },
    });
    mocks.listFollowed.mockResolvedValue(["mem_zoe"]);
    mocks.listMembers.mockResolvedValue([
      memberRecord({ id: "mem_viewer", name: "Viewer" }),
      memberRecord({ id: "mem_alice", name: "Alice" }),
      memberRecord({ id: "mem_zoe", name: "Zoë", headline: "Designer" }),
      memberRecord({ id: "mem_incomplete", name: "Incomplete", complete: false }),
      memberRecord({ id: "mem_other_org", name: "Other", orgId: "org_2" }),
    ]);
  });

  it("returns a minimal current-Space DTO with followed members first", async () => {
    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      candidates: [
        {
          membershipId: "mem_zoe",
          displayName: "Zoë",
          photo: "/avatars/mem_zoe.webp",
          headline: "Designer",
          isFollowing: true,
        },
        {
          membershipId: "mem_alice",
          displayName: "Alice",
          photo: "/avatars/mem_alice.webp",
          headline: "Founder",
          isFollowing: false,
        },
      ],
    });
    expect(mocks.requireAccess).toHaveBeenCalledWith({
      slug: "wavesparks",
      spaceId: "space_main",
      requireProfile: true,
    });
  });

  it("filters by display name or headline without exposing private fields", async () => {
    const response = await GET(request("?q=design"), context());
    const payload = await response.json();

    expect(payload.candidates).toHaveLength(1);
    expect(payload.candidates[0].membershipId).toBe("mem_zoe");
    expect(JSON.stringify(payload)).not.toContain("private.example");
  });

  it("rejects oversized searches before reading member records", async () => {
    const response = await GET(request(`?q=${"x".repeat(81)}`), context());

    expect(response.status).toBe(400);
    expect(mocks.requireAccess).not.toHaveBeenCalled();
    expect(mocks.listMembers).not.toHaveBeenCalled();
  });

  it("returns safe auth and cross-Space errors", async () => {
    mocks.requireAccess.mockRejectedValueOnce(new Error("Authentication required."));
    const unauthenticated = await GET(request(), context());
    expect(unauthenticated.status).toBe(401);

    mocks.requireAccess.mockRejectedValueOnce(
      new Error("The selected community or event could not be found."),
    );
    const missing = await GET(request(), context("space_other_org"));
    expect(missing.status).toBe(404);

    mocks.requireAccess.mockRejectedValueOnce(
      new Error("You do not have access to this community or event."),
    );
    const forbidden = await GET(request(), context());
    expect(forbidden.status).toBe(403);
  });
});

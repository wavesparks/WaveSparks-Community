import { beforeEach, describe, expect, it, vi } from "vitest";

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
const redirectMock = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
);
const getViewerContextMock = vi.hoisted(() => vi.fn());
const getPostByIdMock = vi.hoisted(() => vi.fn());
const getSpaceByIdMock = vi.hoisted(() => vi.fn());
const getSpaceViewerContextMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

vi.mock("@/lib/auth", () => ({
  getViewerContext: getViewerContextMock,
}));

vi.mock("@/lib/space-auth", () => ({
  getSpaceViewerContext: getSpaceViewerContextMock,
}));

vi.mock("@/server/store", () => ({
  getPostById: getPostByIdMock,
  getSpaceById: getSpaceByIdMock,
}));

import LegacyPostDetailPage from "@/app/org/[slug]/posts/[postId]/page";

describe("legacy post direct links", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getViewerContextMock.mockResolvedValue({ org: { id: "org_1" } });
  });

  it("fails closed when a migrated post has no owning Space", async () => {
    getPostByIdMock.mockResolvedValue({
      id: "pst_null_space",
      orgId: "org_1",
      spaceId: undefined,
    });

    await expect(
      LegacyPostDetailPage({
        params: Promise.resolve({ slug: "wavesparks", postId: "pst_null_space" }),
        searchParams: Promise.resolve({ source: "email" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getSpaceByIdMock).not.toHaveBeenCalled();
    expect(getSpaceViewerContextMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("re-authorizes and redirects a scoped post to its canonical Space URL", async () => {
    getPostByIdMock.mockResolvedValue({
      id: "pst_event",
      orgId: "org_1",
      spaceId: "spc_event",
    });
    getSpaceByIdMock.mockResolvedValue({
      id: "spc_event",
      orgId: "org_1",
      slug: "summit",
    });
    getSpaceViewerContextMock.mockResolvedValue({ viewer: { org: { id: "org_1" } } });

    await expect(
      LegacyPostDetailPage({
        params: Promise.resolve({ slug: "wavesparks", postId: "pst_event" }),
        searchParams: Promise.resolve({ source: "email" }),
      }),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/org/wavesparks/s/summit/posts/pst_event?source=email",
    );
    expect(getSpaceViewerContextMock).toHaveBeenCalledWith(
      "wavesparks",
      "summit",
      expect.objectContaining({ requireAccess: true, requireAuth: true }),
    );
  });
});

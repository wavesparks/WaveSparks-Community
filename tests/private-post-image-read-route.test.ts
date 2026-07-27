// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getImage: vi.fn(),
  getMedia: vi.fn(),
  getOrganization: vi.fn(),
  getPost: vi.fn(),
  getViewer: vi.fn(),
  requireSpaceAccess: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getViewerContextForAction: mocks.getViewer,
}));

vi.mock("@/lib/space-auth", () => ({
  requireSpaceAccessForAction: mocks.requireSpaceAccess,
}));

vi.mock("@/server/post-media-storage", () => ({
  getPrivateMedia: mocks.getMedia,
}));

vi.mock("@/server/store", () => ({
  getOrganizationById: mocks.getOrganization,
  getPostByIdInSpace: mocks.getPost,
  getPostImageById: mocks.getImage,
}));

import { GET } from "@/app/api/post-images/[imageId]/route";

const IMAGE_BYTES = new TextEncoder().encode("private-image-bytes");

function imageRecord(
  overrides: Partial<{
    blobPathname: string;
    contentType: string;
    moderationStatus: "removed" | "visible";
    orgId: string;
    postId: string | null;
    spaceId: string;
    uploaderMembershipId: string;
    uploadStatus: "failed" | "pending" | "processing" | "ready";
  }> = {},
) {
  return {
    id: "image_1",
    orgId: "org_1",
    spaceId: "space_1",
    uploaderMembershipId: "membership_viewer",
    postId: "post_1",
    blobPathname: "post-images/space_1/image_1.webp",
    contentType: "image/webp",
    uploadStatus: "ready" as const,
    moderationStatus: "visible" as const,
    ...overrides,
  };
}

function viewer(
  overrides: Partial<{
    accountStatus: "connected" | "revoked";
    canAdmin: boolean;
    membershipId: string;
    orgId: string;
  }> = {},
) {
  return {
    canAdmin: overrides.canAdmin ?? false,
    org: { id: overrides.orgId ?? "org_1", slug: "wavesparks" },
    membership: {
      id: overrides.membershipId ?? "membership_viewer",
      accountStatus: overrides.accountStatus ?? "connected",
    },
  };
}

function request() {
  return new Request("http://localhost/api/post-images/image_1");
}

function context(imageId = "image_1") {
  return { params: Promise.resolve({ imageId }) };
}

function privateMedia() {
  return {
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(IMAGE_BYTES);
        controller.close();
      },
    }),
    contentType: "image/webp",
    size: IMAGE_BYTES.byteLength,
  };
}

describe("private post image read route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getImage.mockResolvedValue(imageRecord());
    mocks.getOrganization.mockResolvedValue({ id: "org_1", slug: "wavesparks" });
    mocks.getViewer.mockResolvedValue(viewer());
    mocks.requireSpaceAccess.mockResolvedValue({ space: { id: "space_1" } });
    mocks.getPost.mockResolvedValue({
      id: "post_1",
      orgId: "org_1",
      spaceId: "space_1",
      hidden: false,
    });
    mocks.getMedia.mockResolvedValue(privateMedia());
  });

  it("conceals the image from unauthenticated and cross-organization viewers", async () => {
    mocks.getViewer.mockResolvedValueOnce(null);
    const unauthenticated = await GET(request(), context());

    expect(unauthenticated.status).toBe(404);
    expect(unauthenticated.headers.get("cache-control")).toBe("private, no-store");
    expect(unauthenticated.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.requireSpaceAccess).not.toHaveBeenCalled();
    expect(mocks.getMedia).not.toHaveBeenCalled();

    mocks.getViewer.mockResolvedValueOnce(
      viewer({ canAdmin: true, orgId: "org_2" }),
    );
    const crossOrganization = await GET(request(), context());

    expect(crossOrganization.status).toBe(404);
    expect(mocks.requireSpaceAccess).not.toHaveBeenCalled();
    expect(mocks.getMedia).not.toHaveBeenCalled();
  });

  it("conceals the image when the member cannot access its Space", async () => {
    mocks.requireSpaceAccess.mockRejectedValueOnce(
      new Error("The selected community or event could not be found."),
    );

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(mocks.requireSpaceAccess).toHaveBeenCalledWith({
      slug: "wavesparks",
      spaceId: "space_1",
    });
    expect(mocks.getPost).not.toHaveBeenCalled();
    expect(mocks.getMedia).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "has been removed by moderation",
      image: imageRecord({ moderationStatus: "removed" }),
      post: { id: "post_1", orgId: "org_1", spaceId: "space_1", hidden: false },
    },
    {
      label: "belongs to a hidden post",
      image: imageRecord(),
      post: { id: "post_1", orgId: "org_1", spaceId: "space_1", hidden: true },
    },
  ])("conceals the image from members when it $label", async ({ image, post }) => {
    mocks.getImage.mockResolvedValueOnce(image);
    mocks.getPost.mockResolvedValueOnce(post);

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(mocks.getMedia).not.toHaveBeenCalled();
  });

  it("streams a visible image to a current Space member with private response headers", async () => {
    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-length")).toBe(String(IMAGE_BYTES.byteLength));
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.text()).resolves.toBe("private-image-bytes");
    expect(mocks.getMedia).toHaveBeenCalledWith(
      "post-images/space_1/image_1.webp",
    );
  });

  it("lets an organization admin inspect a removed image on a hidden post", async () => {
    mocks.getImage.mockResolvedValueOnce(
      imageRecord({ moderationStatus: "removed" }),
    );
    mocks.getViewer.mockResolvedValueOnce(viewer({ canAdmin: true }));
    mocks.getPost.mockResolvedValueOnce({
      id: "post_1",
      orgId: "org_1",
      spaceId: "space_1",
      hidden: true,
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(mocks.requireSpaceAccess).not.toHaveBeenCalled();
    await expect(response.text()).resolves.toBe("private-image-bytes");
  });
});

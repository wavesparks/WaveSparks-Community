// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentAuthIdentityMock = vi.hoisted(() => vi.fn());
const getViewerRecordByEmailAndSlugMock = vi.hoisted(() => vi.fn());
const canViewAdminRouteMock = vi.hoisted(() => vi.fn());
const uploadAssetMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-identity", () => ({
  getCurrentAuthIdentity: getCurrentAuthIdentityMock,
}));

vi.mock("@/server/store", () => ({
  getViewerRecordByEmailAndSlug: getViewerRecordByEmailAndSlugMock,
}));

vi.mock("@/server/permissions", () => ({
  canViewAdminRoute: canViewAdminRouteMock,
}));

vi.mock("@/server/upload", () => ({
  uploadAsset: uploadAssetMock,
}));

import { POST as uploadAvatar } from "@/app/api/uploads/avatar/route";
import { POST as uploadOrgLogo } from "@/app/api/uploads/org-logo/route";

function imageRequest(path: string, file?: File) {
  const formData = new FormData();
  if (file) formData.set("file", file);
  return new Request(`http://localhost${path}`, {
    body: formData,
    method: "POST",
  });
}

describe("image upload routes", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getCurrentAuthIdentityMock.mockResolvedValue({
      email: "admin@example.com",
      name: "Admin",
      provider: "clerk",
    });
    getViewerRecordByEmailAndSlugMock.mockResolvedValue({
      membership: { id: "membership_1" },
      org: { id: "org_1", slug: "wavesparks" },
      user: { id: "user_1" },
    });
    canViewAdminRouteMock.mockReturnValue(true);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("returns a safe message while logging the original profile photo error", async () => {
    const originalError = new Error("private provider response");
    uploadAssetMock.mockRejectedValueOnce(originalError);

    const response = await uploadAvatar(
      imageRequest(
        "/api/uploads/avatar",
        new File(["image"], "photo.png", { type: "image/png" }),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "We couldn't upload your photo. Please try again.",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[wavesparks] Profile photo upload failed",
      originalError,
    );
  });

  it("returns a safe message while logging the original logo error", async () => {
    const originalError = new Error("private storage details");
    uploadAssetMock.mockRejectedValueOnce(originalError);

    const response = await uploadOrgLogo(
      imageRequest(
        "/api/uploads/org-logo?slug=wavesparks",
        new File(["image"], "logo.webp", { type: "image/webp" }),
      ),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "We couldn't upload the logo. Please try again.",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[wavesparks] Community logo upload failed",
      originalError,
    );
  });

  it("explains supported image formats without calling storage", async () => {
    const response = await uploadAvatar(
      imageRequest(
        "/api/uploads/avatar",
        new File(["image"], "photo.gif", { type: "image/gif" }),
      ),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: "Use a JPG, PNG, or WebP image.",
    });
    expect(uploadAssetMock).not.toHaveBeenCalled();
  });
});

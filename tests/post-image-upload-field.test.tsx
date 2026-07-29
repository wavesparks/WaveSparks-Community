import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PostImageUploadField,
  type StagedPostImage,
} from "@/components/community/post-image-upload-field";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({
  upload: mocks.upload,
}));

function UploadHarness() {
  const [images, setImages] = useState<StagedPostImage[]>([]);
  return (
    <>
      <PostImageUploadField
        endpoint="/api/org/wavesparks/spaces/space_1/post-images/upload"
        images={images}
        membershipId="membership_1"
        setImages={setImages}
        spaceId="space_1"
      />
      <output data-testid="upload-status">{images[0]?.status ?? "empty"}</output>
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  const NativeURL = URL;
  vi.stubGlobal(
    "URL",
    class MockURL extends NativeURL {
      static createObjectURL = vi.fn(() => "blob:test-image");
      static revokeObjectURL = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("post image upload field", () => {
  it("reaches ready when Blob remains at 89% but server processing completes", async () => {
    let resolveStatus!: (response: Response) => void;
    let resolveUpload!: () => void;
    const statusResponse = new Promise<Response>((resolve) => {
      resolveStatus = resolve;
    });
    const uploadResponse = new Promise<void>((resolve) => {
      resolveUpload = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => statusResponse));
    mocks.upload.mockImplementation(
      (
        _pathname: string,
        _file: File,
        options: {
          onUploadProgress?: (progress: {
            loaded: number;
            percentage: number;
            total: number;
          }) => void;
        },
      ) => {
        options.onUploadProgress?.({ loaded: 89, percentage: 89, total: 100 });
        return uploadResponse;
      },
    );

    render(<UploadHarness />);
    fireEvent.change(screen.getByLabelText("Add images"), {
      target: {
        files: [new File(["image bytes"], "community.png", { type: "image/png" })],
      },
    });

    expect(await screen.findByText("89% uploaded")).toBeInTheDocument();
    expect(screen.getByTestId("upload-status")).toHaveTextContent("uploading");

    resolveStatus(
      Response.json({
        image: {
          height: 600,
          readUrl: "/api/post-images/pimg_test",
          sizeBytes: 1024,
          status: "ready",
          width: 800,
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Ready")).toBeInTheDocument();
      expect(screen.getByTestId("upload-status")).toHaveTextContent("ready");
    });

    await act(async () => {
      resolveUpload();
    });
    expect(screen.getByTestId("upload-status")).toHaveTextContent("ready");
  });

  it("does not let a late Blob completion overwrite a failed status", async () => {
    let resolveStatus!: (response: Response) => void;
    let resolveUpload!: () => void;
    const statusResponse = new Promise<Response>((resolve) => {
      resolveStatus = resolve;
    });
    const uploadResponse = new Promise<void>((resolve) => {
      resolveUpload = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => statusResponse));
    mocks.upload.mockReturnValue(uploadResponse);

    render(<UploadHarness />);
    fireEvent.change(screen.getByLabelText("Add images"), {
      target: {
        files: [new File(["image bytes"], "broken.png", { type: "image/png" })],
      },
    });

    resolveStatus(
      Response.json({
        image: {
          error: "The image is invalid.",
          status: "failed",
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("The image is invalid.")).toBeInTheDocument();
      expect(screen.getByTestId("upload-status")).toHaveTextContent("failed");
    });

    await act(async () => {
      resolveUpload();
    });
    expect(screen.getByTestId("upload-status")).toHaveTextContent("failed");
  });
});

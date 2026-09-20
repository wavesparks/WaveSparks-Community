import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PostImageGallery } from "@/components/community/post-image-gallery";

const images = [
  {
    alt: "Second workshop photo",
    height: 900,
    id: "image-2",
    position: 2,
    url: "/api/post-images/image-2",
    width: 1200,
  },
  {
    alt: "First workshop photo",
    height: 900,
    id: "image-1",
    position: 1,
    url: "/api/post-images/image-1",
    width: 1200,
  },
];

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

describe("PostImageGallery", () => {
  it("uses compact thumbnails and opens the selected image in a dialog", async () => {
    render(<PostImageGallery compact images={images} />);

    const firstTrigger = screen.getByRole("button", {
      name: "Open image 1 of 2: First workshop photo",
    });
    expect(firstTrigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(firstTrigger.closest("figure")).toHaveClass("h-36", "sm:w-52");

    fireEvent.click(firstTrigger);

    const dialog = await screen.findByRole("dialog", { name: "Image preview" });
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByRole("img", { name: "First workshop photo" }))
      .toHaveClass("object-contain");
    expect(within(dialog).getByText("1 / 2")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Next image" }));
    expect(within(dialog).getByRole("img", { name: "Second workshop photo" }))
      .toBeInTheDocument();
    expect(within(dialog).getByText("2 / 2")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(within(dialog).queryByRole("img")).not.toBeInTheDocument();
    await waitFor(() => expect(firstTrigger).toHaveFocus());
  });

  it("keeps unsafe image paths out of the gallery", () => {
    render(
      <PostImageGallery
        images={[
          ...images,
          {
            alt: "Unsafe image",
            height: 10,
            id: "unsafe-image",
            url: "https://example.com/image.png",
            width: 10,
          },
        ]}
      />,
    );

    expect(screen.queryByAltText("Unsafe image")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Open image/u })).toHaveLength(2);
  });
});

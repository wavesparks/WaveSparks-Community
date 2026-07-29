import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/admin", () => ({
  updatePostContentAction: vi.fn(),
}));

import { PostEditorDialog } from "@/components/admin/post-editor-dialog";

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

describe("PostEditorDialog", () => {
  it("hides roles needed for resources and restores the field for other post types", async () => {
    const user = userEvent.setup();
    render(
      <PostEditorDialog
        post={{
          body: "A concise operator handbook.",
          hasImages: false,
          hasLinkPreview: false,
          id: "pst_resource",
          mentionCount: 0,
          relatedRolesNeeded: [],
          tags: ["operations"],
          title: "Operator handbook",
          type: "resource",
        }}
        slug="wavesparks"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit post" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit post" });

    expect(within(dialog).queryByLabelText("Roles needed")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Title/u)).toBeRequired();

    await user.selectOptions(within(dialog).getByLabelText("Post type"), "general_update");

    expect(within(dialog).getByLabelText("Roles needed")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Title/u)).not.toBeRequired();
  });

  it("preserves editable opportunity provenance and explains content side effects", async () => {
    const user = userEvent.setup();
    render(
      <PostEditorDialog
        post={{
          body: "Ask @Rhea about https://example.com/programme.",
          hasImages: true,
          hasLinkPreview: true,
          id: "pst_opportunity",
          mentionCount: 1,
          opportunitySource: "mentor",
          relatedRolesNeeded: ["design"],
          relatedStartupName: "Harbour Labs",
          tags: ["climate"],
          title: "Design mentor office hours",
          type: "opportunity",
        }}
        slug="wavesparks"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit post" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit post" });

    expect(within(dialog).getByLabelText("Shared by")).toHaveValue("mentor");
    expect(within(dialog).getByLabelText("Roles needed")).toHaveValue("design");
    expect(within(dialog).getByText(/existing @ mention/u)).toBeInTheDocument();
    expect(within(dialog).getByText(/first external link remains unchanged/u))
      .toBeInTheDocument();
    expect(within(dialog).getByText(/moderation status are preserved/u)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
  });
});

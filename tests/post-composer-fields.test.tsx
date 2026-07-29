import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/community/post-image-upload-field", () => ({
  PostImageUploadField: () => null,
}));

import { PostComposer } from "@/components/community/post-composer";

describe("PostComposer fields", () => {
  afterEach(() => cleanup());

  it("removes and clears Roles needed when the post becomes a resource", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <PostComposer
        action={vi.fn(async () => ({}))}
        canAdmin={false}
        communityName="Wavesparks Community"
        defaultOpportunitySource="member"
        defaultType="opportunity"
        imageUploadsEnabled={false}
        membershipId="mem_viewer"
        opportunityMode={false}
        slug="wavesparks"
        spaceId="space_main"
      />,
    );

    await user.type(screen.getByLabelText("Roles needed"), "design, GTM");
    await user.selectOptions(screen.getByLabelText("Post type"), "resource");

    expect(screen.queryByLabelText("Roles needed")).not.toBeInTheDocument();
    expect(new FormData(container.querySelector("form")!).has("related_roles_needed")).toBe(
      false,
    );

    await user.selectOptions(screen.getByLabelText("Post type"), "ask");
    expect(screen.getByLabelText("Roles needed")).toHaveValue("");
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OrgLogoUploadField } from "@/components/admin/org-logo-upload-field";
import { AvatarUploadField } from "@/components/onboarding/avatar-upload-field";

afterEach(cleanup);

describe("image upload fields", () => {
  it("uses familiar profile photo language", () => {
    render(<AvatarUploadField defaultValue="" displayName="Avery Tan" />);

    expect(screen.getByLabelText("Profile photo")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp",
    );
    expect(screen.getByLabelText("Or use an image link")).toBeInTheDocument();
    expect(screen.queryByText(/fallback|portrait/i)).not.toBeInTheDocument();
  });

  it("uses familiar community logo language", () => {
    render(
      <OrgLogoUploadField
        defaultValue=""
        orgName="Wavesparks"
        slug="wavesparks"
      />,
    );

    expect(screen.getByLabelText("Community logo")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp",
    );
    expect(screen.getByLabelText("Or use an image link")).toBeInTheDocument();
    expect(screen.queryByText(/fallback/i)).not.toBeInTheDocument();
  });
});

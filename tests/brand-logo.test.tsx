import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BrandLogo } from "@/components/ui/brand-logo";

describe("BrandLogo", () => {
  afterEach(() => cleanup());

  it("keeps the source aspect ratio when a caller supplies a constrained width and height", () => {
    render(<BrandLogo className="h-8 w-24" />);

    const logo = screen.getByRole("img", { name: "Wavesparks" });
    expect(logo).toHaveAttribute("width", "2627");
    expect(logo).toHaveAttribute("height", "385");
    expect(logo).toHaveClass("w-24", "h-auto", "object-contain");
    expect(logo).not.toHaveClass("h-8");
  });
});

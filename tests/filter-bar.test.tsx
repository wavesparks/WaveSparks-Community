import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FilterBar } from "@/components/community/filter-bar";

describe("FilterBar accessibility", () => {
  afterEach(() => cleanup());

  it("gives every feed filter a stable accessible name", () => {
    render(<FilterBar clearHref="/org/wavesparks/s/main/feed" filters={{}} />);

    expect(screen.getByRole("searchbox", { name: "Search posts, tags, people" }))
      .toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Post type" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Tag" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Author affiliation" }))
      .toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Author stage" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Author industry" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Role needed" })).toBeInTheDocument();
  });

  it("uses opportunity-specific names without relying on placeholders", () => {
    render(
      <FilterBar
        clearHref="/org/wavesparks/s/main/opportunities"
        filters={{}}
        opportunityMode
      />,
    );

    expect(screen.getByRole("searchbox", { name: "Search opportunities" }))
      .toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Opportunity source" }))
      .toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Opportunity type" }))
      .toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/org/wavesparks/s/event-alpha/knowledge",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

import {
  SpaceSectionNavigation,
  SpaceSwitcher,
  type SpaceShellSpace,
} from "@/components/layout/space-shell-navigation";

const spaces: SpaceShellSpace[] = [
  {
    endsAt: undefined,
    eventLabel: "",
    id: "space-main",
    kind: "main" as const,
    lifecycle: "active" as const,
    name: "Main Community",
    slug: "main",
    startsAt: undefined,
  },
  {
    endsAt: undefined,
    eventLabel: "",
    id: "space-event-alpha",
    kind: "event" as const,
    lifecycle: "active" as const,
    name: "Event Alpha",
    slug: "event-alpha",
    startsAt: undefined,
  },
  {
    endsAt: undefined,
    eventLabel: "",
    id: "space-event-past",
    kind: "event" as const,
    lifecycle: "ended" as const,
    name: "Event Past",
    slug: "event-past",
    startsAt: undefined,
  },
];

describe("SpaceSwitcher", () => {
  afterEach(() => cleanup());

  it("uses member-facing labels, preserves the section, and closes after selection", () => {
    const { container } = render(
      <SpaceSwitcher
        currentSpace={spaces[1]}
        orgSlug="wavesparks"
        spaces={spaces}
      />,
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();

    const mainLink = screen.getByRole("link", { name: /Wavesparks Community/ });
    expect(mainLink).toHaveAttribute(
      "href",
      "/org/wavesparks/s/main/knowledge",
    );
    expect(screen.getByText("Your events")).toBeInTheDocument();
    expect(screen.getByText("Past events")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/org/wavesparks",
    );
    expect(screen.queryByText("Main Community")).not.toBeInTheDocument();
    expect(screen.queryByText("Permanent network")).not.toBeInTheDocument();

    if (!details) return;
    details.open = true;
    mainLink.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(mainLink);
    expect(details.open).toBe(false);
  });

  it("labels the requests route as Introductions", () => {
    navigation.pathname = "/org/wavesparks/s/event-alpha/requests";
    render(
      <SpaceSectionNavigation
        orgSlug="wavesparks"
        spaceSlug="event-alpha"
      />,
    );

    expect(screen.getByRole("link", { name: /Introductions/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("link", { name: /^Requests$/ })).not.toBeInTheDocument();
  });
});

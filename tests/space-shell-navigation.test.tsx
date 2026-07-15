import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/org/wavesparks/s/event-alpha/knowledge",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

import {
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

  it("preserves the current section and closes after selecting another Space", () => {
    const { container } = render(
      <SpaceSwitcher
        currentSpace={spaces[1]}
        orgSlug="wavesparks"
        spaces={spaces}
      />,
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();

    const mainLink = screen.getByRole("link", { name: /Main Community/ });
    expect(mainLink).toHaveAttribute(
      "href",
      "/org/wavesparks/s/main/knowledge",
    );

    if (!details) return;
    details.open = true;
    mainLink.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(mainLink);
    expect(details.open).toBe(false);
  });
});

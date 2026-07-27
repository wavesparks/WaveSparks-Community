import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/org/wavesparks/s/event-alpha/knowledge",
}));
const originalScrollTo = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollTo",
);

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
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalScrollTo) {
      Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
    }
  });

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

  it.each([
    ["Knowledge", "knowledge"],
    ["Opportunities", "opportunities"],
    ["Introductions", "requests"],
  ])("brings a clipped active %s link into view on direct entry", (label, section) => {
    navigation.pathname = `/org/wavesparks/s/event-alpha/${section}`;
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      if (this.getAttribute("aria-label") === "Community navigation") {
        return domRect(0, 320);
      }
      if (this.getAttribute("aria-current") === "page") {
        return domRect(420, 540);
      }
      return domRect(0, 100);
    });

    render(
      <SpaceSectionNavigation
        orgSlug="wavesparks"
        spaceSlug="event-alpha"
      />,
    );

    const activeLink = screen.getByRole("link", { name: new RegExp(label) });
    expect(activeLink).toHaveAttribute("aria-current", "page");
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.contexts[0]).toBe(
      screen.getByRole("navigation", { name: "Community navigation" }),
    );
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: "auto",
      left: 220,
    });
  });

  it("does not move a visible active link or repeat for the same section", () => {
    navigation.pathname = "/org/wavesparks/s/event-alpha/knowledge";
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      if (this.getAttribute("aria-label") === "Community navigation") {
        return domRect(0, 640);
      }
      if (this.getAttribute("aria-current") === "page") {
        return domRect(420, 540);
      }
      return domRect(0, 100);
    });

    const { rerender } = render(
      <SpaceSectionNavigation
        orgSlug="wavesparks"
        spaceSlug="event-alpha"
      />,
    );
    expect(scrollTo).not.toHaveBeenCalled();

    navigation.pathname = "/org/wavesparks/s/event-alpha/knowledge/post-1";
    rerender(
      <SpaceSectionNavigation
        orgSlug="wavesparks"
        spaceSlug="event-alpha"
      />,
    );
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

function domRect(left: number, right: number): DOMRect {
  return {
    bottom: 40,
    height: 40,
    left,
    right,
    top: 0,
    width: right - left,
    x: left,
    y: 0,
    toJSON: () => ({}),
  };
}

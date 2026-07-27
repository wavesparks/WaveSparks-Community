import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RichTextBody } from "@/components/community/rich-text-body";

describe("RichTextBody", () => {
  it("preserves line breaks and renders safe external links", () => {
    const { container } = render(
      <RichTextBody body={"First line\nVisit www.wavesparks.co/docs."} />,
    );
    const link = screen.getByRole("link", { name: "www.wavesparks.co/docs" });

    expect(container.firstChild).toHaveClass("whitespace-pre-wrap");
    expect(container).toHaveTextContent("First line Visit www.wavesparks.co/docs.");
    expect(link).toHaveAttribute("href", "https://www.wavesparks.co/docs");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute(
      "rel",
      "noopener noreferrer nofollow ugc",
    );
  });

  it("links only a valid, currently resolvable mention", () => {
    render(
      <RichTextBody
        body="Hello @Alice and @Former"
        mentions={[
          {
            membershipId: "mem_alice",
            label: "@Alice",
            start: 6,
            end: 12,
          },
          {
            membershipId: "mem_former",
            label: "@Former",
            start: 17,
            end: 24,
          },
        ]}
        memberHref={(membershipId) =>
          membershipId === "mem_alice"
            ? "/org/wavesparks/s/main/people/mem_alice"
            : undefined
        }
      />,
    );

    expect(screen.getByRole("link", { name: "@Alice" })).toHaveAttribute(
      "href",
      "/org/wavesparks/s/main/people/mem_alice",
    );
    expect(screen.queryByRole("link", { name: "@Former" })).not.toBeInTheDocument();
    expect(screen.getByText("@Former")).toBeInTheDocument();
  });

  it("renders stale mention ranges and unsafe member hrefs as plain text", () => {
    const { container } = render(
      <RichTextBody
        body="Hi @Alice <img src=x onerror=alert(1)>"
        mentions={[
          {
            membershipId: "mem_alice",
            label: "@Alicia",
            start: 3,
            end: 9,
            href: "javascript:alert(1)",
          },
        ]}
      />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("<img src=x onerror=alert(1)>");
  });
});

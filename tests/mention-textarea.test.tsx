import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MentionTextarea,
  type MentionValue,
} from "@/components/community/mention-textarea";

function MentionHarness() {
  const [mentions, setMentions] = useState<MentionValue[]>([]);
  const [value, setValue] = useState("");

  return (
    <>
      <MentionTextarea
        candidateEndpoint="/api/mention-candidates"
        id="mention-test"
        maxLength={2_000}
        mentions={mentions}
        name="body"
        onChange={setValue}
        onMentionsChange={setMentions}
        value={value}
      />
      <output data-testid="body-value">{value}</output>
      <output data-testid="mention-value">{JSON.stringify(mentions)}</output>
    </>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MentionTextarea", () => {
  it("creates UTF-16 ranges only after a keyboard-accessible candidate selection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        candidates: [
          {
            displayName: "Alice",
            headline: "Founder",
            isFollowing: true,
            membershipId: "mem_alice",
            photo: "",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<MentionHarness />);

    const textarea = screen.getByRole("combobox");
    await user.type(textarea, "😀 Hi @ali");
    await screen.findByRole("option", { name: /Alice/u });
    await user.keyboard("{ArrowDown}{Enter}");

    await waitFor(() => {
      expect(screen.getByTestId("body-value").textContent).toBe("😀 Hi @Alice ");
    });
    expect(JSON.parse(screen.getByTestId("mention-value").textContent ?? "[]")).toEqual([
      {
        end: 12,
        label: "@Alice",
        membershipId: "mem_alice",
        start: 6,
      },
    ]);

    fireEvent.change(textarea, {
      target: { selectionStart: 3, value: "Yo 😀 Hi @Alice " },
    });
    expect(JSON.parse(screen.getByTestId("mention-value").textContent ?? "[]")).toEqual([
      {
        end: 15,
        label: "@Alice",
        membershipId: "mem_alice",
        start: 9,
      },
    ]);
  });

  it("keeps a manually typed name as plain text when no candidate is selected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ candidates: [] })),
    );
    const user = userEvent.setup();
    render(<MentionHarness />);

    await user.type(screen.getByRole("combobox"), "Hello @Nobody");

    expect(screen.getByTestId("body-value")).toHaveTextContent("Hello @Nobody");
    expect(screen.getByTestId("mention-value")).toHaveTextContent("[]");
  });
});

import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  status: null as string | null,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: () => navigation.status,
  }),
}));

import { SearchParamStatusBanner } from "@/components/ui/search-param-status-banner";

describe("SearchParamStatusBanner", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    container?.remove();
    root = undefined;
    container = undefined;
    navigation.status = null;
    vi.restoreAllMocks();
  });

  it("hydrates a query-derived banner without a server/client mismatch", async () => {
    navigation.status = null;
    const serverMarkup = renderToString(<SearchParamStatusBanner />);
    container = document.createElement("div");
    container.innerHTML = serverMarkup;
    document.body.append(container);

    navigation.status = "post_created";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      root = hydrateRoot(container!, <SearchParamStatusBanner />);
    });

    expect(container).toHaveTextContent("Post published");
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/hydrat/i);
  });
});

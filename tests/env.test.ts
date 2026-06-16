import { afterEach, describe, expect, it, vi } from "vitest";

async function loadEnv() {
  vi.resetModules();
  return import("@/lib/env");
}

describe("environment configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats empty Clerk keys as unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", " ");

    const { isClerkConfigured } = await loadEnv();

    expect(isClerkConfigured()).toBe(false);
  });
});

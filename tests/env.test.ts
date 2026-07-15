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

  it("uses canonical Wavesparks organization routes by default", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_IN_URL", "");
    vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_UP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL", "");
    vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL", "");

    const { env } = await loadEnv();

    expect(env.clerkSignInUrl).toBe("/org/wavesparks/signin");
    expect(env.clerkSignUpUrl).toBe("/org/wavesparks/sign-up");
    expect(env.clerkSignInFallbackRedirectUrl).toBe("/org/wavesparks");
    expect(env.clerkSignUpFallbackRedirectUrl).toBe("/org/wavesparks");
  });

  it("normalizes legacy Clerk route overrides to Wavesparks", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_IN_URL", "/org/wavespark/signin");
    vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_UP_URL", "/org/wavespark/sign-up");
    vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL", "/org/wavespark");
    vi.stubEnv("NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL", "/org/wavespark");

    const { env } = await loadEnv();

    expect(env.clerkSignInUrl).toBe("/org/wavesparks/signin");
    expect(env.clerkSignUpUrl).toBe("/org/wavesparks/sign-up");
    expect(env.clerkSignInFallbackRedirectUrl).toBe("/org/wavesparks");
    expect(env.clerkSignUpFallbackRedirectUrl).toBe("/org/wavesparks");
  });

  it("fails Space-scoped reads closed when production does not explicitly enable them", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SPACE_SCOPED_READS_ENABLED", "");

    const { assertSpaceScopedReadsEnabled, env } = await loadEnv();

    expect(env.spaceScopedReadsEnabled).toBe(false);
    expect(() => assertSpaceScopedReadsEnabled()).toThrow(
      "No organization-wide fallback is permitted.",
    );
  });

  it("allows an explicit production Space-scoped rollout", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SPACE_SCOPED_READS_ENABLED", "true");

    const { assertSpaceScopedReadsEnabled, env } = await loadEnv();

    expect(env.spaceScopedReadsEnabled).toBe(true);
    expect(() => assertSpaceScopedReadsEnabled()).not.toThrow();
  });
});

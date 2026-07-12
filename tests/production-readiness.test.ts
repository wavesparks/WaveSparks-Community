import { describe, expect, it } from "vitest";

import { checkProductionReadiness } from "../scripts/check-production-readiness";

const baseProductionEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://app.wavesparks.co",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_wavesparks",
  CLERK_SECRET_KEY: "sk_live_wavesparks",
  CLERK_WEBHOOK_SIGNING_SECRET: "whsec_wavesparks",
  DATABASE_URL: "postgres://wavespark:secret@db.wavesparks.co:5432/wavespark",
  CRON_SECRET: "cron-secret-with-enough-production-entropy",
  WAVESPARK_ADMIN_EMAILS: "letsbuild@wavesparks.co",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_production_token_with_enough_entropy",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/org/wavespark/signin",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/org/wavespark/sign-up",
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "/org/wavespark",
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: "/org/wavespark",
  RESEND_API_KEY: "resend-production-key",
  RESEND_FROM_EMAIL: "hello@wavesparks.co",
};

describe("production readiness checks", () => {
  it("accepts a complete production configuration", () => {
    expect(checkProductionReadiness(baseProductionEnv)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("blocks local URLs and Clerk test keys", () => {
    const result = checkProductionReadiness({
      ...baseProductionEnv,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_wavesparks",
      CLERK_SECRET_KEY: "sk_test_wavesparks",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/wavesparks",
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_APP_URL must use https in production.",
        "NEXT_PUBLIC_APP_URL must not point to localhost in production.",
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must use a Clerk live key in production.",
        "CLERK_SECRET_KEY must use a Clerk live key in production.",
        "DATABASE_URL must not point to localhost in production.",
      ]),
    );
  });

  it("blocks the marketing site as the production app URL", () => {
    const result = checkProductionReadiness({
      ...baseProductionEnv,
      NEXT_PUBLIC_APP_URL: "https://wavesparks.co",
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_APP_URL must point to the community app domain (for example, https://app.wavesparks.co) so Clerk invitations return to the app, not the marketing site.",
      ]),
    );
  });

  it("accepts Vercel's system URL when the explicit app URL is not configured", () => {
    const result = checkProductionReadiness({
      ...baseProductionEnv,
      NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_URL: "wavesparks-community.vercel.app",
    });

    expect(result.errors).toEqual([]);
  });

  it("accepts Vercel Clerk integration keys without optional route overrides", () => {
    const result = checkProductionReadiness({
      ...baseProductionEnv,
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: undefined,
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: undefined,
      NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: undefined,
      NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: undefined,
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("NEXT_PUBLIC_CLERK_SIGN_IN_URL"),
        expect.stringContaining("NEXT_PUBLIC_CLERK_SIGN_UP_URL"),
        expect.stringContaining("NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL"),
        expect.stringContaining("NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL"),
      ]),
    );
  });

  it("rejects partial production integrations", () => {
    const result = checkProductionReadiness({
      ...baseProductionEnv,
      RESEND_FROM_EMAIL: undefined,
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Resend email config is incomplete. Set all of: RESEND_API_KEY, RESEND_FROM_EMAIL.",
      ]),
    );
  });

  it("warns when Vercel Blob upload storage is not configured", () => {
    const result = checkProductionReadiness({
      ...baseProductionEnv,
      BLOB_READ_WRITE_TOKEN: undefined,
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "BLOB_READ_WRITE_TOKEN is not configured; related production features may be unavailable.",
      ]),
    );
  });

  it("rejects local E2E auth configuration in production", () => {
    const result = checkProductionReadiness({
      ...baseProductionEnv,
      E2E_LOCAL_AUTH_ENABLED: "1",
      E2E_LOCAL_AUTH_SECRET: "local-e2e-secret",
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "E2E_LOCAL_AUTH_ENABLED must not be set in production.",
        "E2E_LOCAL_AUTH_SECRET must not be set in production.",
      ]),
    );
  });
});

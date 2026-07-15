import { describe, expect, it } from "vitest";

import {
  checkProductionReadiness,
  evaluateSpaceRolloutAuditRows,
} from "../scripts/check-production-readiness";

const baseProductionEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://app.wavesparks.co",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_wavesparks",
  CLERK_SECRET_KEY: "sk_live_wavesparks",
  CLERK_WEBHOOK_SIGNING_SECRET: "whsec_wavesparks",
  DATABASE_URL: "postgres://wavespark:secret@db.wavesparks.co:5432/wavespark",
  OPENAI_API_KEY: "sk-production-embedding-key",
  CRON_SECRET: "cron-secret-with-enough-production-entropy",
  WAVESPARK_ADMIN_EMAILS: "letsbuild@wavesparks.co",
  SPACE_SCOPED_READS_ENABLED: "true",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_production_token_with_enough_entropy",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/org/wavesparks/signin",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/org/wavesparks/sign-up",
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "/org/wavesparks",
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: "/org/wavesparks",
  RESEND_API_KEY: "resend-production-key",
  RESEND_FROM_EMAIL: "Wavesparks <notification@wavesparks.co>",
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

  it("rejects legacy singular Clerk organization routes", () => {
    const result = checkProductionReadiness({
      ...baseProductionEnv,
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/org/wavespark/signin",
      NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/org/wavespark/sign-up",
      NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "/org/wavespark",
      NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: "/org/wavespark",
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_CLERK_SIGN_IN_URL must use the canonical /org/wavesparks route.",
        "NEXT_PUBLIC_CLERK_SIGN_UP_URL must use the canonical /org/wavesparks route.",
        "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL must use the canonical /org/wavesparks route.",
        "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL must use the canonical /org/wavesparks route.",
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

  it("requires the production embedding provider", () => {
    const result = checkProductionReadiness({
      ...baseProductionEnv,
      OPENAI_API_KEY: undefined,
    });

    expect(result.errors).toContain("OPENAI_API_KEY is required.");
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

  it("requires Space-scoped reads to be explicitly enabled", () => {
    const missing = checkProductionReadiness({
      ...baseProductionEnv,
      SPACE_SCOPED_READS_ENABLED: undefined,
    });
    const disabled = checkProductionReadiness({
      ...baseProductionEnv,
      SPACE_SCOPED_READS_ENABLED: "false",
    });

    expect(missing.errors).toContain("SPACE_SCOPED_READS_ENABLED is required.");
    expect(disabled.errors).toContain(
      "SPACE_SCOPED_READS_ENABLED must be explicitly true in production; false or invalid values fail closed.",
    );
  });

  it("fails the rollout audit for missing Main spaces and null scoped resources", () => {
    expect(
      evaluateSpaceRolloutAuditRows([
        { check: "organizations_without_exactly_one_main", count: "1" },
        { check: "null_posts_space_id", count: 2 },
        { check: "null_content_notifications_space_id", count: "0" },
      ]),
    ).toEqual({
      errors: [
        "Space rollout audit: 1 organization(s) do not have exactly one active Main Community.",
        "Space rollout audit: 2 post(s) have null space_id.",
      ],
      warnings: [],
    });
  });

  it("allows null account notifications when all content notifications are Space-scoped", () => {
    expect(
      evaluateSpaceRolloutAuditRows([
        { check: "organizations_without_exactly_one_main", count: 0 },
        { check: "duplicate_space_memberships", count: "0" },
        { check: "invalid_space_relationships", count: 0 },
        { check: "null_posts_space_id", count: 0 },
        { check: "null_follows_space_id", count: 0 },
        { check: "null_intro_requests_space_id", count: 0 },
        { check: "null_content_notifications_space_id", count: 0 },
      ]),
    ).toEqual({ errors: [], warnings: [] });
  });
});

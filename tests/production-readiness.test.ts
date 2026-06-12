import { describe, expect, it } from "vitest";

import { checkProductionReadiness } from "../scripts/check-production-readiness";

const baseProductionEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://app.wavesparks.co",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_wavesparks",
  CLERK_SECRET_KEY: "sk_live_wavesparks",
  DATABASE_URL: "postgres://wavespark:secret@db.wavesparks.co:5432/wavespark",
  CRON_SECRET: "cron-secret-with-enough-production-entropy",
  NEXTAUTH_SECRET: "next-auth-secret-with-enough-production-entropy",
  WAVESPARK_ADMIN_EMAILS: "letsbuild@wavesparks.co",
  WAVESPARK_ADMIN_PASSWORD: "admin-password-with-enough-entropy",
  AUTH_DEV_DEMO_ENABLED: "false",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/org/wavespark/signin",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/org/wavespark/sign-up",
  NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "/org/wavespark",
  NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: "/org/wavespark",
  RESEND_API_KEY: "resend-production-key",
  RESEND_FROM_EMAIL: "hello@wavesparks.co",
  SUPABASE_URL: "https://storage.wavesparks.co",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-service-role-production-key",
  SUPABASE_BUCKET: "wavesparks",
};

describe("production readiness checks", () => {
  it("accepts a complete production configuration", () => {
    expect(checkProductionReadiness(baseProductionEnv)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("blocks local URLs, demo access, and Clerk test keys", () => {
    const result = checkProductionReadiness({
      ...baseProductionEnv,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_wavesparks",
      CLERK_SECRET_KEY: "sk_test_wavesparks",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/wavesparks",
      AUTH_DEV_DEMO_ENABLED: "true",
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_APP_URL must use https in production.",
        "NEXT_PUBLIC_APP_URL must not point to localhost in production.",
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must use a Clerk live key in production.",
        "CLERK_SECRET_KEY must use a Clerk live key in production.",
        "DATABASE_URL must not point to localhost in production.",
        "AUTH_DEV_DEMO_ENABLED must be set to false in production.",
      ]),
    );
  });

  it("requires NextAuth secret because email/password sign-in stays available", () => {
    const result = checkProductionReadiness({
      ...baseProductionEnv,
      NEXTAUTH_SECRET: undefined,
    });

    expect(result.errors).toContain("NEXTAUTH_SECRET is required for email/password sign-in.");
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
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Resend email config is incomplete. Set all of: RESEND_API_KEY, RESEND_FROM_EMAIL.",
        "Supabase upload config is incomplete. Set all of: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET.",
      ]),
    );
  });
});

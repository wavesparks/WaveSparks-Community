export const defaultBootstrapAdminEmails = ["letsbuild@wavesparks.co"] as const;

function parseEmailList(value?: string | null) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function withHttps(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function nonEmpty(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

const authDevDemoEnabled = nonEmpty(process.env.AUTH_DEV_DEMO_ENABLED);
const fallbackNextAuthSecret =
  process.env.NODE_ENV === "production" ? undefined : "development-secret";

const env = {
  appUrl:
    withHttps(process.env.NEXT_PUBLIC_APP_URL) ??
    withHttps(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    withHttps(process.env.VERCEL_URL) ??
    withHttps(process.env.NEXTAUTH_URL) ??
    "http://localhost:3000",
  nextAuthSecret: nonEmpty(process.env.NEXTAUTH_SECRET) ?? fallbackNextAuthSecret,
  clerkPublishableKey: nonEmpty(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
  clerkSecretKey: nonEmpty(process.env.CLERK_SECRET_KEY),
  clerkSignInUrl:
    nonEmpty(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL) ?? "/org/wavespark/signin",
  clerkSignUpUrl:
    nonEmpty(process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL) ?? "/org/wavespark/sign-up",
  clerkSignInFallbackRedirectUrl:
    nonEmpty(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL) ??
    "/org/wavespark",
  clerkSignUpFallbackRedirectUrl:
    nonEmpty(process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL) ??
    "/org/wavespark",
  databaseUrl: nonEmpty(process.env.DATABASE_URL),
  openAiApiKey: nonEmpty(process.env.OPENAI_API_KEY),
  resendApiKey: nonEmpty(process.env.RESEND_API_KEY),
  resendFromEmail:
    nonEmpty(process.env.RESEND_FROM_EMAIL) ?? "hello@wavespark.community",
  cronSecret: nonEmpty(process.env.CRON_SECRET),
  authDevDemoEnabled:
    authDevDemoEnabled === undefined
      ? process.env.NODE_ENV !== "production"
      : authDevDemoEnabled === "true",
  supabaseUrl: nonEmpty(process.env.SUPABASE_URL),
  supabaseServiceRoleKey: nonEmpty(process.env.SUPABASE_SERVICE_ROLE_KEY),
  supabaseBucket: nonEmpty(process.env.SUPABASE_BUCKET) ?? "wavesparks",
  wavesparkAdminEmails: nonEmpty(process.env.WAVESPARK_ADMIN_EMAILS) ?? "",
  wavesparkAdminPassword:
    nonEmpty(process.env.WAVESPARK_ADMIN_PASSWORD) ??
    (process.env.NODE_ENV === "production" ? "" : "wavespark-admin-dev"),
};

export function isClerkConfigured() {
  return Boolean(env.clerkPublishableKey && env.clerkSecretKey);
}

export function getBootstrapAdminEmails() {
  return Array.from(
    new Set([
      ...defaultBootstrapAdminEmails,
      ...parseEmailList(env.wavesparkAdminEmails),
    ]),
  );
}

export function isBootstrapAdminEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  return getBootstrapAdminEmails().includes(email.toLowerCase().trim());
}

export function getBootstrapAdminPassword() {
  return env.wavesparkAdminPassword;
}

export { env };

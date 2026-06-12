export const defaultBootstrapAdminEmails = ["letsbuild@wavesparks.co"] as const;

function parseEmailList(value?: string | null) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const env = {
  appUrl:
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000",
  nextAuthSecret: process.env.NEXTAUTH_SECRET ?? "development-secret",
  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
  clerkSignInUrl:
    process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/org/wavespark/signin",
  clerkSignUpUrl:
    process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ?? "/org/wavespark/sign-up",
  clerkSignInFallbackRedirectUrl:
    process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL ??
    "/org/wavespark",
  clerkSignUpFallbackRedirectUrl:
    process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL ??
    "/org/wavespark",
  databaseUrl: process.env.DATABASE_URL,
  openAiApiKey: process.env.OPENAI_API_KEY,
  resendApiKey: process.env.RESEND_API_KEY,
  resendFromEmail:
    process.env.RESEND_FROM_EMAIL ?? "hello@wavespark.community",
  cronSecret: process.env.CRON_SECRET,
  authDevDemoEnabled:
    process.env.AUTH_DEV_DEMO_ENABLED === undefined
      ? true
      : process.env.AUTH_DEV_DEMO_ENABLED === "true",
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseBucket: process.env.SUPABASE_BUCKET ?? "wavesparks",
  wavesparkAdminEmails: process.env.WAVESPARK_ADMIN_EMAILS ?? "",
  wavesparkAdminPassword:
    process.env.WAVESPARK_ADMIN_PASSWORD ??
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

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

function enabledRolloutFlag(value?: string | null) {
  const normalized = nonEmpty(value)?.toLowerCase();
  if (normalized) {
    return normalized === "true";
  }

  // Local development and tests keep their existing zero-config behavior. A production
  // process must opt in explicitly so a missing rollout variable fails closed.
  return process.env.NODE_ENV !== "production";
}

function canonicalizeWavesparksOrgUrl(value?: string) {
  return value?.replace(/\/org\/wavespark(?=\/|$)/, "/org/wavesparks");
}

const appUrl =
  withHttps(process.env.NEXT_PUBLIC_APP_URL) ??
  withHttps(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  withHttps(process.env.VERCEL_URL) ??
  "http://localhost:3000";

const env = {
  appUrl,
  clerkProxyUrl: withHttps(process.env.NEXT_PUBLIC_CLERK_PROXY_URL),
  clerkPublishableKey: nonEmpty(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
  clerkJwtKey: nonEmpty(process.env.CLERK_JWT_KEY),
  clerkSecretKey: nonEmpty(process.env.CLERK_SECRET_KEY),
  clerkWebhookSigningSecret: nonEmpty(process.env.CLERK_WEBHOOK_SIGNING_SECRET),
  clerkSignInUrl:
    canonicalizeWavesparksOrgUrl(nonEmpty(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL)) ??
    "/org/wavesparks/signin",
  clerkSignUpUrl:
    canonicalizeWavesparksOrgUrl(nonEmpty(process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL)) ??
    "/org/wavesparks/sign-up",
  clerkSignInFallbackRedirectUrl:
    canonicalizeWavesparksOrgUrl(
      nonEmpty(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL),
    ) ??
    "/org/wavesparks",
  clerkSignUpFallbackRedirectUrl:
    canonicalizeWavesparksOrgUrl(
      nonEmpty(process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL),
    ) ??
    "/org/wavesparks",
  databaseUrl: nonEmpty(process.env.DATABASE_URL),
  openAiApiKey: nonEmpty(process.env.OPENAI_API_KEY),
  resendApiKey: nonEmpty(process.env.RESEND_API_KEY),
  resendFromEmail:
    nonEmpty(process.env.RESEND_FROM_EMAIL) ?? "Wavesparks <notification@wavesparks.co>",
  cronSecret: nonEmpty(process.env.CRON_SECRET),
  blobReadWriteToken: nonEmpty(process.env.BLOB_READ_WRITE_TOKEN),
  wavesparkAdminEmails: nonEmpty(process.env.WAVESPARK_ADMIN_EMAILS) ?? "",
  spaceScopedReadsEnabled: enabledRolloutFlag(process.env.SPACE_SCOPED_READS_ENABLED),
};

export function assertSpaceScopedReadsEnabled() {
  if (!env.spaceScopedReadsEnabled) {
    throw new Error(
      "Space-scoped community access is temporarily disabled. No organization-wide fallback is permitted.",
    );
  }
}

export function isClerkConfigured() {
  return Boolean(env.clerkPublishableKey && env.clerkSecretKey);
}

export function isClerkWebhookConfigured() {
  return Boolean(env.clerkWebhookSigningSecret);
}

export function isVercelPreviewEnvironment() {
  return process.env.VERCEL_ENV === "preview";
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

export { env };

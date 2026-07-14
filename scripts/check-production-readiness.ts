const requiredEnv = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SIGNING_SECRET",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "CRON_SECRET",
  "WAVESPARK_ADMIN_EMAILS",
] as const;

const optionalButExpectedEnv = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "BLOB_READ_WRITE_TOKEN",
] as const;

export interface ProductionReadinessResult {
  errors: string[];
  warnings: string[];
}

function readEnv(env: NodeJS.ProcessEnv, key: string) {
  return env[key]?.trim() ?? "";
}

function isMissing(env: NodeJS.ProcessEnv, key: string) {
  return !readEnv(env, key);
}

function looksPlaceholder(value: string) {
  return /^(replace-with|change-me|changeme|todo|your-|<.+>)($|-)/i.test(value);
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.startsWith("127.")
  );
}

function isWavesparksMarketingHostname(hostname: string) {
  return hostname === "wavesparks.co" || hostname === "www.wavesparks.co";
}

function hostnameFromUrlValue(value: string) {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
      .hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function checkUrlValue(
  label: string,
  value: string,
  errors: string[],
  options: { requireHttps?: boolean; disallowLocal?: boolean } = {},
) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (options.requireHttps !== false && url.protocol !== "https:") {
      errors.push(`${label} must use https in production.`);
    }
    if (options.disallowLocal !== false && isLocalHostname(url.hostname)) {
      errors.push(`${label} must not point to localhost in production.`);
    }
  } catch {
    errors.push(`${label} must be a valid URL.`);
  }
}

function checkAppUrl(env: NodeJS.ProcessEnv, errors: string[]) {
  const candidates = [
    "NEXT_PUBLIC_APP_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "VERCEL_URL",
  ] as const;
  const key = candidates.find((candidate) => !isMissing(env, candidate));

  if (!key) {
    errors.push("NEXT_PUBLIC_APP_URL or VERCEL_URL is required.");
    return;
  }

  const value = readEnv(env, key);
  checkUrlValue(key, value, errors);

  const hostname = hostnameFromUrlValue(value);
  if (hostname && isWavesparksMarketingHostname(hostname)) {
    errors.push(
      `${key} must point to the community app domain (for example, https://app.wavesparks.co) so Clerk invitations return to the app, not the marketing site.`,
    );
  }
}

function checkPathOrHttpsUrl(env: NodeJS.ProcessEnv, key: string, errors: string[]) {
  const value = readEnv(env, key);
  if (!value) {
    return;
  }
  if (value.startsWith("/")) {
    return;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      errors.push(`${key} must be a relative path or an https URL.`);
    }
  } catch {
    errors.push(`${key} must be a relative path or an https URL.`);
  }
}

function checkProductionSecret(
  env: NodeJS.ProcessEnv,
  key: string,
  errors: string[],
  warnings: string[],
  minLength = 24,
) {
  const value = readEnv(env, key);
  if (!value) {
    return;
  }
  if (looksPlaceholder(value)) {
    errors.push(`${key} must not use a placeholder value.`);
    return;
  }
  if (value.length < minLength) {
    warnings.push(`${key} should be at least ${minLength} characters.`);
  }
}

function checkClerkKeys(env: NodeJS.ProcessEnv, errors: string[], warnings: string[]) {
  const publishableKey = readEnv(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const secretKey = readEnv(env, "CLERK_SECRET_KEY");
  const webhookSecret = readEnv(env, "CLERK_WEBHOOK_SIGNING_SECRET");

  if (publishableKey.startsWith("pk_test_")) {
    errors.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must use a Clerk live key in production.");
  } else if (publishableKey && !publishableKey.startsWith("pk_live_")) {
    warnings.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY does not look like a Clerk live key.");
  }

  if (secretKey.startsWith("sk_test_")) {
    errors.push("CLERK_SECRET_KEY must use a Clerk live key in production.");
  } else if (secretKey && !secretKey.startsWith("sk_live_")) {
    warnings.push("CLERK_SECRET_KEY does not look like a Clerk live key.");
  }

  if (webhookSecret && !webhookSecret.startsWith("whsec_")) {
    warnings.push("CLERK_WEBHOOK_SIGNING_SECRET does not look like a Clerk webhook secret.");
  }
}

function checkDatabaseUrl(env: NodeJS.ProcessEnv, errors: string[]) {
  const value = readEnv(env, "DATABASE_URL");
  if (!value) {
    return;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      errors.push("DATABASE_URL must use the postgres or postgresql protocol.");
    }
    if (isLocalHostname(url.hostname)) {
      errors.push("DATABASE_URL must not point to localhost in production.");
    }
  } catch {
    errors.push("DATABASE_URL must be a valid Postgres URL.");
  }
}

function checkEmailList(env: NodeJS.ProcessEnv, key: string, errors: string[]) {
  const value = readEnv(env, key);
  if (!value) {
    return;
  }

  const invalidEmails = value
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));

  if (invalidEmails.length) {
    errors.push(`${key} contains invalid email addresses: ${invalidEmails.join(", ")}.`);
  }
}

function checkPairedConfig(
  env: NodeJS.ProcessEnv,
  keys: readonly string[],
  errors: string[],
  featureName: string,
) {
  const presentKeys = keys.filter((key) => !isMissing(env, key));
  if (presentKeys.length > 0 && presentKeys.length < keys.length) {
    errors.push(`${featureName} config is incomplete. Set all of: ${keys.join(", ")}.`);
  }
}

function checkE2ELocalAuthDisabled(env: NodeJS.ProcessEnv, errors: string[]) {
  if (readEnv(env, "E2E_LOCAL_AUTH_ENABLED")) {
    errors.push("E2E_LOCAL_AUTH_ENABLED must not be set in production.");
  }
  if (readEnv(env, "E2E_LOCAL_AUTH_SECRET")) {
    errors.push("E2E_LOCAL_AUTH_SECRET must not be set in production.");
  }
}

export function checkProductionReadiness(
  env: NodeJS.ProcessEnv = process.env,
): ProductionReadinessResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const key of requiredEnv) {
    const value = readEnv(env, key);
    if (!value) {
      errors.push(`${key} is required.`);
    } else if (looksPlaceholder(value)) {
      errors.push(`${key} must not use a placeholder value.`);
    }
  }

  for (const key of optionalButExpectedEnv) {
    const value = readEnv(env, key);
    if (!value) {
      warnings.push(`${key} is not configured; related production features may be unavailable.`);
    } else if (looksPlaceholder(value)) {
      warnings.push(`${key} still looks like a placeholder value.`);
    }
  }

  checkAppUrl(env, errors);
  checkPathOrHttpsUrl(env, "NEXT_PUBLIC_CLERK_SIGN_IN_URL", errors);
  checkPathOrHttpsUrl(env, "NEXT_PUBLIC_CLERK_SIGN_UP_URL", errors);
  checkPathOrHttpsUrl(env, "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL", errors);
  checkPathOrHttpsUrl(env, "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL", errors);
  checkProductionSecret(env, "CRON_SECRET", errors, warnings, 32);
  checkClerkKeys(env, errors, warnings);
  checkDatabaseUrl(env, errors);
  checkEmailList(env, "WAVESPARK_ADMIN_EMAILS", errors);
  checkE2ELocalAuthDisabled(env, errors);
  checkPairedConfig(env, ["RESEND_API_KEY", "RESEND_FROM_EMAIL"], errors, "Resend email");

  return { errors, warnings };
}

async function main() {
  const { loadScriptEnv } = await import("./load-script-env");
  loadScriptEnv("production");
  const { errors, warnings } = checkProductionReadiness();

  if (warnings.length) {
    console.warn("Production readiness warnings:");
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }

  if (errors.length) {
    console.error("Production readiness failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.info("Production readiness checks passed.");
}

if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

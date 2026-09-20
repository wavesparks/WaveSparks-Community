const requiredEnv = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SIGNING_SECRET",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "CRON_SECRET",
  "WAVESPARK_ADMIN_EMAILS",
  "SPACE_SCOPED_READS_ENABLED",
] as const;

const optionalButExpectedEnv = [
  "BLOB_READ_WRITE_TOKEN",
  "POST_MEDIA_READ_WRITE_TOKEN",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
] as const;

export interface ProductionReadinessResult {
  errors: string[];
  warnings: string[];
}

export interface SpaceRolloutAuditRow {
  check: string;
  count: number | string;
}

const spaceRolloutCheckMessages: Record<string, string> = {
  organizations_without_exactly_one_main:
    "organization(s) do not have exactly one active Wavesparks Community",
  duplicate_space_memberships: "duplicate Space membership pair(s) exist",
  invalid_space_relationships: "orphan or cross-organization Space relationship(s) exist",
  null_posts_space_id: "post(s) have null space_id",
  null_follows_space_id: "follow(s) have null space_id",
  null_match_runs_space_id: "match run(s) have null space_id",
  null_matches_space_id: "match(es) have null space_id",
  null_match_feedback_space_id: "match feedback row(s) have null space_id",
  null_intro_requests_space_id: "intro request(s) have null space_id",
  null_content_notifications_space_id:
    "content or introduction notification(s) have null space_id",
};

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
      `${key} must point to the community app domain (for example, https://app.wavesparks.co) so invitation links return to the app, not the marketing site.`,
    );
  }
}

function checkPathOrHttpsUrl(env: NodeJS.ProcessEnv, key: string, errors: string[]) {
  const value = readEnv(env, key);
  if (!value) {
    return;
  }
  if (/\/org\/wavespark(?=\/|$)/.test(value)) {
    errors.push(`${key} must use the canonical /org/wavesparks route.`);
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

function checkSpaceScopedReadsFlag(env: NodeJS.ProcessEnv, errors: string[]) {
  const value = readEnv(env, "SPACE_SCOPED_READS_ENABLED").toLowerCase();
  if (value && value !== "true") {
    errors.push(
      "SPACE_SCOPED_READS_ENABLED must be explicitly true in production; false or invalid values fail closed.",
    );
  }
}

export function evaluateSpaceRolloutAuditRows(
  rows: SpaceRolloutAuditRow[],
): ProductionReadinessResult {
  const errors: string[] = [];

  for (const row of rows) {
    const count = Number(row.count);
    if (!Number.isFinite(count) || count < 0) {
      errors.push(`Space rollout audit returned an invalid count for ${row.check}.`);
      continue;
    }
    if (count === 0) continue;

    const message = spaceRolloutCheckMessages[row.check] ?? `${row.check} violation(s) exist`;
    errors.push(`Space rollout audit: ${count} ${message}.`);
  }

  return { errors, warnings: [] };
}

export async function checkSpaceRolloutReadiness(
  databaseUrl: string,
): Promise<ProductionReadinessResult> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const rows = await sql<SpaceRolloutAuditRow[]>`
      WITH audit AS (
        SELECT
          'organizations_without_exactly_one_main'::text AS "check",
          count(*)::bigint AS "count"
        FROM (
          SELECT o.id
          FROM organizations o
          LEFT JOIN spaces s
            ON s.org_id = o.id
            AND s.kind = 'main'
            AND s.lifecycle = 'active'
          GROUP BY o.id
          HAVING count(s.id) <> 1
        ) invalid_main

        UNION ALL
        SELECT 'duplicate_space_memberships', count(*)::bigint
        FROM (
          SELECT space_id, membership_id
          FROM space_memberships
          GROUP BY space_id, membership_id
          HAVING count(*) > 1
        ) duplicates

        UNION ALL
        SELECT 'invalid_space_relationships', count(*)::bigint
        FROM (
          SELECT sm.id
          FROM space_memberships sm
          LEFT JOIN spaces s ON s.id = sm.space_id AND s.org_id = sm.org_id
          LEFT JOIN memberships m ON m.id = sm.membership_id AND m.org_id = sm.org_id
          WHERE s.id IS NULL OR m.id IS NULL

          UNION ALL

          SELECT si.id
          FROM space_intents si
          LEFT JOIN space_memberships sm
            ON sm.space_id = si.space_id
            AND sm.membership_id = si.membership_id
            AND sm.org_id = si.org_id
          WHERE sm.id IS NULL
        ) invalid_relationships

        UNION ALL
        SELECT 'null_posts_space_id', count(*)::bigint FROM posts WHERE space_id IS NULL
        UNION ALL
        SELECT 'null_follows_space_id', count(*)::bigint FROM follows WHERE space_id IS NULL
        UNION ALL
        SELECT 'null_match_runs_space_id', count(*)::bigint FROM match_runs WHERE space_id IS NULL
        UNION ALL
        SELECT 'null_matches_space_id', count(*)::bigint FROM matches WHERE space_id IS NULL
        UNION ALL
        SELECT 'null_match_feedback_space_id', count(*)::bigint
          FROM match_feedback WHERE space_id IS NULL
        UNION ALL
        SELECT 'null_intro_requests_space_id', count(*)::bigint
          FROM intro_requests WHERE space_id IS NULL
        UNION ALL
        SELECT 'null_content_notifications_space_id', count(*)::bigint
          FROM notifications
          WHERE space_id IS NULL AND type NOT IN ('membership_approved', 'admin_note')
      )
      SELECT "check", "count" FROM audit ORDER BY "check"
    `;

    return evaluateSpaceRolloutAuditRows(rows);
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : undefined;
    const message =
      code === "42P01" || code === "42703"
        ? "Space rollout audit could not run because migrations 0009/0010 are not fully applied."
        : "Space rollout audit could not query the production database.";
    return { errors: [message], warnings: [] };
  } finally {
    await sql.end();
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
  checkSpaceScopedReadsFlag(env, errors);
  checkPairedConfig(env, ["RESEND_API_KEY", "RESEND_FROM_EMAIL"], errors, "Resend email");

  return { errors, warnings };
}

async function main() {
  const { loadScriptEnv } = await import("./load-script-env");
  loadScriptEnv("production");
  const result = checkProductionReadiness();
  const databaseUrl = readEnv(process.env, "DATABASE_URL");
  const envOnly = process.argv.includes("--env-only");
  if (!envOnly && !result.errors.length && databaseUrl) {
    const spaceResult = await checkSpaceRolloutReadiness(databaseUrl);
    result.errors.push(...spaceResult.errors);
    result.warnings.push(...spaceResult.warnings);
  }
  const { errors, warnings } = result;

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

  console.info(
    envOnly
      ? "Production environment checks passed. Run the full readiness check after migrations."
      : "Production readiness checks passed, including the Space data audit.",
  );
}

if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

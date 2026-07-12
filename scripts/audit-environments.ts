import { clerkKeyTarget, databaseTarget } from "./script-safety";
import { readScriptEnv } from "./load-script-env";

export interface EnvironmentAuditResult {
  development: { clerk: string; database: string };
  production: { clerk: string; database: string };
  errors: string[];
  warnings: string[];
}

export function auditEnvironments(cwd = process.cwd()): EnvironmentAuditResult {
  const development = readScriptEnv("development", cwd).values;
  const production = readScriptEnv("production", cwd).values;
  const developmentDatabase = databaseTarget(development.DATABASE_URL);
  const productionDatabase = databaseTarget(production.DATABASE_URL);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (developmentDatabase === productionDatabase && developmentDatabase !== "unconfigured") {
    errors.push("Development and Production resolve to the same database.");
  }
  if (development.DATABASE_URL) {
    try {
      const databaseName = new URL(development.DATABASE_URL).pathname.replace(/^\//, "");
      if (databaseName !== "wavespark_dev") {
        errors.push(`Development DATABASE_URL must target wavespark_dev, found ${databaseName}.`);
      }
    } catch {
      errors.push("Development DATABASE_URL is invalid.");
    }
  }
  if (
    development.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    !development.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith("pk_test_")
  ) {
    errors.push("Development must use a Clerk test publishable key.");
  }
  if (
    production.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    !production.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith("pk_live_")
  ) {
    errors.push("Production must use a Clerk live publishable key.");
  }
  if (!development.DATABASE_URL) {
    warnings.push("Development DATABASE_URL is not configured.");
  }
  if (!production.DATABASE_URL) {
    warnings.push("Production DATABASE_URL is not configured.");
  }

  return {
    development: {
      clerk: clerkKeyTarget(development.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
      database: developmentDatabase,
    },
    production: {
      clerk: clerkKeyTarget(production.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
      database: productionDatabase,
    },
    errors,
    warnings,
  };
}

function main() {
  const result = auditEnvironments();
  console.info(JSON.stringify(result, null, 2));
  if (result.errors.length) {
    process.exitCode = 1;
  }
}

if (process.env.NODE_ENV !== "test") {
  main();
}

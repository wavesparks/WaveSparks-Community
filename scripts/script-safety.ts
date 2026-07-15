import type { ScriptEnvMode } from "./load-script-env";

export type DeploymentEnvironment = Extract<ScriptEnvMode, "development" | "production">;

function optionValue(name: string) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export function readScriptTarget() {
  const rawEnvironment = optionValue("--environment");
  if (rawEnvironment !== "development" && rawEnvironment !== "production") {
    throw new Error(
      "Pass --environment=<development|production>. No environment is selected by default.",
    );
  }
  const environment: DeploymentEnvironment = rawEnvironment;

  return {
    environment,
    apply: process.argv.includes("--apply"),
    confirmProduction: process.argv.includes("--confirm-production"),
  };
}

export function assertWriteAllowed(target: ReturnType<typeof readScriptTarget>) {
  if (!target.apply) {
    return false;
  }
  if (target.environment === "production" && !target.confirmProduction) {
    throw new Error("Production writes require both --apply and --confirm-production.");
  }
  return true;
}

export function databaseTarget(databaseUrl?: string) {
  if (!databaseUrl) {
    return "unconfigured";
  }

  try {
    const url = new URL(databaseUrl);
    return `${url.hostname}/${url.pathname.replace(/^\//, "")}`;
  } catch {
    return "invalid DATABASE_URL";
  }
}

export function clerkKeyTarget(publishableKey?: string) {
  if (!publishableKey) {
    return "unconfigured";
  }
  const kind = publishableKey.startsWith("pk_live_") ? "live" : "test";
  return `${kind}:${publishableKey.slice(-8)}`;
}

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

import { readScriptEnv } from "./scripts/load-script-env";

const previewBaseUrl = process.env.PREVIEW_BASE_URL;
let previewUrl: URL;
try {
  previewUrl = new URL(previewBaseUrl ?? "invalid:");
} catch {
  throw new Error("PREVIEW_BASE_URL must be a valid URL.");
}
if (
  previewUrl.protocol !== "https:" ||
  previewUrl.username ||
  previewUrl.password ||
  !previewUrl.hostname.endsWith(".vercel.app") ||
  !previewUrl.hostname.startsWith("wavesparks-community-") ||
  previewUrl.hostname === "wavesparks-community.vercel.app"
) {
  throw new Error("PREVIEW_BASE_URL must be an HTTPS Vercel Preview URL.");
}
const linkedProject = JSON.parse(readFileSync(".vercel/project.json", "utf8")) as {
  orgId?: unknown;
  projectId?: unknown;
};
if (
  linkedProject.orgId !== "team_xGJXCgg6o35fAgWJwi6RmVcX" ||
  linkedProject.projectId !== "prj_SeVErkkzlCidn09g2ouAJHjbne3W"
) {
  throw new Error("Preview verification is restricted to the linked Wavesparks Vercel project.");
}
const expectedCommitSha = process.env.PREVIEW_EXPECTED_COMMIT_SHA;
if (!expectedCommitSha?.match(/^[a-f0-9]{40}$/)) {
  throw new Error("PREVIEW_EXPECTED_COMMIT_SHA must be the deployed 40-character commit SHA.");
}
const localCommit = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).stdout.trim();
if (localCommit !== expectedCommitSha) {
  throw new Error("Preview verification requires the current local commit to match the deployment.");
}
const deploymentLookup = spawnSync(
  "pnpm",
  [
    "dlx",
    "vercel@50.28.0",
    "api",
    `/v13/deployments/${previewUrl.hostname}`,
    "--scope",
    "wavesparks-28505e45",
    "--raw",
  ],
  { encoding: "utf8", env: process.env },
);
if (deploymentLookup.status !== 0) {
  throw new Error("The Vercel Preview deployment could not be authenticated through the API.");
}
const deployment = JSON.parse(deploymentLookup.stdout) as {
  name?: unknown;
  url?: unknown;
  target?: unknown;
  readyState?: unknown;
  projectId?: unknown;
  ownerId?: unknown;
  team?: { id?: unknown };
  gitSource?: { ref?: unknown; repoId?: unknown; sha?: unknown };
  env?: unknown[];
};
const deployedEnvNames = new Set(
  (deployment.env ?? []).filter((value): value is string => typeof value === "string"),
);
const requiredRuntimeEnvNames = [
  "DATABASE_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_JWT_KEY",
  "OPENAI_API_KEY",
  "SPACE_SCOPED_READS_ENABLED",
];
if (
  deployment.name !== "wavesparks-community" ||
  deployment.url !== previewUrl.hostname ||
  deployment.target === "production" ||
  deployment.readyState !== "READY" ||
  deployment.projectId !== "prj_SeVErkkzlCidn09g2ouAJHjbne3W" ||
  deployment.ownerId !== "team_xGJXCgg6o35fAgWJwi6RmVcX" ||
  deployment.team?.id !== "team_xGJXCgg6o35fAgWJwi6RmVcX" ||
  deployment.gitSource?.ref !== "codex/prelaunch-simulation" ||
  deployment.gitSource.repoId !== 1_219_745_677 ||
  deployment.gitSource.sha !== expectedCommitSha ||
  requiredRuntimeEnvNames.some((name) => !deployedEnvNames.has(name))
) {
  throw new Error(
    "The requested URL is not the approved ready Preview deployment for this project, branch, and commit.",
  );
}

const development = readScriptEnv("development").values;
for (const key of [
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "E2E_CLERK_ADMIN_EMAIL",
]) {
  if (process.env[key] === undefined && development[key] !== undefined) {
    process.env[key] = development[key];
  }
}

if (
  !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") ||
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")
) {
  throw new Error("Preview Clerk E2E is restricted to Clerk test-instance keys.");
}
if (new URL(development.DATABASE_URL ?? "postgresql://invalid/invalid").pathname !== "/wavespark_dev") {
  throw new Error("Preview Clerk E2E evidence must be paired with wavespark_dev.");
}

const bypassUrl = process.env.PREVIEW_BYPASS_URL;
if (bypassUrl) {
  let parsedBypass: URL;
  try {
    parsedBypass = new URL(bypassUrl);
  } catch {
    throw new Error("PREVIEW_BYPASS_URL must be a valid same-origin Vercel share URL.");
  }
  if (
    parsedBypass.origin !== previewUrl.origin ||
    parsedBypass.username ||
    parsedBypass.password ||
    !(
      parsedBypass.searchParams.has("_vercel_share") ||
      (parsedBypass.searchParams.has("x-vercel-protection-bypass") &&
        parsedBypass.searchParams.get("x-vercel-set-bypass-cookie") === "true")
    )
  ) {
    throw new Error(
      "PREVIEW_BYPASS_URL must be a same-origin Vercel share or automation-bypass URL.",
    );
  }
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /preview-admin\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: previewUrl.origin,
    trace: "off",
  },
  projects: [{ name: "preview-clerk-admin" }],
});

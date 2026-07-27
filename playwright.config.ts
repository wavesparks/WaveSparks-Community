import { defineConfig, devices } from "@playwright/test";
import { readScriptEnv } from "./scripts/load-script-env";

const runClerkBrowserTests = process.env.E2E_AUTH_MODE === "clerk";
if (runClerkBrowserTests) {
  const developmentEnv = readScriptEnv("development").values;
  for (const [key, value] of Object.entries(developmentEnv)) {
    process.env[key] = value;
  }
}

function definedEnv(env: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

const localE2EAuthSecret =
  process.env.E2E_LOCAL_AUTH_SECRET ?? "wavesparks-local-e2e-auth-secret";
if (!runClerkBrowserTests) {
  process.env.E2E_LOCAL_AUTH_SECRET = localE2EAuthSecret;
}
const baseEnv = definedEnv(process.env);
const webServerEnv = runClerkBrowserTests
  ? {
      ...baseEnv,
      SPACE_SCOPED_READS_ENABLED: "true",
    }
  : {
      ...baseEnv,
      CLERK_SECRET_KEY: "",
      DATABASE_URL: "",
      E2E_EMAIL_TRANSPORT: "memory",
      E2E_LOCAL_AUTH_ENABLED: "1",
      E2E_LOCAL_AUTH_SECRET: localE2EAuthSecret,
      LINK_PREVIEW_RESOLVER: "fixed",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      POST_MEDIA_STORAGE: "memory",
      RESEND_API_KEY: "re_e2e_memory_transport",
      RESEND_FROM_EMAIL: "Wavesparks E2E <noreply@example.invalid>",
      SPACE_SCOPED_READS_ENABLED: "true",
      VERCEL: "",
      VERCEL_ENV: "",
      VERCEL_PROJECT_PRODUCTION_URL: "",
      VERCEL_URL: "",
    };

if (runClerkBrowserTests) {
  const databaseName = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "")
    : "";
  if (databaseName !== "wavespark_dev") {
    throw new Error("Clerk E2E is restricted to the wavespark_dev database.");
  }
  if (
    !process.env.CLERK_SECRET_KEY?.startsWith("sk_test_") ||
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")
  ) {
    throw new Error("Clerk E2E is restricted to Clerk test-instance keys.");
  }
}

const localProjects = [
  {
    name: "local-chromium",
    testIgnore: [/clerk\.setup\.ts/, /clerk-auth\.spec\.ts/, /preview-admin\.spec\.ts/],
    use: { ...devices["Desktop Chrome"] },
  },
  {
    name: "local-mobile",
    testIgnore: [/clerk\.setup\.ts/, /clerk-auth\.spec\.ts/, /preview-admin\.spec\.ts/],
    use: { ...devices["iPhone 14"] },
  },
];

const clerkProjects = [
  {
    name: "clerk-setup",
    testMatch: /clerk\.setup\.ts/,
  },
  {
    name: "clerk-chromium",
    dependencies: ["clerk-setup"],
    testIgnore: [/clerk\.setup\.ts/, /authenticated\.spec\.ts/, /preview-admin\.spec\.ts/],
    use: { ...devices["Desktop Chrome"] },
  },
  {
    name: "clerk-mobile",
    dependencies: ["clerk-setup"],
    testIgnore: [/clerk\.setup\.ts/, /authenticated\.spec\.ts/, /preview-admin\.spec\.ts/],
    use: { ...devices["iPhone 14"] },
  },
];

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: !runClerkBrowserTests,
  workers: runClerkBrowserTests ? 1 : undefined,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: runClerkBrowserTests ? clerkProjects : localProjects,
  webServer: {
    command: "pnpm build && pnpm start",
    env: webServerEnv,
    port: 3000,
    reuseExistingServer: runClerkBrowserTests ? !process.env.CI : false,
  },
});

import { defineConfig, devices } from "@playwright/test";

function definedEnv(env: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

const runClerkBrowserTests = Boolean(process.env.CLERK_TESTING_TOKEN);
const baseEnv = definedEnv(process.env);
const webServerEnv = runClerkBrowserTests
  ? baseEnv
  : {
      ...baseEnv,
      CLERK_SECRET_KEY: "",
      DATABASE_URL: "",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
    };

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 14"] },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    env: webServerEnv,
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});

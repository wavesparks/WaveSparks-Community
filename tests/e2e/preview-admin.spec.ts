import { mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, request, test } from "@playwright/test";

const adminEmail = process.env.E2E_CLERK_ADMIN_EMAIL;
const bypassUrl = process.env.PREVIEW_BYPASS_URL;
const previewOrigin = new URL(process.env.PREVIEW_BASE_URL!).origin;
const loadReportPath = "/tmp/wavesparks-prelaunch-preview-load-report.json";

const authenticatedReadTargets = [
  {
    path: "/org/prelaunch-qa/admin/spaces/spc_prelaunch_qa_test",
    marker: "Airtable 50+10 Stability Test",
  },
  { path: "/org/prelaunch-qa/admin/profiles", marker: "Member profiles" },
  {
    path: "/org/prelaunch-qa/admin/matches?match_type=mentor_match",
    marker: "Review match suggestions",
  },
] as const;

test.beforeAll(async () => {
  await clerkSetup();
});

test.beforeEach(async ({ page }) => {
  if (bypassUrl) {
    await page.goto(bypassUrl, { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).origin).toBe(previewOrigin);
  }
  await setupClerkTestingToken({ page });
});

function writePrivateReport(reportPath: string, value: unknown) {
  const directory = mkdtempSync("/tmp/wavesparks-preview-report-");
  const temporaryPath = path.join(directory, "report.json");
  try {
    writeFileSync(temporaryPath, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
    renameSync(temporaryPath, reportPath);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

async function signInExistingAdmin(page: Parameters<typeof clerk.signIn>[0]["page"]) {
  await page.goto("/org/prelaunch-qa/admin", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/org\/prelaunch-qa\/signin/);
  await clerk.signIn({ emailAddress: adminEmail!, page });
}

test("existing test admin can inspect the isolated 50+10 QA Event", async ({ page }) => {
  test.skip(!adminEmail, "Existing Clerk test admin is not configured.");
  test.setTimeout(5 * 60_000);

  await signInExistingAdmin(page);

  await page.goto("/org/prelaunch-qa/admin/spaces/spc_prelaunch_qa_test");
  await expect(
    page.getByRole("heading", { name: "Airtable 50+10 Stability Test" }),
  ).toBeVisible();
  await expect(page.getByText("Active participants").locator("..")).toContainText("60");
  await expect(page.getByText("Profiles completed").locator("..")).toContainText("60");
  await expect(page.getByText("Preferences completed").locator("..")).toContainText("60");
  await expect(page.getByText("Ready for matching").locator("..")).toContainText("60");

  await page.goto("/org/prelaunch-qa/admin/profiles");
  await expect(page.getByRole("heading", { name: "Member profiles" })).toBeVisible();
  await expect(
    page.getByText(/^qa\.(?:participant|mentor)\.\d{2}@prelaunch-qa\.invalid$/),
  ).toHaveCount(60);
  await expect(page.locator("main")).not.toContainText("QA Participant");
  await expect(page.locator("main")).not.toContainText("QA Mentor");
  const profileInspectors = page.getByText("View complete profile", { exact: true });
  expect(await profileInspectors.count()).toBeGreaterThanOrEqual(60);
  await profileInspectors.first().click();
  await expect(page.getByRole("heading", { name: "Background and current focus" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matching intent and contribution" })).toBeVisible();

  await page.goto("/org/prelaunch-qa/admin/matches");
  const recomputeResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/org/prelaunch-qa/admin/matches",
    { timeout: 3 * 60_000 },
  );
  await page.getByRole("button", { name: "Refresh matches" }).click();
  expect((await recomputeResponse).status()).toBeLessThan(400);

  for (const matchType of [
    "mentor_match",
    "cofounder_match",
    "collaborator_match",
  ]) {
    await page.goto(`/org/prelaunch-qa/admin/matches?match_type=${matchType}`);
    await expect(
      page.getByRole("heading", { name: "Review match suggestions" }),
    ).toBeVisible();
    await expect(
      page.locator(
        `[data-testid="admin-match-card"][data-match-type="${matchType}"][data-space-id="spc_prelaunch_qa_test"]`,
      ),
    ).toHaveCount(20);
    await expect(page.locator("main")).not.toContainText("QA Participant");
    await expect(page.locator("main")).not.toContainText("No matches found");
  }
});

test("admin pages sustain 10 concurrent authenticated reads across 20 rounds", async ({
  page,
}) => {
  test.skip(!adminEmail, "Existing Clerk test admin is not configured.");
  test.setTimeout(5 * 60_000);

  await signInExistingAdmin(page);

  const storageState = await page.context().storageState();
  const authenticatedClients = await Promise.all(
    Array.from({ length: 10 }, () =>
      request.newContext({
        baseURL: previewOrigin,
        storageState,
      }),
    ),
  );

  for (const target of authenticatedReadTargets) {
    const warmup = await authenticatedClients[0].get(target.path, { failOnStatusCode: false });
    expect(warmup.status(), `Warmup failed for ${target.path}`).toBe(200);
    expect(await warmup.text(), `Warmup was not authenticated for ${target.path}`).toContain(
      target.marker,
    );
  }

  const samples: Array<{
    path: string;
    round: number;
    worker: number;
    durationMs: number;
    status: number | null;
    authenticated: boolean;
    timedOut: boolean;
    responseKind: "expected" | "sign-in" | "rate-limited" | "other" | "timeout";
  }> = [];

  try {
    for (let round = 1; round <= 20; round += 1) {
      for (const target of authenticatedReadTargets) {
        await Promise.all(
          authenticatedClients.map(async (client, workerIndex) => {
            const startedAt = performance.now();
            try {
              const response = await client.get(target.path, {
                failOnStatusCode: false,
                timeout: 15_000,
              });
              const body = await response.text();
              const authenticated = response.status() === 200 && body.includes(target.marker);
              const responseKind = authenticated
                ? "expected"
                : response.status() === 429
                  ? "rate-limited"
                  : body.includes("/signin") || body.includes("Sign in")
                    ? "sign-in"
                    : "other";
              samples.push({
                path: target.path,
                round,
                worker: workerIndex + 1,
                durationMs: performance.now() - startedAt,
                status: response.status(),
                authenticated,
                timedOut: false,
                responseKind,
              });
            } catch {
              samples.push({
                path: target.path,
                round,
                worker: workerIndex + 1,
                durationMs: performance.now() - startedAt,
                status: null,
                authenticated: false,
                timedOut: true,
                responseKind: "timeout",
              });
            }
          }),
        );
      }
    }
  } finally {
    await Promise.all(authenticatedClients.map((client) => client.dispose()));
  }

  const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
  const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
  const p95Ms = durations[p95Index] ?? 0;
  const timedOut = samples.filter((sample) => sample.timedOut).length;
  const serverErrors = samples.filter((sample) => (sample.status ?? 0) >= 500).length;
  const unauthenticated = samples.filter((sample) => !sample.authenticated).length;
  const responseBreakdown = Object.fromEntries(
    [
      ...new Set(
        samples.map((sample) =>
          JSON.stringify({
            path: sample.path,
            status: sample.status,
            responseKind: sample.responseKind,
          }),
        ),
      ),
    ].map((key) => {
      const group = JSON.parse(key) as {
        path: string;
        status: number | null;
        responseKind: string;
      };
      return [
        `${group.path} | ${group.status ?? "timeout"} | ${group.responseKind}`,
        samples.filter(
          (sample) =>
            sample.path === group.path &&
            sample.status === group.status &&
            sample.responseKind === group.responseKind,
        ).length,
      ];
    }),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    totalRequests: samples.length,
    concurrency: 10,
    rounds: 20,
    paths: authenticatedReadTargets.map((target) => target.path),
    p95Ms,
    timedOut,
    serverErrors,
    unauthenticated,
    responseBreakdown,
    passed:
      samples.length === 600 &&
      timedOut === 0 &&
      serverErrors === 0 &&
      unauthenticated === 0 &&
      p95Ms < 3_000,
  };
  writePrivateReport(loadReportPath, report);

  expect(samples).toHaveLength(600);
  expect(timedOut).toBe(0);
  expect(serverErrors).toBe(0);
  expect(unauthenticated).toBe(0);
  expect(p95Ms).toBeLessThan(3_000);
});

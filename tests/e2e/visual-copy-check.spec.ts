import { expect, test } from "@playwright/test";

const localAuthSecret = process.env.E2E_LOCAL_AUTH_SECRET;

test("renders the updated home copy without the old background block", async ({ page }, testInfo) => {
  test.skip(!localAuthSecret, "This check uses Playwright local auth.");

  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const response = await page.request.post("/api/internal/e2e-auth", {
    data: {
      email: "jules@example.com",
      name: "Jules Park",
      orgRole: "org:member",
      orgSlug: "wavesparks",
    },
    headers: { "x-e2e-auth-secret": localAuthSecret! },
  });
  expect(response.ok()).toBe(true);

  await page.goto("/org/wavesparks");
  await expect(page.getByRole("heading", { name: "Welcome back, Jules" })).toBeVisible();
  await expect(page.locator("#main-community-heading")).toHaveText("Wavesparks Community");
  await expect(page.getByRole("heading", { name: "Your events" })).toBeVisible();
  await expect(page.getByText("Main Community", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Permanent network", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.querySelector(".ws-page-shell")!, "::before").backgroundImage,
    ),
  ).not.toContain("url(");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(consoleErrors).toEqual([]);

  await page.screenshot({
    path: `/tmp/wavesparks-home-${testInfo.project.name}.png`,
    fullPage: true,
  });
});

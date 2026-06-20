import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const memberEmail = process.env.E2E_APPROVED_MEMBER_EMAIL;
const memberPassword = process.env.E2E_APPROVED_MEMBER_PASSWORD;
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const hasClerkToken = Boolean(process.env.CLERK_TESTING_TOKEN);

async function signIn(page: Page, email: string, password: string) {
  await setupClerkTestingToken({ page });
  await page.goto("/org/wavespark/signin");
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /continue|sign in/i }).click();
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /continue|sign in/i }).click();
  await page.waitForURL(/\/org\/wavespark/);
}

test.describe("authenticated member flows", () => {
  test.skip(
    !hasClerkToken || !memberEmail || !memberPassword,
    "Set CLERK_TESTING_TOKEN, E2E_APPROVED_MEMBER_EMAIL, and E2E_APPROVED_MEMBER_PASSWORD.",
  );

  test("approved members can reach people, knowledge, and matches", async ({ page }) => {
    await signIn(page, memberEmail!, memberPassword!);

    await page.goto("/org/wavespark/people");
    await expect(
      page.getByRole("heading", { name: "Search the approved founder network" }),
    ).toBeVisible();

    await page.goto("/org/wavespark/knowledge");
    await expect(
      page.getByRole("heading", { name: "Reusable advice from the community" }),
    ).toBeVisible();

    await page.goto("/org/wavespark/matches");
    await expect(
      page.getByRole("heading", { name: "AI-suggested people worth meeting" }),
    ).toBeVisible();
  });
});

test.describe("authenticated admin flows", () => {
  test.skip(
    !hasClerkToken || !adminEmail || !adminPassword,
    "Set CLERK_TESTING_TOKEN, E2E_ADMIN_EMAIL, and E2E_ADMIN_PASSWORD.",
  );

  test("admins can reach the moderation workspace", async ({ page }) => {
    await signIn(page, adminEmail!, adminPassword!);
    await page.goto("/org/wavespark/admin");
    await expect(page.getByRole("heading", { name: /admin/i })).toBeVisible();
    await page.goto("/org/wavespark/admin/members");
    await expect(page.getByRole("heading", { name: /members/i })).toBeVisible();
  });
});

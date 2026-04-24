import { test, expect } from "@playwright/test";

test("landing and sign-in surfaces load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Structured community energy")).toBeVisible();

  await page.goto("/org/wavespark/signin");
  await expect(page.getByText("Continue with")).toBeVisible();
});

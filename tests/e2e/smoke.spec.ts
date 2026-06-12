import { test, expect, type Page } from "@playwright/test";

async function signInDemo(
  page: Page,
  email: string,
  targetPath = "/org/wavespark",
) {
  await page.context().clearCookies();

  const csrfResponse = await page.request.get("/api/auth/csrf");
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
  const callbackUrl = new URL(targetPath, "http://localhost:3000").toString();

  const signInResponse = await page.request.post("/api/auth/callback/demo", {
    form: {
      email,
      csrfToken,
      callbackUrl,
      json: "true",
    },
  });

  expect(signInResponse.ok()).toBe(true);
  await page.goto(targetPath);
}

test("public forum loads without sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/org\/wavespark\/feed/);
  await expect(page.getByRole("heading", { name: "Wavespark Forum" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByText("Looking for a technical co-founder who cares about climate adaptation"),
  ).toBeVisible();
});

test("public thread is readable while interaction stays gated", async ({ page }) => {
  await page.goto("/org/wavespark/posts/pst_1");
  await expect(
    page.getByRole("heading", {
      name: "Looking for a technical co-founder who cares about climate adaptation",
    }),
  ).toBeVisible();
  await expect(page.getByText("Sign in required")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Add comment" })).toHaveCount(0);
});

test("sign-in surface loads", async ({ page }) => {
  await page.goto("/org/wavespark/signin");
  await expect(page.getByRole("heading", { name: "Enter the Wavespark application flow" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local fallback sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("demo founder lands in the feed with an activation checklist", async ({ page }) => {
  await signInDemo(page, "jules@example.com");

  await expect(page).toHaveURL(/\/org\/wavespark\/feed/);
  await expect(page.getByText("Activation")).toBeVisible();
  await expect(page.getByText(/core steps complete/)).toBeVisible();
});

test("activation status banners render on completed-action destinations", async ({ page }) => {
  await signInDemo(page, "jules@example.com", "/org/wavespark/profile?status=profile_saved");
  await expect(page.getByText("Profile saved")).toBeVisible();
  await expect(page).toHaveURL(/\/org\/wavespark\/profile$/);

  await page.goto("/org/wavespark/feed?status=post_created");
  await expect(page.getByText("Post published")).toBeVisible();
  await expect(page).toHaveURL(/\/org\/wavespark\/feed$/);

  await page.goto("/org/wavespark/requests?status=intro_requested");
  await expect(page.getByText("Intro request sent")).toBeVisible();
  await expect(page).toHaveURL(/\/org\/wavespark\/requests$/);
});

test("pending persona sees the approval timeline and profile edit CTA", async ({ page }) => {
  await signInDemo(page, "priya@example.com", "/org/wavespark/pending?status=profile_saved");

  await expect(page.getByText("Profile saved")).toBeVisible();
  await expect(page).toHaveURL(/\/org\/wavespark\/pending$/);
  await expect(page.getByRole("heading", { name: "Your application is in review" })).toBeVisible();
  await expect(page.getByText("Profile stays editable")).toBeVisible();
  await expect(page.getByText("Admin review")).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue editing your profile" })).toBeVisible();
});

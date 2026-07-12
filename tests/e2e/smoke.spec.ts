import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";

const usesClerk = process.env.E2E_AUTH_MODE === "clerk";

test.beforeAll(async () => {
  if (usesClerk) {
    await clerkSetup();
  }
});

test.beforeEach(async ({ page }) => {
  if (usesClerk) {
    await setupClerkTestingToken({ page });
  }
});

test("public forum loads without sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/org\/wavespark\/feed/);
  await expect(page.getByRole("heading", { name: "Wavespark Forum" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Unlock interaction")).toHaveCount(0);

  const forumNav = page.getByRole("navigation", { name: "Forum navigation" });
  await expect(forumNav.getByRole("link", { name: "Forum" })).toHaveAttribute(
    "href",
    "/org/wavespark/feed",
  );

  for (const label of ["People", "Knowledge", "Opportunities", "Matches", "Requests"]) {
    await expect(forumNav.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      "/org/wavespark/signin",
    );
  }

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
  await expect(page.getByRole("link", { name: "Back to forum" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Sign in to Wavespark|Clerk is not configured/ }),
  ).toBeVisible();
  await expect(page.getByText("Email sign in")).toHaveCount(0);
  await expect(page.getByText("Preview accounts use")).toHaveCount(0);
});

test("sign-up is invitation-only and exposes no account creation form", async ({ page }) => {
  await page.goto("/org/wavespark/sign-up");
  await expect(page.getByRole("heading", { name: "Join Wavespark by invitation" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Check your invitation email" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to forum" })).toBeVisible();
  await expect(page.getByLabel("Invitation code")).toHaveCount(0);
  await expect(page.getByText("Direct public registration and shared invite codes are closed")).toBeVisible();

  await page.goto("/org/wavespark/accept-invitation");
  await expect(page.getByRole("heading", { name: "Invitation link required" })).toBeVisible();
  await expect(page.getByText("Create your account")).toHaveCount(0);
});

test("anonymous protected pages redirect to sign-in", async ({ page }) => {
  await page.goto("/org/wavespark/profile?status=profile_saved");
  await expect(page).toHaveURL(/\/org\/wavespark\/signin$/);
  await expect(page.getByRole("heading", { name: "Enter the Wavespark application flow" })).toBeVisible();
});

test("public status banners render on completed-action destinations", async ({ page }) => {
  await page.goto("/org/wavespark/feed?status=post_created");
  await expect(page.getByText("Post published")).toBeVisible();
  await expect(page).toHaveURL(/\/org\/wavespark\/feed$/);
});

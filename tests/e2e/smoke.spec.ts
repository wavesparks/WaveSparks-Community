import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const usesClerk = process.env.E2E_AUTH_MODE === "clerk";
const privatePostTitle =
  "Looking for a technical co-founder who cares about climate adaptation";

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

async function expectPrivateRouteToRequireSignIn(page: Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveURL(/\/org\/wavesparks\/signin$/);
  await expect(page.getByRole("heading", { name: "Welcome to Wavesparks" })).toBeVisible();
  await expect(page.getByText(privatePostTitle, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Wavesparks Forum" })).toHaveCount(0);
  await expect(page.getByText("Post published", { exact: true })).toHaveCount(0);
}

test("anonymous root reveals no Space and redirects to sign-in", async ({ page }) => {
  await expectPrivateRouteToRequireSignIn(page, "/");
});

test("anonymous legacy feed reveals no content and redirects to sign-in", async ({ page }) => {
  await expectPrivateRouteToRequireSignIn(
    page,
    "/org/wavesparks/feed?status=post_created",
  );
});

test("anonymous direct post reveals neither its Space nor content", async ({ page }) => {
  await expectPrivateRouteToRequireSignIn(page, "/org/wavesparks/posts/pst_1");
});

test("sign-in surface explains private Space access", async ({ page }) => {
  await page.goto("/org/wavesparks/signin");
  await expect(page.getByRole("heading", { name: "Welcome to Wavesparks" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /Sign in to Wavesparks|Sign-in is temporarily unavailable/,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Sign in is required before any community content or member information is shown."),
  ).toBeVisible();
  await expect(page.getByText("Email sign in")).toHaveCount(0);
  await expect(page.getByText("Preview accounts use")).toHaveCount(0);
});

test("sign-up is invitation-only and exposes no account creation form", async ({ page }) => {
  await page.goto("/org/wavesparks/sign-up");
  await expect(page.getByRole("heading", { name: "Join Wavesparks by invitation" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Check your invitation email" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to home" })).toBeVisible();
  await expect(page.getByLabel("Invitation code")).toHaveCount(0);
  await expect(
    page.getByText("Wavesparks is invitation-only. Ask the Wavesparks team to invite your email address."),
  ).toBeVisible();

  await page.goto("/org/wavesparks/accept-invitation");
  await expect(page.getByRole("heading", { name: "Invitation link required" })).toBeVisible();
  await expect(page.getByText("Create your account")).toHaveCount(0);
});

test("anonymous account pages redirect before rendering member data", async ({ page }) => {
  await expectPrivateRouteToRequireSignIn(
    page,
    "/org/wavesparks/profile?status=profile_saved",
  );
});

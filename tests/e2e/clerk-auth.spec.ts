import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

const adminEmail = process.env.E2E_CLERK_ADMIN_EMAIL;
const memberEmail = process.env.E2E_CLERK_USER_EMAIL;

async function completeAuthHandoff(
  page: Parameters<typeof clerk.signIn>[0]["page"],
  target: RegExp,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto("/org/wavesparks/auth/complete", { waitUntil: "domcontentloaded" });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("interrupted by another navigation")) {
        throw error;
      }
    }
    try {
      await page.waitForURL(target, { timeout: 10_000 });
      return;
    } catch {
      await page.waitForLoadState("networkidle").catch(() => undefined);
    }
  }
  throw new Error(`Auth handoff did not reach ${target}. Last URL: ${page.url()}`);
}

test.beforeAll(async () => {
  await clerkSetup();
});

test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
});

test("authorizes a signed-in admin from the local Neon membership", async ({
  page,
}, testInfo) => {
  test.skip(!adminEmail, "Clerk admin test account is not configured.");
  await page.goto("/org/wavesparks/feed");
  await clerk.signIn({ emailAddress: adminEmail!, page });

  const organizationBeforeHandoff = await page.evaluate(
    () => window.Clerk.organization?.id ?? null,
  );
  await completeAuthHandoff(page, /\/org\/wavesparks(?:\/onboarding)?$/);
  await expect
    .poll(() => page.evaluate(() => window.Clerk.organization?.id ?? null))
    .toBe(organizationBeforeHandoff);

  if (testInfo.project.name === "clerk-chromium") {
    await page.waitForLoadState("networkidle");
    await page.goto("/org/wavesparks/admin/members");
    await expect(
      page.getByRole("heading", { name: "Members", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite people" })).toBeVisible();
  }
});

test("applies local account and profile gates without a Clerk Organization", async ({
  page,
}) => {
  test.skip(!memberEmail, "Clerk member test account is not configured.");
  await page.goto("/org/wavesparks/feed");
  await clerk.signIn({ emailAddress: memberEmail!, page });
  await completeAuthHandoff(
    page,
    /\/org\/wavesparks(?:\/(?:pending|onboarding))?$/,
  );

  await page.goto("/org/wavesparks/feed");
  await expect(page).toHaveURL(/\/org\/wavesparks(?:\?locked=main)?$/);
  await expect(
    page.getByText("Wavesparks Community is invitation-only."),
  ).toBeVisible();
  await page.goto("/org/wavesparks/posts/pst_1");
  await expect(page).toHaveURL(/\/org\/wavesparks(?:\?locked=main)?$/);
  await expect(page.getByText("climate adaptation")).toHaveCount(0);
  await page.goto("/org/wavesparks/people");
  await expect(page).toHaveURL(/\/org\/wavesparks(?:\?locked=main)?$/);
});

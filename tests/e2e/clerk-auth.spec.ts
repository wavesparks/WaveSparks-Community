import { createClerkClient } from "@clerk/backend";
import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

const adminEmail = process.env.E2E_CLERK_ADMIN_EMAIL;
const memberEmail = process.env.E2E_CLERK_USER_EMAIL;
const secretKey = process.env.CLERK_SECRET_KEY;
let temporaryOrganizationId: string | undefined;

async function completeAuthHandoff(
  page: Parameters<typeof clerk.signIn>[0]["page"],
  target: RegExp,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto("/org/wavespark/auth/complete", { waitUntil: "domcontentloaded" });
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

test.afterEach(async () => {
  if (!temporaryOrganizationId || !secretKey) {
    return;
  }
  const client = createClerkClient({ secretKey });
  await client.organizations.deleteOrganization(temporaryOrganizationId).catch(() => undefined);
  temporaryOrganizationId = undefined;
});

test("switches a signed-in admin from another Clerk organization into Wavespark", async ({
  page,
}, testInfo) => {
  test.skip(!adminEmail || !secretKey, "Clerk admin test account is not configured.");
  const client = createClerkClient({ secretKey });
  const [admin] = (await client.users.getUserList({ emailAddress: [adminEmail!] })).data;
  const wavespark = await client.organizations.getOrganization({ slug: "wavespark" });
  if (!admin) {
    throw new Error(`Clerk test admin ${adminEmail} was not found.`);
  }

  const suffix = `${Date.now()}-${testInfo.project.name}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const otherOrg = await client.organizations.createOrganization({
    name: `Wavespark E2E Other ${suffix}`,
    slug: `wavespark-e2e-other-${suffix}`.slice(0, 48),
  });
  temporaryOrganizationId = otherOrg.id;

  try {
    await client.organizations.createOrganizationMembership({
      organizationId: otherOrg.id,
      role: "org:member",
      userId: admin.id,
    });
    await page.goto("/org/wavespark/feed");
    await clerk.signIn({ emailAddress: adminEmail!, page });
    await page.evaluate(async (organizationId) => {
      await window.Clerk.setActive({ organization: organizationId });
    }, otherOrg.id);

    await completeAuthHandoff(page, /\/org\/wavespark\/onboarding$/);
    await expect
      .poll(() => page.evaluate(() => window.Clerk.organization?.id))
      .toBe(wavespark.id);
    await expect(
      page.getByRole("heading", { name: "Build a profile strong enough for serious intros" }),
    ).toBeVisible();

    if (testInfo.project.name === "clerk-chromium") {
      await page.waitForLoadState("networkidle");
      await page.goto("/org/wavespark/admin/members");
      await expect(
        page.getByRole("heading", { name: "Members", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Invite people" })).toBeVisible();
    }
  } finally {
    await client.organizations.deleteOrganization(otherOrg.id);
    temporaryOrganizationId = undefined;
  }
});

test("keeps a pending Clerk member on public reading while member tools stay locked", async ({
  page,
}) => {
  test.skip(!memberEmail, "Clerk member test account is not configured.");
  await page.goto("/org/wavespark/feed");
  await clerk.signIn({ emailAddress: memberEmail!, page });
  await completeAuthHandoff(page, /\/org\/wavespark\/(pending|onboarding)/);

  await page.goto("/org/wavespark/feed");
  await expect(page.getByRole("heading", { name: "Wavespark Forum" })).toBeVisible();
  await page.goto("/org/wavespark/posts/pst_1");
  await expect(
    page.getByRole("heading", {
      name: "Looking for a technical co-founder who cares about climate adaptation",
    }),
  ).toBeVisible();
  await page.goto("/org/wavespark/people");
  await expect(page).toHaveURL(/\/org\/wavespark\/(pending|onboarding)$/);
});

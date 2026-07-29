import { expect, test, type Page } from "@playwright/test";

const localAuthSecret = process.env.E2E_LOCAL_AUTH_SECRET;
const canUseLocalAuth = Boolean(
  localAuthSecret && process.env.E2E_AUTH_MODE !== "clerk",
);

async function signIn(
  page: Page,
  input: { email: string; name: string; orgRole: "org:admin" | "org:member" },
) {
  const response = await page.request.post("/api/internal/e2e-auth", {
    data: {
      ...input,
      orgSlug: "wavesparks",
    },
    headers: {
      "x-e2e-auth-secret": localAuthSecret!,
    },
  });
  expect(
    response.ok(),
    `local auth failed: ${response.status()} ${await response.text()}`,
  ).toBe(true);
}

async function discoverMainFeed(page: Page) {
  await page.goto("/org/wavesparks");
  const link = page
    .locator('a[href^="/org/wavesparks/s/"][href$="/feed"]')
    .filter({ hasText: "Wavesparks Community" })
    .first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/org\/wavesparks\/s\/[^/]+\/feed$/);
  return href!;
}

function postCard(page: Page, marker: string) {
  return page.locator(".ws-card-glow").filter({ hasText: marker }).first();
}

test.describe("admin post editing", () => {
  test.skip(!canUseLocalAuth, "This suite uses Playwright local auth.");
  test.setTimeout(60_000);

  test("an admin updates member content and classification without touching media", async ({
    page,
  }, testInfo) => {
    const suffix = `${testInfo.project.name}-${Date.now().toString(36)}`;
    const originalTitle = `Admin edit source ${suffix}`;
    const updatedTitle = `Admin edit resource ${suffix}`;
    const updatedBody = `Reviewed resource details ${suffix}`;

    await signIn(page, {
      email: "jules@example.com",
      name: "Jules Park",
      orgRole: "org:member",
    });
    const feedHref = await discoverMainFeed(page);
    await page.goto(feedHref.replace(/\/feed$/, "/compose?kind=feed"));
    await page.getByLabel("Title").fill(originalTitle);
    await page.getByLabel("Details (optional with an image)").fill(
      `Original member copy ${suffix}`,
    );
    await page.getByLabel("Roles needed").fill("legacy role");
    await page
      .getByRole("button", { name: "Publish post in Wavesparks Community" })
      .click();
    await expect(
      page.getByText("Post published in Wavesparks Community", { exact: true }),
    ).toBeVisible();

    const memberCard = postCard(page, originalTitle);
    await expect(memberCard).toBeVisible();
    const postHref = await memberCard
      .getByRole("link", { name: "Open thread", exact: true })
      .getAttribute("href");
    expect(postHref).toMatch(/^\/org\/wavesparks\/s\/[^/]+\/posts\/pst_[^/]+$/);

    await signIn(page, {
      email: "maya@wavesparks.co",
      name: "Maya Chen",
      orgRole: "org:admin",
    });
    await page.goto("/org/wavesparks/admin/posts");
    let adminCard = postCard(page, originalTitle);
    await expect(adminCard).toBeVisible();
    await adminCard.getByRole("button", { name: "Edit post" }).click();

    const dialog = page.getByRole("dialog", { name: "Edit post" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Post type").selectOption("resource");
    await expect(dialog.getByLabel("Roles needed")).toHaveCount(0);
    await dialog.getByLabel("Title").fill(updatedTitle);
    await dialog.getByLabel("Details").fill(updatedBody);
    await dialog.getByLabel("Tags").fill("operations, guide");
    await dialog.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Post content saved", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/org\/wavesparks\/admin\/posts(?:\?.*)?$/u);
    adminCard = postCard(page, updatedTitle);
    await expect(adminCard).toContainText(updatedBody);
    await expect(postCard(page, originalTitle)).toHaveCount(0);

    await signIn(page, {
      email: "jules@example.com",
      name: "Jules Park",
      orgRole: "org:member",
    });
    await page.goto(feedHref.replace(/\/feed$/, "/knowledge"));
    await expect(postCard(page, updatedTitle)).toContainText(updatedBody);
    await page.goto(postHref!);
    await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible();
    await expect(page.getByText(updatedBody, { exact: true })).toBeVisible();
  });
});

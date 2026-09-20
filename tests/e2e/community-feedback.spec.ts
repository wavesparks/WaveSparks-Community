import { expect, test, type Page } from "@playwright/test";

const secret = process.env.E2E_LOCAL_AUTH_SECRET;
async function signIn(page: Page, admin = false) {
  const response = await page.request.post("/api/internal/e2e-auth", {
    headers: { "x-e2e-auth-secret": secret! },
    data: { email: admin ? "maya@wavesparks.co" : "jules@example.com", name: admin ? "Maya Chen" : "Jules Park", orgRole: admin ? "org:admin" : "org:member", orgSlug: "wavesparks" },
  });
  expect(response.ok()).toBe(true);
}

test.describe("latest community feedback", () => {
  test.skip(!secret || process.env.E2E_AUTH_MODE === "clerk", "Uses isolated local auth and in-memory data.");
  test.setTimeout(60_000);

  test("Upload file opens the picker from either source and maps questionnaire columns", async ({ page }) => {
    await signIn(page, true);
    await page.goto("/org/wavesparks/admin/members");
    await page.getByRole("button", { name: "Invite people", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Invite people" });
    await dialog.getByRole("tab", { name: "Upload list", exact: true }).click();
    for (const paste of [false, true]) {
      if (paste) await dialog.getByRole("button", { name: "Paste list", exact: true }).click();
      const chooserPromise = page.waitForEvent("filechooser");
      await dialog.getByRole("button", { name: "Upload file", exact: true }).click();
      const chooser = await chooserPromise;
      await chooser.setFiles({ name: "profiles.csv", mimeType: "text/csv", buffer: Buffer.from("email,name,preferred_name,headline,bio,current_focus,skill_tags,seeking_match_types\nfeedback@example.com,Maya Tan,Maya,Student builder,Learning tools,EdTech,Python;Research,Collaborator") });
    }
    await dialog.getByRole("button", { name: "Choose columns", exact: true }).click();
    await expect(dialog.getByLabel("About you", { exact: true })).toHaveValue("4");
    await expect(dialog.getByLabel("Skills", { exact: true })).toHaveValue("6");
    await dialog.getByRole("button", { name: "Review people", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Invite 1 person", exact: true })).toBeVisible();
    await expect(dialog.getByText(/Profile details fill empty fields only/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("saving an explicit unmatched request immediately replaces previous suggestions", async ({ page }) => {
    await signIn(page);
    await page.goto("/org/wavesparks");
    const feed = await page.locator('a[href^="/org/wavesparks/s/"][href$="/feed"]').filter({ hasText: "Wavesparks Community" }).first().getAttribute("href");
    expect(feed).toBeTruthy();
    await page.goto(feed!.replace(/\/feed$/, "/matches"));
    const goal = page.getByLabel("What are you working toward here?");
    const before = await goal.inputValue();
    await goal.fill("Find people with qzxnonexistentskill experience");
    await page.getByRole("button", { name: "Save matching preferences" }).click();
    await expect(page.getByText("Preferences saved", { exact: true })).toBeVisible();
    await expect(page.getByText("No matches for your current preferences", { exact: true })).toBeVisible();
    await expect(page.getByRole("meter", { name: "Match score" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("meter", { name: "Match score" })).toHaveCount(0);
    await goal.fill(before);
    await page.getByRole("button", { name: "Save matching preferences" }).click();
    await expect(page.getByText("Preferences saved", { exact: true })).toBeVisible();
    const scores = page.getByRole("meter", { name: "Match score" });
    if (await scores.count()) await expect(scores.first()).toContainText(/\d+% match/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

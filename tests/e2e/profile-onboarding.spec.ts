import { expect, test } from "@playwright/test";

const localAuthSecret = process.env.E2E_LOCAL_AUTH_SECRET;

test("keeps personal profile questions inclusive and interest-led", async ({ page }) => {
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

  await page.goto("/org/wavesparks/onboarding");
  await expect(page.getByLabel(/About you/i)).toBeVisible();
  await expect(page.getByText(/your background, community, or the perspective you bring/i))
    .toBeVisible();
  await expect(page.getByLabel("Short bio")).toHaveCount(0);
  await expect(page.getByLabel("Long bio")).toHaveCount(0);

  const linkedin = page.getByLabel("LinkedIn");
  await linkedin.fill("ftp://example.com/profile");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Links must use http:// or https://.")).toBeVisible();
  await expect(linkedin).toBeFocused();
  await linkedin.fill("");

  await page.getByRole("button", { name: /Step 2.*Interests & experience/i }).click();
  await expect(
    page.getByLabel(/problem, topic, or opportunity you’re especially interested in/i),
  ).toBeVisible();
  await expect(
    page.getByLabel(/experience do you have with coding, software development/i),
  ).toBeVisible();
  await expect(page.getByLabel("Technical or product experience level")).toContainText(
    "New to this",
  );
  await expect(page.getByLabel("Years of experience")).toHaveCount(0);
  await expect(page.getByText("Traction summary")).toHaveCount(0);

  await page.getByRole("button", { name: /Step 4.*Contact & preferences/i }).click();
  await expect(page.getByLabel(/Email for accepted introductions/i)).toBeVisible();
  const mentoringDetails = page.locator("#mentoring_details");
  await mentoringDetails.getByText("Mentoring details (optional)").click();
  await page.getByLabel("Maximum number of mentees").fill("101");
  await mentoringDetails.getByText("Mentoring details (optional)").click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(mentoringDetails).toHaveAttribute("open", "");
  await expect(page.getByLabel("Maximum number of mentees")).toBeFocused();
  await expect(page.getByLabel("Ambition level (1-5)")).toHaveCount(0);
  await expect(page.getByLabel("Risk tolerance (1-5)")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

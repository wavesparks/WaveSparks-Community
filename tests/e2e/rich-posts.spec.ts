import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

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

function adminImageTile(card: Locator, alt: string) {
  return card.locator(`img[alt="${alt}"]`).locator("xpath=../..");
}

function adminPreviewTile(card: Locator) {
  return card
    .getByText(/^Link preview · example\.com$/)
    .locator("xpath=../..");
}

async function fillHydratedTextarea(
  page: Page,
  textarea: Locator,
  value: string,
  maximum: number,
) {
  await expect(async () => {
    // A fast mobile run can fill server-rendered HTML before React attaches its
    // change handler. Clearing first makes a retry dispatch a fresh input event.
    await textarea.fill("");
    await textarea.fill(value);
    await expect(
      page.getByLabel(`${value.length} of ${maximum} characters`),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

test.describe("rich post lifecycle", () => {
  test.skip(!canUseLocalAuth, "This suite uses Playwright local auth.");
  test.setTimeout(90_000);

  test("publishes, renders, notifies, and moderates rich post content", async ({
    page,
  }, testInfo) => {
    const suffix = `${testInfo.project.name}-${Date.now().toString(36)}`;
    const postMarker = `Rich post E2E ${suffix}`;
    const commentMarker = `Rich comment E2E ${suffix}`;
    const externalUrl = `https://example.com/wavesparks-${suffix}`;
    const firstAlt = `E2E rich image first ${suffix}`;
    const secondAlt = `E2E rich image second ${suffix}`;
    const [firstImage, secondImage] = await Promise.all([
      sharp({
        create: {
          background: { alpha: 1, b: 224, g: 89, r: 47 },
          channels: 4,
          height: 8,
          width: 8,
        },
      })
        .png()
        .toBuffer(),
      sharp({
        create: {
          background: { alpha: 1, b: 66, g: 184, r: 244 },
          channels: 4,
          height: 8,
          width: 8,
        },
      })
        .png()
        .toBuffer(),
    ]);

    await signIn(page, {
      email: "jules@example.com",
      name: "Jules Park",
      orgRole: "org:member",
    });
    const feedHref = await discoverMainFeed(page);
    const composeHref = feedHref.replace(/\/feed$/, "/compose?kind=feed");
    await page.goto(composeHref);

    await expect(page.getByLabel("Title")).not.toHaveAttribute("required", "");
    const body = page.getByLabel("Details (optional with an image)");
    await fillHydratedTextarea(
      page,
      body,
      `${postMarker}\nVisit ${externalUrl}\n@Rhe`,
      10_000,
    );
    await expect(page.getByRole("option", { name: /Rhea/u })).toBeVisible();
    await body.press("Enter");
    await expect(body).toHaveValue(`${postMarker}\nVisit ${externalUrl}\n@Rhea `);

    await page.locator("#post-image-files").setInputFiles([
      { buffer: firstImage, mimeType: "image/png", name: "first.png" },
      { buffer: secondImage, mimeType: "image/png", name: "second.png" },
    ]);
    await expect(page.getByText("Ready", { exact: true })).toHaveCount(2);

    const altInputs = page.locator('input[id^="post-image-alt-"]');
    await altInputs.nth(0).fill(firstAlt);
    await altInputs.nth(1).fill(secondAlt);
    await page.getByRole("button", { name: "Move image 2 left" }).click();
    await expect(altInputs.nth(0)).toHaveValue(secondAlt);
    await expect(altInputs.nth(1)).toHaveValue(firstAlt);

    await expect(page.getByText("Preview for example.com", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Hide", exact: true }).click();
    await expect(page.getByText("Link preview hidden.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Show preview", exact: true }).click();
    await expect(page.getByText("Preview for example.com", { exact: true })).toBeVisible();

    const publish = page.getByRole("button", {
      name: "Publish post in Wavesparks Community",
    });
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(
      page.getByText("Post published in Wavesparks Community", { exact: true }),
    ).toBeVisible();

    let card = postCard(page, postMarker);
    await expect(card).toBeVisible();
    await expect(card.getByRole("link", { name: externalUrl })).toHaveAttribute(
      "rel",
      "noopener noreferrer nofollow ugc",
    );
    await expect(card.getByRole("link", { name: "@Rhea", exact: true })).toHaveAttribute(
      "href",
      /\/people\/mem_rhea$/,
    );
    await expect(card.getByText("Preview for example.com", { exact: true })).toBeVisible();
    await expect(card.locator(`img[alt="${secondAlt}"]`)).toBeVisible();
    await expect(card.locator(`img[alt="${firstAlt}"]`)).toBeVisible();
    expect(
      await card
        .locator('img[alt^="E2E rich image"]')
        .evaluateAll((images) => images.map((image) => image.getAttribute("alt"))),
    ).toEqual([secondAlt, firstAlt]);
    const firstImagePreview = card.getByRole("button", {
      name: `Open image 1 of 2: ${secondAlt}`,
    });
    const previewBounds = await firstImagePreview.boundingBox();
    expect(previewBounds).not.toBeNull();
    expect(previewBounds!.height).toBeLessThanOrEqual(160);
    await firstImagePreview.click();
    const imageDialog = page.getByRole("dialog", { name: "Image preview" });
    await expect(imageDialog).toBeVisible();
    await expect(imageDialog.getByRole("img", { name: secondAlt })).toBeVisible();
    await imageDialog.getByRole("button", { name: "Next image" }).click();
    await expect(imageDialog.getByRole("img", { name: firstAlt })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(imageDialog).not.toBeVisible();
    await expect(firstImagePreview).toBeFocused();

    const postHref = await card
      .getByRole("link", { name: "Open thread", exact: true })
      .getAttribute("href");
    expect(postHref).toMatch(/^\/org\/wavesparks\/s\/[^/]+\/posts\/pst_[^/]+$/);
    await page.goto(postHref!);

    const comment = page.getByLabel("Comment");
    await fillHydratedTextarea(page, comment, commentMarker, 2_000);
    await comment.fill(`${commentMarker} @Rhe`);
    await expect(page.getByRole("option", { name: /Rhea/u })).toBeVisible();
    await comment.press("Enter");
    const selectedComment = `${commentMarker} @Rhea `;
    await expect(comment).toHaveValue(selectedComment);
    await comment.evaluate((element) => {
      if (!(element instanceof HTMLTextAreaElement)) return;
      element.setSelectionRange(element.value.length, element.value.length);
    });
    await page.keyboard.insertText("See www.example.org/docs");
    await expect(comment).toHaveValue(
      `${selectedComment}See www.example.org/docs`,
    );
    await page.getByRole("button", { name: "Add comment", exact: true }).click();
    await expect(page.getByText("Comment added", { exact: true })).toBeVisible();

    const commentCard = page.locator('[id^="comment-"]').filter({ hasText: commentMarker });
    await expect(commentCard).toBeVisible();
    await expect(
      commentCard.getByRole("link", { name: "@Rhea", exact: true }),
    ).toHaveAttribute("href", /\/people\/mem_rhea$/);
    await expect(
      commentCard.getByRole("link", { name: "www.example.org/docs", exact: true }),
    ).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
    const commentId = await commentCard.getAttribute("id");
    expect(commentId).toMatch(/^comment-cmt_/);

    await signIn(page, {
      email: "rhea@example.com",
      name: "Rhea Santos",
      orgRole: "org:member",
    });
    await page.goto("/org/wavesparks/requests");
    const commentNotificationHref = `${postHref}#${commentId}`;
    const commentNotification = page.locator(`a[href="${commentNotificationHref}"]`);
    await expect(commentNotification).toBeVisible();
    await commentNotification.click();
    await expect(page).toHaveURL(new RegExp(`#${commentId}$`));
    await expect(page.locator(`#${commentId}`)).toContainText(commentMarker);

    await signIn(page, {
      email: "avery@wavesparks.co",
      name: "Avery Tan",
      orgRole: "org:admin",
    });
    await page.goto("/org/wavesparks/admin/posts");
    card = postCard(page, postMarker);
    await expect(card).toBeVisible();
    await expect(card.getByText("@Rhea · Rhea", { exact: true })).toBeVisible();

    let imageTile = adminImageTile(card, secondAlt);
    await imageTile.getByRole("button", { name: "Remove", exact: true }).click();
    card = postCard(page, postMarker);
    imageTile = adminImageTile(card, secondAlt);
    await expect(imageTile.getByText("removed", { exact: true })).toBeVisible();
    await expect(imageTile.getByRole("button", { name: "Restore", exact: true })).toBeVisible();

    let previewTile = adminPreviewTile(card);
    await previewTile.getByRole("button", { name: "Remove", exact: true }).click();
    card = postCard(page, postMarker);
    previewTile = adminPreviewTile(card);
    await expect(previewTile.getByText("removed", { exact: true })).toBeVisible();

    await signIn(page, {
      email: "jules@example.com",
      name: "Jules Park",
      orgRole: "org:member",
    });
    await page.goto(postHref!);
    await expect(page.locator(`img[alt="${secondAlt}"]`)).toHaveCount(0);
    await expect(page.locator(`img[alt="${firstAlt}"]`)).toBeVisible();
    await expect(page.getByText("Preview for example.com", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: externalUrl })).toBeVisible();

    await signIn(page, {
      email: "avery@wavesparks.co",
      name: "Avery Tan",
      orgRole: "org:admin",
    });
    await page.goto("/org/wavesparks/admin/posts");
    card = postCard(page, postMarker);
    await adminImageTile(card, secondAlt)
      .getByRole("button", { name: "Restore", exact: true })
      .click();
    card = postCard(page, postMarker);
    await expect(
      adminImageTile(card, secondAlt).getByText("visible", { exact: true }),
    ).toBeVisible();
    await adminPreviewTile(card)
      .getByRole("button", { name: "Restore", exact: true })
      .click();
    card = postCard(page, postMarker);
    await expect(
      adminPreviewTile(card).getByText("visible", { exact: true }),
    ).toBeVisible();

    await signIn(page, {
      email: "jules@example.com",
      name: "Jules Park",
      orgRole: "org:member",
    });
    await page.goto(postHref!);
    await expect(page.locator(`img[alt="${secondAlt}"]`)).toBeVisible();
    await expect(page.locator(`img[alt="${firstAlt}"]`)).toBeVisible();
    await expect(page.getByText("Preview for example.com", { exact: true })).toBeVisible();

    const knowledgeMarker = `Rich resource E2E ${suffix}`;
    const knowledgeUrl = `https://example.com/resource-${suffix}`;
    await page.goto(feedHref.replace(/\/feed$/, "/compose?kind=feed&type=resource"));
    await page.getByLabel("Title").fill(knowledgeMarker);
    await fillHydratedTextarea(
      page,
      page.getByLabel("Details (optional with an image)"),
      `Reference material: ${knowledgeUrl}`,
      10_000,
    );
    await expect(page.getByText("Preview for example.com", { exact: true })).toBeVisible();
    const knowledgeTitle = page.getByLabel("Title");
    await knowledgeTitle.fill(knowledgeMarker);
    await expect(knowledgeTitle).toHaveValue(knowledgeMarker);
    const publishKnowledge = page.getByRole("button", {
      name: "Publish post in Wavesparks Community",
    });
    await expect(publishKnowledge).toBeEnabled();
    await publishKnowledge.click();
    await expect(page.getByText("Post published in Wavesparks Community", { exact: true })).toBeVisible();
    const knowledgeCard = postCard(page, knowledgeMarker);
    await expect(knowledgeCard).toBeVisible();
    await expect(knowledgeCard.getByRole("link", { name: knowledgeUrl })).toBeVisible();
    await expect(
      knowledgeCard.getByText("Preview for example.com", { exact: true }),
    ).toBeVisible();

    const opportunityMarker = `Rich opportunity E2E ${suffix}`;
    const opportunityUrl = `https://example.com/opportunity-${suffix}`;
    await page.goto(feedHref.replace(/\/feed$/, "/compose?kind=opportunity"));
    await page.getByLabel("Title").fill(opportunityMarker);
    await fillHydratedTextarea(
      page,
      page.getByLabel("Details (optional with an image)"),
      `Member opportunity: ${opportunityUrl}`,
      10_000,
    );
    await expect(page.getByText("Preview for example.com", { exact: true })).toBeVisible();
    const opportunityTitle = page.getByLabel("Title");
    await opportunityTitle.fill(opportunityMarker);
    await expect(opportunityTitle).toHaveValue(opportunityMarker);
    const publishOpportunity = page.getByRole("button", {
      name: "Publish opportunity in Wavesparks Community",
    });
    await expect(publishOpportunity).toBeEnabled();
    await publishOpportunity.click();
    await expect(page).toHaveURL(/\/opportunities\?source=member$/u);
    await expect(page.getByText("Post published in Wavesparks Community", { exact: true })).toBeVisible();
    const opportunityCard = postCard(page, opportunityMarker);
    await expect(opportunityCard).toBeVisible();
    await expect(
      opportunityCard.getByRole("link", { name: opportunityUrl }),
    ).toBeVisible();
    await expect(
      opportunityCard.getByText("Preview for example.com", { exact: true }),
    ).toBeVisible();
  });
});

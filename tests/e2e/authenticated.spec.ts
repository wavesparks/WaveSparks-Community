import { expect, test, type Page } from "@playwright/test";

const localAuthSecret = process.env.E2E_LOCAL_AUTH_SECRET;
const canUseLocalAuth = Boolean(localAuthSecret && process.env.E2E_AUTH_MODE !== "clerk");
const privatePostTitle =
  "Looking for a technical co-founder who cares about climate adaptation";

async function signInWithLocalAuth(
  page: Page,
  input: { email: string; name: string; orgRole: "org:admin" | "org:member" },
) {
  const response = await page.request.post("/api/internal/e2e-auth", {
    data: {
      email: input.email,
      name: input.name,
      orgRole: input.orgRole,
      orgSlug: "wavesparks",
    },
    headers: {
      "x-e2e-auth-secret": localAuthSecret!,
    },
  });
  expect(response.ok(), `local auth failed: ${response.status()} ${await response.text()}`).toBe(
    true,
  );
}

async function signInMember(page: Page) {
  await signInWithLocalAuth(page, {
    email: "jules@example.com",
    name: "Jules Park",
    orgRole: "org:member",
  });
}

async function signInAdmin(page: Page) {
  await signInWithLocalAuth(page, {
    email: "avery@wavesparks.co",
    name: "Avery Tan",
    orgRole: "org:admin",
  });
}

async function signInApprovedMentor(page: Page) {
  await signInWithLocalAuth(page, {
    email: "marcus@example.com",
    name: "Marcus Vale",
    orgRole: "org:member",
  });
}

async function signInAdminWithoutMentor(page: Page) {
  await signInWithLocalAuth(page, {
    email: "maya@wavesparks.co",
    name: "Maya Chen",
    orgRole: "org:admin",
  });
}

async function signInWithoutMainAccess(page: Page) {
  await signInWithLocalAuth(page, {
    email: "priya@example.com",
    name: "Priya Desai",
    orgRole: "org:member",
  });
}

async function openMySpacesAndDiscoverMainFeed(page: Page) {
  await page.goto("/org/wavesparks");
  await expect(page.getByRole("heading", { name: /^Welcome back,/ })).toBeVisible();
  await expect(
    page.getByText(
      "Wavesparks Community and your events each have their own people, conversations and matches.",
    ),
  ).toBeVisible();

  const mainSpaceLink = page
    .locator('a[href^="/org/wavesparks/s/"][href$="/feed"]')
    .filter({ hasText: "Wavesparks Community" })
    .first();
  await expect(mainSpaceLink).toBeVisible();
  const href = await mainSpaceLink.getAttribute("href");
  expect(href).toMatch(/^\/org\/wavesparks\/s\/[^/]+\/feed$/);
  return href!;
}

function sectionHref(mainFeedHref: string, section: string) {
  return mainFeedHref.replace(/\/feed$/, `/${section}`);
}

async function createEvent(
  page: Page,
  input: { eventLabel: string; name: string; description?: string },
) {
  await page.goto("/org/wavesparks/admin/spaces");
  await expect(
    page.getByRole("heading", { name: "Community & Events", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New Event" }).click();

  const dialog = page.getByRole("dialog", { name: "Create Event" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Event name").fill(input.name);
  await dialog.getByLabel("Short label").fill(input.eventLabel);
  await dialog.getByLabel("Availability").selectOption("active");
  if (input.description) {
    await dialog.getByLabel("Description").fill(input.description);
  }
  await dialog.getByRole("button", { name: "Create Event" }).click();

  await expect(page.getByRole("heading", { name: input.name })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("status").getByText("Event created")).toBeVisible();
  await expect(
    page.locator("#settings").getByText("Active Event", { exact: true }),
  ).toBeVisible();
}

async function invitePastedListToCurrentEvent(
  page: Page,
  input: { email: string; name: string },
) {
  await page.getByRole("button", { name: "Add participants" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite people" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Upload list" }).click();
  await dialog.getByRole("button", { name: "Paste list" }).click();
  await dialog
    .getByLabel("Paste email and name")
    .fill(`email,name\n${input.email},${input.name}`);
  await dialog.getByRole("button", { name: "Choose columns" }).click();

  await dialog.getByLabel("Email column").selectOption({ label: "email" });
  await dialog.getByLabel("Name column (optional)").selectOption({ label: "name" });
  await expect(dialog.locator("#member-import-access")).toHaveValue("active");
  await expect(dialog.locator("#member-import-space")).not.toHaveValue("");
  await dialog.getByRole("button", { name: "Review people" }).click();

  await expect(dialog.getByText("Ready to invite", { exact: true }).first()).toBeVisible();
  await expect(dialog.locator('[id^="member-import-email-"]').first()).toHaveValue(input.email);
  await dialog.getByRole("button", { name: "Invite 1 person" }).click();

  await expect(
    dialog.getByRole("status").getByText("Invitation sent"),
  ).toBeVisible();
  await expect(dialog.getByText("Invitation sent", { exact: true })).toBeVisible();
  await expect(dialog.getByText(input.email, { exact: true })).toBeVisible();
  await expect(dialog.getByText(/^Invitation sent\. Access to .+ added\.$/)).toBeVisible();
}

test.describe("authenticated member Space flows", () => {
  test.skip(!canUseLocalAuth, "This suite uses Playwright local auth.");

  test("member opens the community and its sections", async ({ page }) => {
    await signInMember(page);
    const mainFeedHref = await openMySpacesAndDiscoverMainFeed(page);

    await page.goto(mainFeedHref);
    await expect(
      page.getByRole("heading", { name: "Updates from Wavesparks Community" }),
    ).toBeVisible();
    const spaceSwitcher = page.locator("header details").first();
    await spaceSwitcher.locator("summary").click();
    const switcherMenu = spaceSwitcher.locator(":scope > div").first();
    await expect(switcherMenu).toBeVisible();
    const switcherWinsHitTesting = await switcherMenu.evaluate((menu) => {
      const bounds = menu.getBoundingClientRect();
      const hit = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      return Boolean(hit && menu.contains(hit));
    });
    expect(switcherWinsHitTesting).toBe(true);
    const switcherBounds = await switcherMenu.boundingBox();
    expect(switcherBounds).not.toBeNull();
    expect(switcherBounds!.x).toBeGreaterThanOrEqual(0);
    expect(switcherBounds!.x + switcherBounds!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    await page.keyboard.press("Escape");
    await expect(switcherMenu).toBeHidden();
    await expect(spaceSwitcher.locator("summary")).toBeFocused();
    await spaceSwitcher.locator("summary").click();
    await page.getByRole("heading", { name: "Updates from Wavesparks Community" }).click();
    await expect(switcherMenu).toBeHidden();
    await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
    await expect(page.getByText(privatePostTitle, { exact: true })).toBeVisible();
    const privatePostHref = await page
      .getByRole("link", { name: privatePostTitle })
      .getAttribute("href");
    expect(privatePostHref).toMatch(/^\/org\/wavesparks\/s\/[^/]+\/posts\/[^/]+$/);

    await page.goto(privatePostHref!);
    await expect(page.getByRole("heading", { name: privatePostTitle })).toBeVisible();
    await expect(page.getByText("Post details", { exact: true })).toBeVisible();

    await page.goto(sectionHref(mainFeedHref, "people"));
    await expect(
      page.getByRole("heading", { name: "People in Wavesparks Community" }),
    ).toBeVisible();

    await page.goto(sectionHref(mainFeedHref, "knowledge"));
    await expect(
      page.getByRole("heading", { name: "Knowledge in Wavesparks Community" }),
    ).toBeVisible();

    await page.goto(sectionHref(mainFeedHref, "matches"));
    await expect(
      page.getByRole("heading", { name: "People to meet in Wavesparks Community" }),
    ).toBeVisible();
    await expect(
      page.getByText("Only members in Wavesparks Community", { exact: true }),
    ).toBeVisible();
    const firstMatchScore = page.getByRole("meter", { name: "Match score" }).first();
    await expect(firstMatchScore).toBeVisible();
    await expect(firstMatchScore).toHaveText(/^\d{1,3}\/100 match$/);
    const displayedScore = Number((await firstMatchScore.textContent())?.split("/")[0]);
    expect(displayedScore).toBeGreaterThanOrEqual(1);
    expect(displayedScore).toBeLessThanOrEqual(100);
    await expect(firstMatchScore).toHaveAttribute("aria-valuemin", "1");
    await expect(firstMatchScore).toHaveAttribute("aria-valuemax", "100");
    await expect(firstMatchScore).toHaveAttribute("aria-valuenow", String(displayedScore));
    await expect(firstMatchScore).toHaveAttribute(
      "aria-valuetext",
      `${displayedScore} out of 100`,
    );
    await expect(page.getByText("Possible match", { exact: true })).toHaveCount(0);

    await page.goto(sectionHref(mainFeedHref, "opportunities"));
    await expect(
      page.getByRole("heading", { name: "Opportunities in Wavesparks Community" }),
    ).toBeVisible();

    await page.goto(sectionHref(mainFeedHref, "compose"));
    await expect(
      page.getByRole("heading", { name: "Post in Wavesparks Community" }),
    ).toBeVisible();

    await page.goto(sectionHref(mainFeedHref, "requests"));
    await expect(
      page.getByRole("heading", { name: "Introductions in Wavesparks Community" }),
    ).toBeVisible();

    await page.goto("/org/wavesparks/requests");
    await expect(
      page.getByRole("heading", { name: "Introductions and notifications" }),
    ).toBeVisible();
    await expect(
      page.getByText("Wavesparks Community", { exact: true }).first(),
    ).toBeVisible();
  });

  test("member without community access sees an invitation-only card", async ({ page }) => {
    await signInWithoutMainAccess(page);
    await page.goto("/org/wavesparks");

    await expect(page.getByRole("heading", { name: "Welcome back, Priya" })).toBeVisible();
    await expect(page.getByText("Invitation only", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Wavesparks Community is invitation-only. Joining an event won’t add you automatically.",
      ),
    ).toBeVisible();
    await expect(
      page
        .locator('a[href^="/org/wavesparks/s/"][href$="/feed"]')
        .filter({ hasText: "Wavesparks Community" }),
    ).toHaveCount(0);

    await page.goto("/org/wavesparks/feed");
    await expect(page).toHaveURL(/\/org\/wavesparks\/?$/);
    await expect(page.getByText(privatePostTitle, { exact: true })).toHaveCount(0);

    await page.goto("/org/wavesparks/posts/pst_1");
    await expect(page).toHaveURL(/\/org\/wavesparks(?:\?locked=main)?$/);
    await expect(page.getByText("Invitation only", { exact: true })).toBeVisible();
    await expect(page.getByText(privatePostTitle, { exact: true })).toHaveCount(0);
  });
});

test.describe("authenticated admin Space flows", () => {
  test.skip(!canUseLocalAuth, "This suite uses Playwright local auth.");

  test("admin reaches Community & Events and member management", async ({ page }) => {
    await signInAdmin(page);
    const mainFeedHref = await openMySpacesAndDiscoverMainFeed(page);
    await page.goto(mainFeedHref);
    await expect(
      page.getByRole("heading", { name: "Updates from Wavesparks Community" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();

    await page.goto("/org/wavesparks/admin");
    await expect(page.getByRole("heading", { name: "Community overview" })).toBeVisible();

    await page.goto("/org/wavesparks/admin/spaces");
    await expect(
      page.getByRole("heading", { name: "Community & Events", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "New Event" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
    await expect(
      page
        .getByLabel("Members, community, and Events")
        .getByRole("link", { name: "Community & Events", exact: true }),
    ).toHaveAttribute("aria-current", "page");

    await page.goto("/org/wavesparks/admin/members");
    await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite people" })).toBeVisible();
    await expect(page.getByLabel("Name or email")).toBeVisible();
    await expect(page.locator("#member-access")).toBeVisible();
    await expect(page.locator("#member-invitation")).toBeVisible();
    await expect(page.locator("#member-space")).toBeVisible();

    await page.getByLabel("Name or email").fill("jules@example.com");
    await page.locator("#member-access").selectOption("connected");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/search=jules%40example\.com/);
    await expect(page).toHaveURL(/account=connected/);
    await expect(
      page.locator(".ws-card-glow").filter({ hasText: "jules@example.com" }).first(),
    ).toBeVisible();
  });

  test("admin creates an isolated Event and invites its participant list", async ({ page }) => {
    await signInAdmin(page);
    const suffix = Date.now();
    const eventName = `E2E Event ${suffix}`;
    const participantEmail = `e2e.event.${suffix}@example.com`;

    await createEvent(page, {
      eventLabel: "Playwright validation",
      name: eventName,
      description: "An isolated Event created by Playwright local auth.",
    });
    await invitePastedListToCurrentEvent(page, {
      email: participantEmail,
      name: "E2E Event Participant",
    });
  });

  test.fixme(
    "accepting a new Event-only invitation and later adding it to Main requires the Clerk E2E fixture",
    async () => {},
  );
});

test.describe("account permissions and mentor designation combinations", () => {
  test.skip(!canUseLocalAuth, "This suite uses Playwright local auth.");

  test("Member has neither Admin nor Mentoring access", async ({ page }) => {
    await signInMember(page);
    await page.goto("/org/wavesparks/mentoring");
    await expect(page).toHaveURL(/\/org\/wavesparks\/?$/);
    await page.goto("/org/wavesparks/admin");
    await expect(page).toHaveURL(/\/org\/wavesparks\/?$/);
  });

  test("Approved Mentor has Mentoring but no Admin access", async ({ page }) => {
    await signInApprovedMentor(page);
    const mainFeedHref = await openMySpacesAndDiscoverMainFeed(page);
    await expect(page.getByRole("link", { name: "Mentoring" })).toBeVisible();
    await page.goto(mainFeedHref);
    await expect(page.getByRole("link", { name: "Mentoring" })).toBeVisible();
    await page.goto("/org/wavesparks/mentoring");
    await expect(page.getByRole("heading", { name: "Mentoring", exact: true })).toBeVisible();
    await page.goto("/org/wavesparks/admin");
    await expect(page).toHaveURL(/\/org\/wavesparks\/?$/);
  });

  test("Administrator without mentor approval has Admin but no Mentoring access", async ({
    page,
  }) => {
    await signInAdminWithoutMentor(page);
    await page.goto("/org/wavesparks/admin");
    await expect(page.getByRole("heading", { name: "Community overview" })).toBeVisible();
    await page.goto("/org/wavesparks/mentoring");
    await expect(page).toHaveURL(/\/org\/wavesparks\/?$/);
  });

  test("Administrator plus Approved Mentor has both access paths", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/org/wavesparks/admin");
    await expect(page.getByRole("heading", { name: "Community overview" })).toBeVisible();
    await page.goto("/org/wavesparks/mentoring");
    await expect(page.getByRole("heading", { name: "Mentoring", exact: true })).toBeVisible();
  });
});

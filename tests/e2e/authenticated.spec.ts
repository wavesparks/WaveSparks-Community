import { expect, test, type Page } from "@playwright/test";

const localAuthSecret = process.env.E2E_LOCAL_AUTH_SECRET;
const canUseLocalAuth = Boolean(localAuthSecret && process.env.E2E_AUTH_MODE !== "clerk");

async function signInWithLocalAuth(
  page: Page,
  input: { email: string; name: string; orgRole: "org:admin" | "org:member" },
) {
  const response = await page.request.post("/api/internal/e2e-auth", {
    data: {
      email: input.email,
      name: input.name,
      orgRole: input.orgRole,
      orgSlug: "wavespark",
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
    email: "avery@wavespark.co",
    name: "Avery Tan",
    orgRole: "org:admin",
  });
}

async function signInPendingMember(page: Page) {
  await signInWithLocalAuth(page, {
    email: "priya@example.com",
    name: "Priya Desai",
    orgRole: "org:member",
  });
}

test.describe("authenticated member flows", () => {
  test.skip(
    !canUseLocalAuth,
    "This suite uses Playwright local auth.",
  );

  test("approved members can reach people, knowledge, and matches", async ({ page }) => {
    await signInMember(page);

    await page.goto("/org/wavespark/people");
    await expect(
      page.getByRole("heading", { name: "Search the approved founder network" }),
    ).toBeVisible();

    await page.goto("/org/wavespark/knowledge");
    await expect(
      page.getByRole("heading", { name: "Reusable advice from the community" }),
    ).toBeVisible();

    await page.goto("/org/wavespark/matches");
    await expect(
      page.getByRole("heading", { name: "AI-suggested people worth meeting" }),
    ).toBeVisible();
  });

  test("pending members can read public threads but cannot enter member tools", async ({ page }) => {
    await signInPendingMember(page);

    await page.goto("/org/wavespark/feed");
    await expect(page).toHaveURL(/\/org\/wavespark\/feed$/);
    await expect(page.getByRole("heading", { name: "Wavespark Forum" })).toBeVisible();

    await page.goto("/org/wavespark/posts/pst_1");
    await expect(page).toHaveURL(/\/org\/wavespark\/posts\/pst_1$/);
    await expect(
      page.getByRole("heading", {
        name: "Looking for a technical co-founder who cares about climate adaptation",
      }),
    ).toBeVisible();

    await page.goto("/org/wavespark/people");
    await expect(page).toHaveURL(/\/org\/wavespark\/pending$/);
    await expect(page.getByRole("heading", { name: "Your application is in review" })).toBeVisible();
  });
});

test.describe("authenticated admin flows", () => {
  test.skip(
    !canUseLocalAuth,
    "This suite uses Playwright local auth.",
  );

  test("admins can reach the moderation workspace", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/org/wavespark/admin");
    await expect(page.getByRole("heading", { name: "Community command center" })).toBeVisible();
    await page.goto("/org/wavespark/admin/cohorts");
    await expect(page.getByRole("heading", { name: "Event cohort pools" })).toBeVisible();
    await page.goto("/org/wavespark/admin/members");
    await expect(
      page.getByRole("heading", { name: "Accounts and membership states" }),
    ).toBeVisible();
    await expect(page.getByText("jules@example.com")).toBeVisible();
  });

  test("admins can create, import, and promote a cohort", async ({ page }) => {
    test.skip(!canUseLocalAuth, "Cohort mutation browser flow uses local auth without Clerk.");
    await signInAdmin(page);
    const suffix = Date.now();
    const cohortName = `E2E Cohort ${suffix}`;
    const studentEmail = `e2e.cohort.${suffix}@example.com`;

    await page.goto("/org/wavespark/admin/cohorts");
    await page.getByLabel("Name").fill(cohortName);
    await page.getByLabel("Event label").fill("E2E Event");
    await page.getByLabel("Notes").fill("Created by Playwright local auth.");
    await page.getByRole("button", { name: "Create cohort" }).click();
    await expect(page.getByRole("heading", { name: cohortName })).toBeVisible();
    await expect(page.getByText("Cohort created")).toBeVisible();

    await page.getByPlaceholder("email,name\nstudent@example.com,Student Name").fill(
      `${studentEmail},E2E Cohort Student`,
    );
    await page.getByRole("button", { name: "Import and invite" }).click();
    await expect(page.getByText("Students imported")).toBeVisible();
    await expect(page.getByText(studentEmail)).toBeVisible();
    await expect(page.getByText("waitlist")).toBeVisible();

    await page.getByRole("checkbox").check();
    await page.getByLabel("Approval note").fill("Promoted by Playwright local auth.");
    await page.getByRole("button", { name: "Promote selected" }).click();
    await expect(page.getByText("Students promoted")).toBeVisible();
    await expect(page.getByText("promoted", { exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByText("approved", { exact: true })).toBeVisible();
  });

  test("covers the member lifecycle from cohort invite through access recovery", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "local-chromium",
      "The complete lifecycle runs once on desktop; focused access checks run on both viewports.",
    );
    test.setTimeout(90_000);

    const suffix = Date.now();
    const cohortName = `Lifecycle Cohort ${suffix}`;
    const memberEmail = `e2e.lifecycle.${suffix}@example.com`;
    const memberName = `Lifecycle Member ${suffix}`;
    const preferredName = `Lifecycle ${suffix}`;
    const postTitle = `Lifecycle update ${suffix}`;
    const comment = `Lifecycle comment ${suffix}`;
    const introPurpose = `Lifecycle intro ${suffix}`;

    await signInAdmin(page);
    await page.goto("/org/wavespark/admin/cohorts");
    await page.getByLabel("Name").fill(cohortName);
    await page.getByLabel("Event label").fill("Lifecycle acceptance");
    await page.getByRole("button", { name: "Create cohort" }).click();
    await expect(page.getByRole("heading", { name: cohortName })).toBeVisible();
    await page
      .getByPlaceholder("email,name\nstudent@example.com,Student Name")
      .fill(`${memberEmail},${memberName}`);
    await page.getByRole("button", { name: "Import and invite" }).click();
    await expect(page.getByText(memberEmail)).toBeVisible();
    await expect(page.getByText("waitlist", { exact: true })).toBeVisible();

    await signInWithLocalAuth(page, {
      email: memberEmail,
      name: memberName,
      orgRole: "org:member",
    });
    await page.goto("/org/wavespark/onboarding");
    await expect(
      page.getByRole("heading", { name: "Build a profile strong enough for serious intros" }),
    ).toBeVisible();
    await page.getByLabel("Preferred name").fill(preferredName);
    await page.getByLabel("Headline").fill("Synthetic lifecycle test member");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").getByText("Draft saved")).toBeVisible();

    await page.getByRole("button", { name: /Step 2/ }).click();
    await page.getByLabel("What are you building?").fill("A synthetic lifecycle test product");
    await page
      .getByLabel("Longer description")
      .fill("A complete synthetic profile used only for automated lifecycle acceptance.");
    await page.getByRole("button", { name: /Step 3/ }).click();
    await page.getByLabel("Looking for").fill("mentor, collaborator");
    await page.getByLabel("Desired roles").fill("product, engineering");
    await page.getByLabel("Skill tags").fill("testing, product");
    await page.getByRole("button", { name: /Step 4/ }).click();
    await page.getByLabel("Email for intro").fill(memberEmail);
    await page.getByLabel("Stay open to intro requests").check();
    await page.getByRole("button", { name: "Complete onboarding" }).click();
    await expect(page.getByRole("heading", { name: "You’re on the waitlist" })).toBeVisible();

    await signInAdmin(page);
    await page.goto("/org/wavespark/admin/members");
    const memberForm = page.locator("form").filter({ hasText: memberEmail }).first();
    await memberForm.locator('select[name="status"]').selectOption("approved");
    await memberForm.locator('input[name="approval_note"]').fill("Approved by lifecycle E2E.");
    await memberForm.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").getByText("Membership updated")).toBeVisible();

    await signInWithLocalAuth(page, {
      email: memberEmail,
      name: memberName,
      orgRole: "org:member",
    });
    await page.goto("/org/wavespark/compose");
    await page.getByLabel("Title").fill(postTitle);
    await page
      .getByLabel("Context")
      .fill("A synthetic post proving approved, ready members can participate.");
    await page.getByLabel("Tags").fill("lifecycle, testing");
    await page.getByRole("button", { name: "Publish post" }).click();
    await expect(page.getByRole("status").getByText("Post published")).toBeVisible();
    await expect(page.getByText(postTitle)).toBeVisible();

    await page.goto("/org/wavespark/posts/pst_1");
    await page.getByPlaceholder("Add a useful, contextual response.").fill(comment);
    await page.getByRole("button", { name: "Add comment" }).click();
    await expect(page.getByRole("status").getByText("Comment added")).toBeVisible();
    await expect(page.getByText(comment)).toBeVisible();

    await page.goto("/org/wavespark/people/mem_leila");
    await page.getByRole("button", { name: "Follow", exact: true }).click();
    await expect(page.getByRole("status").getByText("Member followed")).toBeVisible();
    await page.locator('input[name="intro_purpose"]').fill(introPurpose);
    await page
      .locator('textarea[name="note"]')
      .fill("Synthetic request used to verify private contact handling.");
    await page.getByRole("button", { name: "Request intro" }).click();
    await expect(page.getByRole("status").getByText("Intro request sent")).toBeVisible();

    await signInWithLocalAuth(page, {
      email: "leila@example.com",
      name: "Leila Noor",
      orgRole: "org:member",
    });
    await page.goto(
      "/org/wavespark/requests?request_direction=incoming&request_status=pending",
    );
    const incomingRequest = page
      .getByTestId("intro-request-card")
      .filter({ hasText: introPurpose });
    await expect(incomingRequest.getByText(preferredName)).toBeVisible();
    await incomingRequest.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("status").getByText("Intro accepted")).toBeVisible();
    await expect(
      page.getByTestId("intro-request-card").filter({ hasText: introPurpose }).getByText(
        "Contact unlocked",
      ),
    ).toBeVisible();

    await signInAdmin(page);
    await page.goto("/org/wavespark/admin/members");
    const suspendForm = page.locator("form").filter({ hasText: memberEmail }).first();
    await suspendForm.locator('select[name="status"]').selectOption("suspended");
    await suspendForm.locator('input[name="approval_note"]').fill("Paused by lifecycle E2E.");
    await suspendForm.getByRole("button", { name: "Save" }).click();

    await signInWithLocalAuth(page, {
      email: memberEmail,
      name: memberName,
      orgRole: "org:member",
    });
    await page.goto("/org/wavespark/people");
    await expect(
      page.getByRole("heading", { name: "Your access is currently paused" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Wavespark Forum" })).toBeVisible();

    await signInAdmin(page);
    await page.goto("/org/wavespark/admin/members");
    const restoreForm = page.locator("form").filter({ hasText: memberEmail }).first();
    await restoreForm.locator('select[name="status"]').selectOption("approved");
    await restoreForm.locator('input[name="approval_note"]').fill("Restored by lifecycle E2E.");
    await restoreForm.getByRole("button", { name: "Save" }).click();

    await signInWithLocalAuth(page, {
      email: memberEmail,
      name: memberName,
      orgRole: "org:member",
    });
    await page.goto("/org/wavespark/feed");
    await expect(page.getByRole("heading", { name: "Wavespark Forum" })).toBeVisible();
  });
});

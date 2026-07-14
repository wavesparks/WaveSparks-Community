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

async function createCohort(
  page: Page,
  input: { eventLabel: string; name: string; notes?: string },
) {
  await page.goto("/org/wavespark/admin/cohorts");
  await expect(page.getByRole("heading", { name: "Cohorts", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New cohort" }).click();

  const dialog = page.getByRole("dialog", { name: "New cohort" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name").fill(input.name);
  await dialog.getByLabel("Event label").fill(input.eventLabel);
  if (input.notes) {
    await dialog.getByLabel("Notes").fill(input.notes);
  }
  await dialog.getByRole("button", { name: "Create cohort" }).click();

  await expect(page.getByRole("heading", { name: input.name })).toBeVisible();
  await expect(page.getByRole("status").getByText("Cohort created")).toBeVisible();
}

async function invitePastedListToCohort(
  page: Page,
  input: { email: string; name: string },
) {
  await page.getByRole("button", { name: "Add people" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite people" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Upload list" }).click();
  await dialog.getByRole("button", { name: "Paste list" }).click();
  await dialog
    .getByLabel("Paste email and name")
    .fill(`email,name\n${input.email},${input.name}`);
  await dialog.getByRole("button", { name: "Continue to mapping" }).click();

  await expect(dialog.getByLabel("Email column")).toBeVisible();
  await dialog.getByLabel("Email column").selectOption({ label: "email" });
  await dialog.getByLabel("Name column (optional)").selectOption({ label: "name" });
  await expect(dialog.locator("#member-import-access")).toHaveValue("waitlist");
  await expect(dialog.locator("#member-import-cohort")).not.toHaveValue("");
  await dialog.getByRole("button", { name: "Review people" }).click();

  await expect(dialog.getByText("Ready to invite", { exact: true }).first()).toBeVisible();
  await expect(dialog.locator('[id^="member-import-email-"]').first()).toHaveValue(input.email);
  await dialog.getByRole("button", { name: "Invite 1 person" }).click();

  await expect(dialog.getByRole("status").getByText("Import complete")).toBeVisible();
  await expect(dialog.getByText("Invitation created", { exact: true })).toBeVisible();
  await expect(dialog.getByText(input.email, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await expect(page.getByText(input.email, { exact: true })).toBeVisible();
}

async function approveCohortMember(page: Page, email: string, note: string) {
  const memberRow = page.locator("label").filter({ hasText: email }).first();
  await expect(memberRow).toBeVisible();
  await memberRow.getByRole("checkbox").check();
  await page.getByLabel("Approval note").fill(note);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Approve 1 for community" }).click();

  await expect(
    page.getByRole("status").getByText("Community access approved"),
  ).toBeVisible();
  await expect(memberRow.getByText("Approved", { exact: true })).toBeVisible();
}

async function updateMemberAccess(
  page: Page,
  input: { email: string; note: string; status: "approved" | "suspended" },
) {
  await page.goto(
    `/org/wavespark/admin/members?search=${encodeURIComponent(input.email)}`,
  );
  const memberCard = page.locator(".ws-card-glow").filter({ hasText: input.email }).first();
  await expect(memberCard).toBeVisible();
  await memberCard.getByText("Manage member", { exact: true }).click();
  await memberCard.getByLabel("Community access").selectOption(input.status);
  await memberCard.getByLabel("Admin note").fill(input.note);
  if (input.status === "suspended") {
    page.once("dialog", (dialog) => dialog.accept());
  }
  await memberCard.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").getByText("Membership updated")).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Cohorts", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New cohort" })).toBeVisible();
    await page.goto("/org/wavespark/admin/members");
    await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite people" })).toBeVisible();
    await expect(page.getByLabel("Name or email")).toBeVisible();
    await expect(page.locator("#member-access")).toBeVisible();
    await expect(page.getByLabel("Invitation")).toBeVisible();
    await expect(page.getByLabel("Cohort")).toBeVisible();
    await expect(
      page.locator(".ws-card-glow").filter({ hasText: "jules@example.com" }).first(),
    ).toBeVisible();

    await page.getByLabel("Name or email").fill("jules@example.com");
    await page.locator("#member-access").selectOption("approved");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/search=jules%40example\.com/);
    await expect(page).toHaveURL(/access=approved/);
    await expect(
      page.locator(".ws-card-glow").filter({ hasText: "jules@example.com" }).first(),
    ).toBeVisible();
  });

  test("admins can create a cohort, review a pasted list, invite, and approve", async ({ page }) => {
    test.skip(!canUseLocalAuth, "Cohort mutation browser flow uses local auth without Clerk.");
    await signInAdmin(page);
    const suffix = Date.now();
    const cohortName = `E2E Cohort ${suffix}`;
    const studentEmail = `e2e.cohort.${suffix}@example.com`;

    await createCohort(page, {
      eventLabel: "E2E Event",
      name: cohortName,
      notes: "Created by Playwright local auth.",
    });
    await invitePastedListToCohort(page, {
      email: studentEmail,
      name: "E2E Cohort Student",
    });
    await expect(
      page.locator("label").filter({ hasText: studentEmail }).getByText("Waitlist", { exact: true }),
    ).toBeVisible();
    await approveCohortMember(
      page,
      studentEmail,
      "Approved by Playwright local auth.",
    );
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
    await createCohort(page, {
      eventLabel: "Lifecycle acceptance",
      name: cohortName,
    });
    await invitePastedListToCohort(page, { email: memberEmail, name: memberName });
    await expect(
      page.locator("label").filter({ hasText: memberEmail }).getByText("Waitlist", { exact: true }),
    ).toBeVisible();

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
    await page.getByLabel(/^I am looking for a mentor or adviser/).check();
    await page.getByLabel(/^I am looking for a collaborator or teammate/).check();
    await page.getByLabel(/^I am open to collaborating/).check();
    await page.getByLabel("Desired roles").fill("product, engineering");
    await page.getByLabel("Skill tags").fill("testing, product");
    await page.getByRole("button", { name: /Step 4/ }).click();
    await page.getByLabel("Email for intro").fill(memberEmail);
    await page.getByLabel("Stay open to intro requests").check();
    await page.getByRole("button", { name: "Complete onboarding" }).click();
    await expect(page.getByRole("heading", { name: "You’re on the waitlist" })).toBeVisible();

    await signInAdmin(page);
    await updateMemberAccess(page, {
      email: memberEmail,
      note: "Approved by lifecycle E2E.",
      status: "approved",
    });

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
    await updateMemberAccess(page, {
      email: memberEmail,
      note: "Paused by lifecycle E2E.",
      status: "suspended",
    });

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
    await updateMemberAccess(page, {
      email: memberEmail,
      note: "Restored by lifecycle E2E.",
      status: "approved",
    });

    await signInWithLocalAuth(page, {
      email: memberEmail,
      name: memberName,
      orgRole: "org:member",
    });
    await page.goto("/org/wavespark/feed");
    await expect(page.getByRole("heading", { name: "Wavespark Forum" })).toBeVisible();
  });
});

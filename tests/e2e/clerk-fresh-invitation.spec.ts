import { createClerkClient } from "@clerk/backend";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { getDb } from "@/db/client";
import {
  membershipInvitations,
  memberships,
  spaceMemberships,
  users,
} from "@/db/schema";
import { env } from "@/lib/env";
import {
  generateMembershipInvitationToken,
  hashMembershipInvitationToken,
} from "@/lib/membership-invitation-token";
import {
  createManagedAccount,
  createMembershipInvitation,
  getMembershipById,
  getOrganizationBySlug,
  getUserById,
  grantSpaceMembership,
  listMembershipsForOrg,
  listSpacesForOrg,
  updateMembershipInvitationDelivery,
} from "@/server/store";

const runFreshInvitationSmoke =
  process.env.E2E_FRESH_INVITE_SMOKE === "1";

async function settleWithin(promise: Promise<unknown>, timeoutMs = 5_000) {
  await Promise.race([
    promise.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

async function completeInvitationSignUp(page: Page) {
  await expect(page.locator('input[name="password"]:visible').first()).toBeVisible({
    timeout: 20_000,
  });
  const fields = [
    ["input[name=firstName]", "Fresh"],
    ["input[name=lastName]", "Invitation"],
    ["input[name=username]", `fresh_invitation_${Date.now()}`],
    ["input[name=password]", "Wavesparks-test-password-2026!"],
    ["input[name=confirmPassword]", "Wavesparks-test-password-2026!"],
  ] as const;
  for (const [selector, value] of fields) {
    const input = page.locator(`${selector}:visible`).first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill(value, { timeout: 5_000 });
      await expect(input).toHaveValue(value);
    }
  }

  const legalAccepted = page.locator("input[name=legalAccepted]:visible").first();
  if (await legalAccepted.isVisible().catch(() => false)) {
    await legalAccepted.check({ timeout: 5_000 });
  }

  const signUpResponsePromise = page
    .waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.includes("/client/sign_ups"),
      { timeout: 10_000 },
    )
    .catch(() => undefined);
  await page
    .locator("button:visible")
    .filter({ hasText: /^\s*Continue\s*$/i })
    .first()
    .click({ force: true, noWaitAfter: true, timeout: 5_000 });
  const signUpResponse = await signUpResponsePromise;
  let signUpOutcome: Record<string, unknown> = {
    responseObserved: Boolean(signUpResponse),
  };
  if (signUpResponse && !signUpResponse.ok()) {
    const payload = await signUpResponse.json().catch(() => undefined) as
      | { errors?: Array<{ code?: string }> }
      | undefined;
    throw new Error(
      `Clerk sign-up request failed (${signUpResponse.status()}): ${
        payload?.errors?.map((error) => error.code).filter(Boolean).join(",") ||
        "unknown"
      }`,
    );
  }
  if (signUpResponse) {
    const payload = await signUpResponse.json().catch(() => undefined) as
      | {
          client?: {
            last_active_session_id?: string;
            sign_up?: {
              missing_fields?: string[];
              status?: string;
              unverified_fields?: string[];
            };
          };
          response?: {
            created_session_id?: string;
            missing_fields?: string[];
            status?: string;
            unverified_fields?: string[];
          };
        }
      | undefined;
    signUpOutcome = {
      responseObserved: true,
      responseStatus: signUpResponse.status(),
      responseSignUpStatus: payload?.response?.status ?? null,
      missingFields:
        payload?.response?.missing_fields ?? payload?.client?.sign_up?.missing_fields ?? [],
      unverifiedFields:
        payload?.response?.unverified_fields ??
        payload?.client?.sign_up?.unverified_fields ??
        [],
      clientSignUpStatus: payload?.client?.sign_up?.status ?? null,
      createdSession: Boolean(payload?.response?.created_session_id),
      activeSession: Boolean(payload?.client?.last_active_session_id),
    };
  }
  await page
    .waitForFunction(() => Boolean(window.Clerk?.session), undefined, {
      timeout: 5_000,
    })
    .catch(() => undefined);
  const authState = await page.evaluate(() => ({
    clerkStatus: window.Clerk?.status ?? "unknown",
    hasSession: Boolean(window.Clerk?.session),
    hasUser: Boolean(window.Clerk?.user),
    sessionTask: window.Clerk?.session?.currentTask?.key ?? null,
    signUpStatus: window.Clerk?.client?.signUp?.status ?? "unknown",
  }));
  if (!authState.hasSession) {
    throw new Error(
      `Clerk sign-up did not create a session: ${JSON.stringify({
        ...authState,
        ...signUpOutcome,
      })}`,
    );
  }
}

test("a fresh Clerk application invitation connects only the local Neon membership", async ({
  page,
}, testInfo) => {
  test.skip(
    !runFreshInvitationSmoke || testInfo.project.name !== "clerk-chromium",
    "Run explicitly against the Clerk test instance and wavespark_dev.",
  );
  test.setTimeout(90_000);

  expect(env.databaseUrl).toContain("/wavespark_dev");
  expect(env.clerkSecretKey).toMatch(/^sk_test_/);
  const org = await getOrganizationBySlug("wavesparks");
  expect(org).toBeDefined();
  const inviter = (await listMembershipsForOrg(org!.id)).find(
    (membership) =>
      membership.role === "org_admin" && membership.accountStatus === "connected",
  );
  const mainSpace = (await listSpacesForOrg(org!.id)).find(
    (space) => space.kind === "main",
  );
  expect(inviter).toBeDefined();
  expect(mainSpace).toBeDefined();

  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const email = `wavesparks-${suffix}+clerk_test@example.com`;
  const rawToken = generateMembershipInvitationToken();
  const client = createClerkClient({ secretKey: env.clerkSecretKey! });
  let localUserId: string | undefined;
  let localMembershipId: string | undefined;
  let identityInvitationId: string | undefined;
  let clerkUserId: string | undefined;

  try {
    const managed = await createManagedAccount({
      affiliationType: "invited outsider",
      email,
      invitedByUserId: inviter!.userId,
      name: "Fresh Invitation Smoke",
      orgId: org!.id,
      role: "member",
      status: "pending",
    });
    localUserId = managed.user.id;
    localMembershipId = managed.membership.id;
    await grantSpaceMembership({
      accessStatus: "active",
      invitedByMembershipId: inviter!.id,
      membershipId: managed.membership.id,
      orgId: org!.id,
      spaceId: mainSpace!.id,
    });
    const localInvitation = await createMembershipInvitation({
      createdByMembershipId: inviter!.id,
      email,
      expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      membershipId: managed.membership.id,
      orgId: org!.id,
      tokenHash: hashMembershipInvitationToken(rawToken),
    });
    const identityInvitation = await client.invitations.createInvitation({
      emailAddress: email,
      expiresInDays: 1,
      ignoreExisting: false,
      notify: false,
      redirectUrl:
        `http://localhost:3000/api/internal/membership-invitations/accept` +
        `?orgSlug=wavesparks&token=${encodeURIComponent(rawToken)}`,
    });
    identityInvitationId = identityInvitation.id;
    expect(identityInvitation.url).toBeTruthy();
    await updateMembershipInvitationDelivery(localInvitation.id, {
      clerkIdentityInvitationId: identityInvitation.id,
      deliveryError: null,
      sentAt: new Date().toISOString(),
    });

    const ticketResponse = await page.request.get(identityInvitation.url!, {
      maxRedirects: 0,
    });
    expect([301, 302, 303, 307, 308]).toContain(ticketResponse.status());
    const ticketLocation = ticketResponse.headers().location;
    expect(ticketLocation).toBeTruthy();
    const invitationRedirect = new URL(ticketLocation!, identityInvitation.url!);
    expect(invitationRedirect.origin).toBe("http://localhost:3000");
    expect(invitationRedirect.pathname).toBe(
      "/api/internal/membership-invitations/accept",
    );
    expect(invitationRedirect.searchParams.get("token")).toBe(rawToken);
    expect(invitationRedirect.searchParams.get("__clerk_ticket")).toBeTruthy();

    await setupClerkTestingToken({ context: page.context() });
    await page.goto(invitationRedirect.toString());
    await page.waitForURL(
      /\/org\/wavesparks\/accept-invitation\?.*__clerk_ticket=/,
    );
    expect(page.url()).not.toContain(rawToken);
    await expect(
      page.getByRole("heading", { name: "Accept your Wavesparks invitation" }),
    ).toBeVisible();
    await completeInvitationSignUp(page);
    await page.goto("/org/wavesparks/auth/complete");
    await page.waitForURL(/\/org\/wavesparks(?:\/onboarding)?(?:\?.*)?$/);
    clerkUserId = await page.evaluate(() => window.Clerk.user?.id);
    expect(clerkUserId).toMatch(/^user_/);
    expect(await page.evaluate(() => window.Clerk.organization?.id ?? null)).toBeNull();

    await expect
      .poll(async () => getMembershipById(managed.membership.id))
      .toMatchObject({ accountStatus: "connected" });
    await expect.poll(async () => getUserById(managed.user.id)).toMatchObject({
      clerkUserId,
      email,
    });
  } finally {
    if (clerkUserId) {
      await settleWithin(client.users.deleteUser(clerkUserId));
    } else {
      const matchingUsers = await Promise.race([
        client.users
          .getUserList({ emailAddress: [email] })
          .catch(() => ({ data: [] })),
        new Promise<{ data: [] }>((resolve) =>
          setTimeout(() => resolve({ data: [] }), 5_000),
        ),
      ]);
      for (const matchingUser of matchingUsers.data) {
        await settleWithin(client.users.deleteUser(matchingUser.id));
      }
    }
    if (identityInvitationId) {
      await settleWithin(
        client.invitations.revokeInvitation(identityInvitationId),
      );
    }
    if (localMembershipId && localUserId) {
      const db = getDb();
      await settleWithin(
        (async () => {
          await db
            .delete(membershipInvitations)
            .where(eq(membershipInvitations.membershipId, localMembershipId));
          await db
            .delete(spaceMemberships)
            .where(eq(spaceMemberships.membershipId, localMembershipId));
          await db
            .delete(memberships)
            .where(
              and(
                eq(memberships.id, localMembershipId),
                eq(memberships.userId, localUserId),
              ),
            );
          await db.delete(users).where(eq(users.id, localUserId));
        })(),
        10_000,
      );
    }
  }
});

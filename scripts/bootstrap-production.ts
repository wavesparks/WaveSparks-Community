import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { loadScriptEnv } from "./load-script-env";

function displayNameForEmail(email: string) {
  return email
    .split("@")[0]
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

async function main() {
  loadScriptEnv("production");
  const { seedOrganization } = await import("@/data/seed-data");
  const { getDb, getSqlClient } = await import("@/db/client");
  const { memberships, organizations, users } = await import("@/db/schema");
  const { env, getBootstrapAdminEmails } = await import("@/lib/env");

  if (!env.databaseUrl) {
    console.info("DATABASE_URL not configured. Skipping production bootstrap.");
    return;
  }

  const emails = getBootstrapAdminEmails();
  if (!emails.length) {
    console.info("WAVESPARK_ADMIN_EMAILS is empty. Created org only.");
  }

  const db = getDb();
  const now = new Date();

  await db
    .insert(organizations)
    .values({
      id: seedOrganization.id,
      name: seedOrganization.name,
      slug: seedOrganization.slug,
      logoUrl: seedOrganization.logoUrl,
      themeJson: seedOrganization.theme,
      tagline: seedOrganization.tagline,
      description: seedOrganization.description,
      membershipRules: seedOrganization.membershipRules,
      allowedDomains: seedOrganization.allowedDomains,
      inviteSettings: seedOrganization.inviteSettings,
      status: seedOrganization.status,
      createdAt: new Date(seedOrganization.createdAt),
    })
    .onConflictDoNothing();

  for (const email of emails) {
    const [existingUser] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    const user =
      existingUser ??
      (
        await db
          .insert(users)
          .values({
            id: `usr_${nanoid(8)}`,
            email,
            name: displayNameForEmail(email) || email,
            imageUrl: `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(email)}`,
            platformRole: "platform_owner",
            createdAt: now,
            updatedAt: now,
          })
          .returning()
      )[0];

    if (existingUser?.platformRole !== "platform_owner") {
      await db
        .update(users)
        .set({ platformRole: "platform_owner", updatedAt: now })
        .where(eq(users.id, user.id));
    }

    const [existingMembership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.orgId, seedOrganization.id)))
      .limit(1);

    if (existingMembership) {
      await db
        .update(memberships)
        .set({
          role: "org_admin",
          status: "approved",
          approvalNote: "Approved by production bootstrap.",
          approvedAt: existingMembership.approvedAt ?? now,
          updatedAt: now,
        })
        .where(eq(memberships.id, existingMembership.id));
      continue;
    }

    await db.insert(memberships).values({
      id: `mem_${nanoid(8)}`,
      orgId: seedOrganization.id,
      userId: user.id,
      role: "org_admin",
      affiliationType: "current participant",
      status: "approved",
      archetypes: ["mentor"],
      programName: "Wavespark Admin",
      cohortNameOrYear: "Core",
      approvalNote: "Approved by production bootstrap.",
      approvedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  console.info(`Production bootstrap complete. Admins configured: ${emails.length}.`);
  await getSqlClient().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

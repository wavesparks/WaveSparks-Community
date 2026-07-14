import { sql } from "drizzle-orm";

import { loadScriptEnv } from "./load-script-env";
import { assertWriteAllowed, databaseTarget, readScriptTarget } from "./script-safety";

function buildSeedRows(seedData: typeof import("@/data/seed-data")) {
  return {
    seedAnalyticsEvents: seedData.seedAnalyticsEvents,
    seedOrganization: seedData.seedOrganization,
    seedProfileLinks: seedData.seedProfileLinks,
    seededUsers: seedData.seedUsers.map((user) => ({
      ...user,
      anonymizedAt: user.anonymizedAt ? new Date(user.anonymizedAt) : undefined,
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    })),
    seededMemberships: seedData.seedMemberships.map((membership) => ({
      ...membership,
      clerkInvitationUpdatedAt: membership.clerkInvitationUpdatedAt
        ? new Date(membership.clerkInvitationUpdatedAt)
        : undefined,
      createdAt: new Date(membership.createdAt),
      updatedAt: new Date(membership.updatedAt),
      approvedAt: membership.approvedAt ? new Date(membership.approvedAt) : undefined,
    })),
    seededProfiles: seedData.seedProfiles.map((profile) => ({
      ...profile,
      createdAt: new Date(profile.createdAt),
      updatedAt: new Date(profile.updatedAt),
      lastActiveAt: new Date(profile.lastActiveAt),
      embeddingUpdatedAt: profile.embeddingUpdatedAt
        ? new Date(profile.embeddingUpdatedAt)
        : undefined,
    })),
    seededMatchTypeConfigs: seedData.seedMatchTypeConfigs.map((config) => ({
      id: config.id,
      orgId: config.orgId,
      slug: config.slug,
      name: config.name,
      description: config.description,
      direction: config.direction,
      seekerLabel: config.seekerLabel,
      providerLabel: config.providerLabel,
      weightsJson: config.weights,
      minimumScore: config.minimumScore,
      active: config.active,
      version: config.version,
      createdAt: new Date(config.createdAt),
      updatedAt: new Date(config.updatedAt),
    })),
    seededPosts: seedData.seedPosts.map((post) => ({
      ...post,
      createdAt: new Date(post.createdAt),
      updatedAt: new Date(post.updatedAt),
    })),
    seededComments: seedData.seedComments.map((comment) => ({
      ...comment,
      createdAt: new Date(comment.createdAt),
      updatedAt: new Date(comment.updatedAt),
    })),
    seededFollows: seedData.seedFollows.map((follow) => ({
      ...follow,
      createdAt: new Date(follow.createdAt),
    })),
    seededIntroRequests: seedData.seedIntroRequests.map((request) => ({
      ...request,
      createdAt: new Date(request.createdAt),
      updatedAt: new Date(request.updatedAt),
      respondedAt: request.respondedAt ? new Date(request.respondedAt) : undefined,
      contactRevealedAt: request.contactRevealedAt
        ? new Date(request.contactRevealedAt)
        : undefined,
    })),
    seededNotifications: seedData.seedNotifications.map((notification) => ({
      ...notification,
      createdAt: new Date(notification.createdAt),
      readAt: notification.readAt ? new Date(notification.readAt) : undefined,
    })),
  };
}

async function main() {
  const target = readScriptTarget();
  loadScriptEnv(target.environment);
  const seedRows = buildSeedRows(await import("@/data/seed-data"));
  const {
    seedAnalyticsEvents,
    seedOrganization,
    seedProfileLinks,
    seededComments,
    seededFollows,
    seededIntroRequests,
    seededMatchTypeConfigs,
    seededMemberships,
    seededNotifications,
    seededPosts,
    seededProfiles,
    seededUsers,
  } = seedRows;
  const { getDb, getSqlClient } = await import("@/db/client");
  const {
    accounts,
    adminActions,
    analyticsEvents,
    comments,
    follows,
    introRequests,
    matchFeedback,
    matchRuns,
    matchTypeConfigs,
    matches,
    memberships,
    notifications,
    organizations,
    posts,
    profileLinks,
    profiles,
    reports,
    users,
  } = await import("@/db/schema");
  const { env } = await import("@/lib/env");

  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }
  console.info(`Seed target: ${target.environment} (${databaseTarget(env.databaseUrl)}).`);
  if (!assertWriteAllowed(target)) {
    console.info("Dry run only. Re-run with --apply to replace data in the selected environment.");
    return;
  }

  const db = getDb();
  await db.execute(sql`create extension if not exists vector;`);

  await db.delete(notifications);
  await db.delete(analyticsEvents);
  await db.delete(adminActions);
  await db.delete(reports);
  await db.delete(introRequests);
  await db.delete(matchFeedback);
  await db.delete(matches);
  await db.delete(matchRuns);
  await db.delete(matchTypeConfigs);
  await db.delete(comments);
  await db.delete(follows);
  await db.delete(posts);
  await db.delete(profileLinks);
  await db.delete(profiles);
  await db.delete(memberships);
  await db.delete(accounts);
  await db.delete(users);
  await db.delete(organizations);

  await db.insert(organizations).values({
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
  });
  await db.insert(matchTypeConfigs).values(seededMatchTypeConfigs);
  await db.insert(users).values(seededUsers);
  await db.insert(memberships).values(seededMemberships);
  await db.insert(profiles).values(seededProfiles);
  await db.insert(profileLinks).values(seedProfileLinks);
  await db.insert(posts).values(seededPosts);
  if (seededFollows.length) {
    await db.insert(follows).values(seededFollows);
  }
  await db.insert(comments).values(seededComments);
  await db.insert(introRequests).values(seededIntroRequests);
  await db.insert(notifications).values(seededNotifications);
  await db.insert(analyticsEvents).values(
    seedAnalyticsEvents.map((event) => ({
      id: event.id,
      orgId: event.orgId,
      membershipId: event.membershipId,
      eventName: event.eventName,
      payloadJson: event.payload,
      createdAt: new Date(event.createdAt),
    })),
  );

  await getSqlClient().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

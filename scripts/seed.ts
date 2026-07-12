import { sql } from "drizzle-orm";

import {
  seedAnalyticsEvents,
  seedComments,
  seedFollows,
  seedIntroRequests,
  seedMemberships,
  seedNotifications,
  seedOrganization,
  seedPosts,
  seedProfileLinks,
  seedProfiles,
  seedUsers,
} from "@/data/seed-data";
import { loadScriptEnv } from "./load-script-env";
import { assertWriteAllowed, databaseTarget, readScriptTarget } from "./script-safety";

const seededUsers = seedUsers.map((user) => ({
  ...user,
  anonymizedAt: user.anonymizedAt ? new Date(user.anonymizedAt) : undefined,
  createdAt: new Date(user.createdAt),
  updatedAt: new Date(user.updatedAt),
}));

const seededMemberships = seedMemberships.map((membership) => ({
  ...membership,
  clerkInvitationUpdatedAt: membership.clerkInvitationUpdatedAt
    ? new Date(membership.clerkInvitationUpdatedAt)
    : undefined,
  createdAt: new Date(membership.createdAt),
  updatedAt: new Date(membership.updatedAt),
  approvedAt: membership.approvedAt ? new Date(membership.approvedAt) : undefined,
}));

const seededProfiles = seedProfiles.map((profile) => ({
  ...profile,
  createdAt: new Date(profile.createdAt),
  updatedAt: new Date(profile.updatedAt),
  lastActiveAt: new Date(profile.lastActiveAt),
}));

const seededPosts = seedPosts.map((post) => ({
  ...post,
  createdAt: new Date(post.createdAt),
  updatedAt: new Date(post.updatedAt),
}));

const seededComments = seedComments.map((comment) => ({
  ...comment,
  createdAt: new Date(comment.createdAt),
  updatedAt: new Date(comment.updatedAt),
}));

const seededFollows = seedFollows.map((follow) => ({
  ...follow,
  createdAt: new Date(follow.createdAt),
}));

const seededIntroRequests = seedIntroRequests.map((request) => ({
  ...request,
  createdAt: new Date(request.createdAt),
  updatedAt: new Date(request.updatedAt),
  respondedAt: request.respondedAt ? new Date(request.respondedAt) : undefined,
  contactRevealedAt: request.contactRevealedAt
    ? new Date(request.contactRevealedAt)
    : undefined,
}));

const seededNotifications = seedNotifications.map((notification) => ({
  ...notification,
  createdAt: new Date(notification.createdAt),
  readAt: notification.readAt ? new Date(notification.readAt) : undefined,
}));

async function main() {
  const target = readScriptTarget();
  loadScriptEnv(target.environment);
  const { getDb, getSqlClient } = await import("@/db/client");
  const {
    accounts,
    adminActions,
    analyticsEvents,
    comments,
    follows,
    introRequests,
    matchRuns,
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
  await db.delete(matches);
  await db.delete(matchRuns);
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

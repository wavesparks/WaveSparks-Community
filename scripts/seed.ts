import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import { loadScriptEnv } from "./load-script-env";
import { assertWriteAllowed, databaseTarget, readScriptTarget } from "./script-safety";

const accountScopedNotificationTypes = new Set(["membership_approved", "admin_note"]);

function deterministicId(prefix: string, value: string) {
  return `${prefix}_${createHash("md5").update(value).digest("hex")}`;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function buildSeedRows(seedData: typeof import("@/data/seed-data")) {
  const mainSpaceId = deterministicId("spc_main", seedData.seedOrganization.id);
  const seededMemberships = seedData.seedMemberships.map((membership) => ({
    ...membership,
    clerkInvitationUpdatedAt: membership.clerkInvitationUpdatedAt
      ? new Date(membership.clerkInvitationUpdatedAt)
      : undefined,
    mentorReviewedAt: membership.mentorReviewedAt
      ? new Date(membership.mentorReviewedAt)
      : undefined,
    createdAt: new Date(membership.createdAt),
    updatedAt: new Date(membership.updatedAt),
    approvedAt: membership.approvedAt ? new Date(membership.approvedAt) : undefined,
  }));
  const seededProfiles = seedData.seedProfiles.map((profile) => ({
    ...profile,
    createdAt: new Date(profile.createdAt),
    updatedAt: new Date(profile.updatedAt),
    lastActiveAt: new Date(profile.lastActiveAt),
    embeddingUpdatedAt: profile.embeddingUpdatedAt
      ? new Date(profile.embeddingUpdatedAt)
      : undefined,
  }));
  const profileByMembershipId = new Map(
    seedData.seedProfiles.map((profile) => [profile.membershipId, profile]),
  );
  const mainMembers = seededMemberships.filter(
    (membership) =>
      membership.orgId === seedData.seedOrganization.id &&
      membership.accountStatus === "connected" &&
      membership.status === "approved",
  );
  const seededSpaceMemberships = mainMembers.map((membership) => ({
    id: deterministicId("spm", `main:${mainSpaceId}:${membership.id}`),
    orgId: membership.orgId,
    spaceId: mainSpaceId,
    membershipId: membership.id,
    accessStatus: "active" as const,
    joinedVia: "migration" as const,
    grantedAt: membership.approvedAt ?? membership.createdAt,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  }));
  const seededSpaceIntents = mainMembers.map((membership) => {
    const profile = profileByMembershipId.get(membership.id);
    const currentGoal = profile?.idealMatchDescription || profile?.startupOneLiner || "";
    const lookingFor = profile
      ? unique([...profile.desiredRoles, ...profile.helpNeededTags])
      : [];
    const offers = profile
      ? unique([
          ...profile.skillTags,
          ...profile.topStrengths,
          ...profile.canContribute,
          ...profile.mentorOffers,
        ])
      : [];
    const seekingText = [
      currentGoal ? `Current goal: ${currentGoal}` : "",
      lookingFor.length ? `Looking for in this space: ${lookingFor.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const offeringText = offers.length
      ? `Can offer in this space: ${offers.join(", ")}`
      : "";

    return {
      id: deterministicId("spi", `${mainSpaceId}:${membership.id}`),
      orgId: membership.orgId,
      spaceId: mainSpaceId,
      membershipId: membership.id,
      currentGoal,
      lookingFor,
      offers,
      matchingOptIn: profile?.profileVisibleInMatching ?? true,
      intentComplete: Boolean(
        profile?.onboardingComplete &&
          (profile.seekingMatchTypes.length || profile.offeringMatchTypes.length),
      ),
      seekingText,
      offeringText,
      embeddingStatus: "pending",
      createdAt: membership.createdAt,
      updatedAt: profile ? new Date(profile.updatedAt) : membership.updatedAt,
    };
  });
  const canonicalSpacePrefix = `/org/${seedData.seedOrganization.slug}/s/main/`;
  const legacyOrgPrefix = `/org/${seedData.seedOrganization.slug}/`;

  return {
    seedOrganization: seedData.seedOrganization,
    seedProfileLinks: seedData.seedProfileLinks,
    seededSpaces: [
      {
        id: mainSpaceId,
        orgId: seedData.seedOrganization.id,
        slug: "main",
        kind: "main" as const,
        lifecycle: "active" as const,
        name: "Wavesparks Community",
        description: seedData.seedOrganization.description,
        eventLabel: "Community",
        matchingEnabled: true,
        createdAt: new Date(seedData.seedOrganization.createdAt),
        updatedAt: new Date(seedData.seedOrganization.createdAt),
      },
    ],
    seededSpaceMemberships,
    seededSpaceIntents,
    seededAnalyticsEvents: seedData.seedAnalyticsEvents.map((event) => ({
      id: event.id,
      orgId: event.orgId,
      spaceId: mainSpaceId,
      membershipId: event.membershipId,
      eventName: event.eventName,
      payloadJson: event.payload,
      createdAt: new Date(event.createdAt),
    })),
    seededUsers: seedData.seedUsers.map((user) => ({
      ...user,
      anonymizedAt: user.anonymizedAt ? new Date(user.anonymizedAt) : undefined,
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    })),
    seededMemberships,
    seededProfiles,
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
      spaceId: mainSpaceId,
      visibility: "space_only" as const,
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
      spaceId: mainSpaceId,
      createdAt: new Date(follow.createdAt),
    })),
    seededPostSaves: seedData.seedPostSaves.map((postSave) => ({
      ...postSave,
      createdAt: new Date(postSave.createdAt),
    })),
    seededIntroRequests: seedData.seedIntroRequests.map((request) => ({
      ...request,
      spaceId: mainSpaceId,
      createdAt: new Date(request.createdAt),
      updatedAt: new Date(request.updatedAt),
      respondedAt: request.respondedAt ? new Date(request.respondedAt) : undefined,
      contactRevealedAt: request.contactRevealedAt
        ? new Date(request.contactRevealedAt)
        : undefined,
    })),
    seededNotifications: seedData.seedNotifications.map((notification) => {
      const accountScoped = accountScopedNotificationTypes.has(notification.type);
      return {
        ...notification,
        spaceId: accountScoped ? null : mainSpaceId,
        link:
          !accountScoped && notification.link.startsWith(legacyOrgPrefix)
            ? notification.link.replace(legacyOrgPrefix, canonicalSpacePrefix)
            : notification.link,
        createdAt: new Date(notification.createdAt),
        readAt: notification.readAt ? new Date(notification.readAt) : undefined,
      };
    }),
  };
}

async function main() {
  const target = readScriptTarget();
  loadScriptEnv(target.environment);
  const seedRows = buildSeedRows(await import("@/data/seed-data"));
  const {
    seedOrganization,
    seedProfileLinks,
    seededAnalyticsEvents,
    seededComments,
    seededFollows,
    seededIntroRequests,
    seededMatchTypeConfigs,
    seededMemberships,
    seededNotifications,
    seededPostSaves,
    seededPosts,
    seededProfiles,
    seededSpaceIntents,
    seededSpaceMemberships,
    seededSpaces,
    seededUsers,
  } = seedRows;
  const { getMigrationDb, getSqlClient } = await import("@/db/client");
  const {
    accounts,
    adminActions,
    analyticsEvents,
    cohortMembers,
    cohorts,
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
    postSaves,
    posts,
    profileLinks,
    profiles,
    reports,
    spaceIntents,
    spaceMemberships,
    spaces,
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

  const sqlClient = getSqlClient();
  const db = getMigrationDb();
  try {
    await db.execute(sql`create extension if not exists vector;`);
    await db.transaction(async (tx) => {
      await tx.delete(notifications);
      await tx.delete(analyticsEvents);
      await tx.delete(adminActions);
      await tx.delete(reports);
      await tx.delete(introRequests);
      await tx.delete(matchFeedback);
      await tx.delete(matches);
      await tx.delete(matchRuns);
      await tx.delete(matchTypeConfigs);
      await tx.delete(comments);
      await tx.delete(postSaves);
      await tx.delete(follows);
      await tx.delete(posts);
      await tx.delete(spaceIntents);
      await tx.delete(spaceMemberships);
      await tx.delete(cohortMembers);
      await tx.delete(cohorts);
      await tx.delete(spaces);
      await tx.delete(profileLinks);
      await tx.delete(profiles);
      await tx.delete(memberships);
      await tx.delete(accounts);
      await tx.delete(users);
      await tx.delete(organizations);

      await tx.insert(organizations).values({
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
      await tx.insert(spaces).values(seededSpaces);
      await tx.insert(matchTypeConfigs).values(seededMatchTypeConfigs);
      await tx.insert(users).values(seededUsers);
      await tx.insert(memberships).values(seededMemberships);
      await tx.insert(profiles).values(seededProfiles);
      await tx.insert(profileLinks).values(seedProfileLinks);
      await tx.insert(spaceMemberships).values(seededSpaceMemberships);
      await tx.insert(spaceIntents).values(seededSpaceIntents);
      await tx.insert(posts).values(seededPosts);
      if (seededFollows.length) {
        await tx.insert(follows).values(seededFollows);
      }
      await tx.insert(comments).values(seededComments);
      if (seededPostSaves.length) {
        await tx.insert(postSaves).values(seededPostSaves);
      }
      await tx.insert(introRequests).values(seededIntroRequests);
      await tx.insert(notifications).values(seededNotifications);
      await tx.insert(analyticsEvents).values(seededAnalyticsEvents);
    });
  } finally {
    await sqlClient.end();
  }
}

if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

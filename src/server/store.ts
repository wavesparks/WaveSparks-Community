import { nanoid } from "nanoid";

import {
  seedAnalyticsEvents,
  seedComments,
  seedIntroRequests,
  seedMemberships,
  seedNotifications,
  seedOrganization,
  seedPosts,
  seedProfileLinks,
  seedProfiles,
  seedUsers,
} from "@/data/seed-data";
import { buildOrgAnalyticsSnapshot } from "@/server/analytics";
import { recomputeMatchesForProfiles } from "@/server/matching";
import type {
  AnalyticsEvent,
  Comment,
  IntroRequest,
  MatchRecord,
  Membership,
  MembershipStatus,
  Notification,
  Organization,
  Post,
  Profile,
  ProfileLink,
  User,
} from "@/lib/domain";

export interface StoreState {
  organizations: Organization[];
  users: User[];
  memberships: Membership[];
  profiles: Profile[];
  profileLinks: ProfileLink[];
  posts: Post[];
  comments: Comment[];
  matches: MatchRecord[];
  introRequests: IntroRequest[];
  notifications: Notification[];
  analyticsEvents: AnalyticsEvent[];
}

declare global {
  var __wavesparksStore: StoreState | undefined;
}

function initializeStore(): StoreState {
  const base: StoreState = {
    organizations: structuredClone([seedOrganization]),
    users: structuredClone(seedUsers),
    memberships: structuredClone(seedMemberships),
    profiles: structuredClone(seedProfiles),
    profileLinks: structuredClone(seedProfileLinks),
    posts: structuredClone(seedPosts),
    comments: structuredClone(seedComments),
    matches: [],
    introRequests: structuredClone(seedIntroRequests),
    notifications: structuredClone(seedNotifications),
    analyticsEvents: structuredClone(seedAnalyticsEvents),
  };

  base.matches = recomputeMatchesForProfiles(
    seedOrganization,
    base.memberships,
    base.profiles,
  );

  return base;
}

export function getStore() {
  if (!globalThis.__wavesparksStore) {
    globalThis.__wavesparksStore = initializeStore();
  }

  return globalThis.__wavesparksStore;
}

export function resetStore() {
  globalThis.__wavesparksStore = initializeStore();
  return globalThis.__wavesparksStore;
}

export function getOrganizationBySlug(slug: string) {
  return getStore().organizations.find((organization) => organization.slug === slug);
}

export function getUserByEmail(email: string) {
  return getStore().users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

export function getUserById(userId: string) {
  return getStore().users.find((user) => user.id === userId);
}

export function upsertSessionUser(input: { email: string; name: string; imageUrl?: string }) {
  const store = getStore();
  const existing = getUserByEmail(input.email);
  const now = new Date().toISOString();

  if (existing) {
    existing.name = input.name;
    existing.imageUrl = input.imageUrl ?? existing.imageUrl;
    existing.updatedAt = now;
    return existing;
  }

  const next: User = {
    id: `usr_${nanoid(8)}`,
    email: input.email,
    name: input.name,
    imageUrl: input.imageUrl ?? `https://api.dicebear.com/9.x/notionists/svg?seed=${input.name}`,
    platformRole: "standard",
    createdAt: now,
    updatedAt: now,
  };

  store.users.unshift(next);
  return next;
}

export function ensureMembership(userId: string, orgId: string) {
  const store = getStore();
  const existing = store.memberships.find(
    (membership) => membership.userId === userId && membership.orgId === orgId,
  );

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const membership: Membership = {
    id: `mem_${nanoid(8)}`,
    orgId,
    userId,
    role: "member",
    affiliationType: "invited outsider",
    status: "pending",
    archetypes: ["invited_outsider"],
    programName: "Guest Network",
    cohortNameOrYear: "Rolling",
    createdAt: now,
    updatedAt: now,
  };

  store.memberships.unshift(membership);
  return membership;
}

export function getMembershipByUserAndOrg(userId: string, orgId: string) {
  return getStore().memberships.find(
    (membership) => membership.userId === userId && membership.orgId === orgId,
  );
}

export function getMembershipById(id: string) {
  return getStore().memberships.find((membership) => membership.id === id);
}

export function getProfileByMembershipId(membershipId: string) {
  return getStore().profiles.find((profile) => profile.membershipId === membershipId);
}

export function getProfileById(profileId: string) {
  return getStore().profiles.find((profile) => profile.id === profileId);
}

export function listProfileLinks(profileId: string) {
  return getStore().profileLinks.filter((link) => link.profileId === profileId);
}

export function listMembershipsForOrg(orgId: string) {
  return getStore().memberships.filter((membership) => membership.orgId === orgId);
}

export function listProfilesForOrg(orgId: string) {
  const membershipIds = new Set(
    listMembershipsForOrg(orgId).map((membership) => membership.id),
  );
  return getStore().profiles.filter((profile) => membershipIds.has(profile.membershipId));
}

export function listPostsForOrg(orgId: string) {
  return getStore().posts
    .filter((post) => post.orgId === orgId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function listAllCommentsForOrg(orgId: string) {
  const postIds = new Set(listPostsForOrg(orgId).map((post) => post.id));
  return getStore().comments.filter((comment) => postIds.has(comment.postId));
}

export function getPostById(postId: string) {
  return getStore().posts.find((post) => post.id === postId);
}

export function listCommentsForPost(postId: string) {
  return getStore().comments
    .filter((comment) => comment.postId === postId && comment.status === "visible")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function listMatchesForMembership(membershipId: string) {
  const profile = getProfileByMembershipId(membershipId);
  if (!profile) {
    return [];
  }

  return getStore().matches
    .filter(
      (match) =>
        match.sourceProfileId === profile.id &&
        !match.hiddenByAdmin &&
        !match.dismissedBySource,
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, 12);
}

export function listIntroRequestsForMembership(membershipId: string) {
  return getStore().introRequests
    .filter(
      (request) =>
        request.requesterMembershipId === membershipId ||
        request.receiverMembershipId === membershipId,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function listNotificationsForMembership(membershipId: string) {
  return getStore().notifications
    .filter((notification) => notification.membershipId === membershipId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function listIntroRequestsForOrg(orgId: string) {
  return getStore().introRequests
    .filter((request) => request.orgId === orgId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function listMatchesForOrg(orgId: string) {
  return getStore().matches
    .filter((match) => match.orgId === orgId)
    .sort((left, right) => right.score - left.score);
}

export function addNotification(notification: Notification) {
  getStore().notifications.unshift(notification);
}

export function addAnalyticsEvent(event: AnalyticsEvent) {
  getStore().analyticsEvents.unshift(event);
}

export function createPost(input: Omit<Post, "id" | "createdAt" | "updatedAt">) {
  const post: Post = {
    id: `pst_${nanoid(8)}`,
    ...input,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  getStore().posts.unshift(post);
  addAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: input.orgId,
    membershipId: input.authorMembershipId,
    eventName: "post_created",
    payload: { postId: post.id, type: post.type },
    createdAt: new Date().toISOString(),
  });
  return post;
}

export function createComment(input: Omit<Comment, "id" | "createdAt" | "updatedAt" | "status">) {
  const comment: Comment = {
    id: `cmt_${nanoid(8)}`,
    status: "visible",
    ...input,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  getStore().comments.unshift(comment);
  addAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: seedOrganization.id,
    membershipId: input.authorMembershipId,
    eventName: "comment_created",
    payload: { postId: input.postId },
    createdAt: new Date().toISOString(),
  });
  return comment;
}

export function upsertProfile(profile: Profile, links: ProfileLink[]) {
  const store = getStore();
  const existingIndex = store.profiles.findIndex(
    (candidate) => candidate.membershipId === profile.membershipId,
  );

  if (existingIndex >= 0) {
    store.profiles[existingIndex] = profile;
  } else {
    store.profiles.unshift(profile);
  }

  store.profileLinks = store.profileLinks.filter((link) => link.profileId !== profile.id);
  store.profileLinks.unshift(...links);

  const membership = getMembershipById(profile.membershipId);
  if (membership) {
    membership.updatedAt = new Date().toISOString();
  }

  recomputeMatchesForOrg(seedOrganization.id);
  return profile;
}

export function createIntroRequest(
  input: Omit<IntroRequest, "id" | "createdAt" | "updatedAt">,
) {
  const intro: IntroRequest = {
    id: `intro_${nanoid(8)}`,
    ...input,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  getStore().introRequests.unshift(intro);
  addAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: input.orgId,
    membershipId: input.requesterMembershipId,
    eventName: "intro_requested",
    payload: { receiverMembershipId: input.receiverMembershipId, sourceType: input.sourceType },
    createdAt: new Date().toISOString(),
  });
  return intro;
}

export function respondToIntroRequest(
  introRequestId: string,
  status: "accepted" | "declined",
) {
  const intro = getStore().introRequests.find((request) => request.id === introRequestId);
  if (!intro) {
    return null;
  }

  intro.status = status;
  intro.respondedAt = new Date().toISOString();
  intro.updatedAt = intro.respondedAt;
  if (status === "accepted") {
    intro.contactRevealedAt = intro.respondedAt;
  }

  addAnalyticsEvent({
    id: `evt_${nanoid(8)}`,
    orgId: intro.orgId,
    membershipId: intro.receiverMembershipId,
    eventName: `intro_${status}`,
    payload: { introRequestId: intro.id },
    createdAt: intro.respondedAt,
  });

  return intro;
}

export function updateMembershipStatus(
  membershipId: string,
  status: MembershipStatus,
  approvalNote?: string,
) {
  const membership = getMembershipById(membershipId);
  if (!membership) {
    return null;
  }

  membership.status = status;
  membership.approvalNote = approvalNote ?? membership.approvalNote;
  membership.updatedAt = new Date().toISOString();
  if (status === "approved") {
    membership.approvedAt = membership.updatedAt;
  }
  recomputeMatchesForOrg(membership.orgId);
  return membership;
}

export function updatePostModeration(
  postId: string,
  input: Partial<Pick<Post, "hidden" | "featured" | "commentsLocked" | "status">>,
) {
  const post = getPostById(postId);
  if (!post) {
    return null;
  }

  Object.assign(post, input, { updatedAt: new Date().toISOString() });
  return post;
}

export function updateCommentStatus(commentId: string, status: Comment["status"]) {
  const comment = getStore().comments.find((entry) => entry.id === commentId);
  if (!comment) {
    return null;
  }

  comment.status = status;
  comment.updatedAt = new Date().toISOString();
  return comment;
}

export function updateProfileFlags(
  profileId: string,
  input: Partial<Pick<Profile, "featured" | "stale">>,
) {
  const profile = getStore().profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    return null;
  }

  Object.assign(profile, input, { updatedAt: new Date().toISOString() });
  recomputeMatchesForOrg(seedOrganization.id);
  return profile;
}

export function updateOrganizationSettings(
  orgId: string,
  input: Partial<Pick<Organization, "name" | "tagline" | "description" | "inviteSettings">>,
) {
  const organization = getStore().organizations.find((candidate) => candidate.id === orgId);
  if (!organization) {
    return null;
  }

  Object.assign(organization, input);
  return organization;
}

export function recomputeMatchesForOrg(orgId: string) {
  const store = getStore();
  const organization = store.organizations.find((candidate) => candidate.id === orgId);
  if (!organization) {
    return [];
  }

  const memberships = store.memberships.filter((membership) => membership.orgId === orgId);
  const membershipIds = new Set(memberships.map((membership) => membership.id));
  const profiles = store.profiles.filter((profile) => membershipIds.has(profile.membershipId));
  store.matches = recomputeMatchesForProfiles(organization, memberships, profiles);
  return store.matches;
}

export function getAnalyticsSnapshot(orgId: string) {
  const store = getStore();
  const memberships = store.memberships.filter((membership) => membership.orgId === orgId);
  const membershipIds = new Set(memberships.map((membership) => membership.id));
  return buildOrgAnalyticsSnapshot({
    memberships,
    profiles: store.profiles.filter((profile) => membershipIds.has(profile.membershipId)),
    posts: store.posts.filter((post) => post.orgId === orgId),
    comments: store.comments,
    introRequests: store.introRequests.filter((request) => request.orgId === orgId),
    matches: store.matches.filter((match) => match.orgId === orgId),
    analyticsEvents: store.analyticsEvents.filter((event) => event.orgId === orgId),
  });
}

export type PlatformRole = "platform_owner" | "standard";
export type MembershipRole = "org_admin" | "member";
export type AccountStatus = "invited" | "connected" | "suspended" | "deprovisioned";
export type ClerkOrgRole = "org:admin" | "org:member" | (string & {});
export type MembershipStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "suspended"
  | "waitlist";
export type ClerkInvitationStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "expired"
  | "failed";
export type AffiliationType =
  | "current participant"
  | "alumni"
  | "mentor"
  | "invited outsider";
export type PostType =
  | "general_update"
  | "ask"
  | "opportunity"
  | "looking_for_cofounder"
  | "looking_for_mentor"
  | "resource"
  | "announcement";
export type OpportunitySource = "member" | "mentor" | "official";
export type PostStatus = "active" | "closed" | "archived";
export type CommentStatus = "visible" | "removed";
export type MatchType = string;
export type MatchDirection = "mutual" | "seeker_provider";
export type MatchConfidence = "high" | "medium" | "low";
export type MatchFeedbackValue = "helpful" | "not_relevant";
export type MatchFactorKey =
  | "semantic"
  | "skills"
  | "venture"
  | "availability"
  | "work_style"
  | "location";
export type MatchFactorWeights = Record<MatchFactorKey, number>;
export type IntroStatus = "pending" | "accepted" | "declined" | "expired";
export type IntroSourceType = "match" | "post" | "profile" | "admin_manual";
export type NotificationType =
  | "membership_approved"
  | "intro_requested"
  | "intro_accepted"
  | "intro_declined"
  | "manual_intro"
  | "admin_note";
export type ProfileLinkType = "linkedin" | "github" | "website" | "x";
export type CohortStatus = "active" | "archived";
export type CohortMemberStatus = "invited" | "promoted";
export type SpaceKind = "main" | "event";
export type SpaceLifecycle = "draft" | "upcoming" | "active" | "ended" | "archived";
export type SpaceAccessStatus = "active" | "waitlist" | "rejected" | "suspended" | "removed";
export type SpaceJoinSource = "invite" | "import" | "promotion" | "direct" | "migration";
export type SpaceIntentEmbeddingStatus = "pending" | "ready" | "failed";

export interface Organization {
  id: string;
  clerkOrgId?: string;
  name: string;
  slug: string;
  logoUrl: string;
  theme: {
    accent: string;
    accentSoft: string;
    canvas: string;
    ink: string;
  };
  tagline: string;
  description: string;
  membershipRules: string[];
  allowedDomains: string[];
  inviteSettings: string;
  status: "active" | "draft";
  createdAt: string;
}

export interface MatchTypeConfig {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  description: string;
  direction: MatchDirection;
  seekerLabel: string;
  providerLabel: string;
  weights: MatchFactorWeights;
  minimumScore: number;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  clerkUserId?: string;
  email: string;
  name: string;
  imageUrl: string;
  platformRole: PlatformRole;
  anonymizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  clerkMembershipId?: string;
  clerkRole?: ClerkOrgRole;
  clerkInvitationId?: string;
  clerkInvitationStatus?: ClerkInvitationStatus;
  clerkInvitationError?: string;
  clerkInvitationUpdatedAt?: string;
  orgId: string;
  userId: string;
  role: MembershipRole;
  accountStatus: AccountStatus;
  affiliationType: AffiliationType;
  status: MembershipStatus;
  archetypes: string[];
  programName: string;
  cohortNameOrYear: string;
  invitedByUserId?: string;
  approvalNote?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Space {
  id: string;
  orgId: string;
  slug: string;
  kind: SpaceKind;
  lifecycle: SpaceLifecycle;
  name: string;
  description: string;
  eventLabel: string;
  startsAt?: string;
  endsAt?: string;
  endedAt?: string;
  archivedAt?: string;
  matchingEnabled: boolean;
  createdByMembershipId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceMembership {
  id: string;
  orgId: string;
  spaceId: string;
  membershipId: string;
  accessStatus: SpaceAccessStatus;
  joinedVia: SpaceJoinSource;
  invitedByMembershipId?: string;
  sourceSpaceId?: string;
  decisionNote?: string;
  grantedAt?: string;
  removedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpaceIntent {
  id: string;
  orgId: string;
  spaceId: string;
  membershipId: string;
  currentGoal: string;
  lookingFor: string[];
  offers: string[];
  matchingOptIn: boolean;
  intentComplete: boolean;
  seekingText: string;
  offeringText: string;
  seekingEmbedding?: number[];
  offeringEmbedding?: number[];
  embeddingModel?: string;
  embeddingSourceHash?: string;
  embeddingStatus: SpaceIntentEmbeddingStatus;
  embeddingError?: string;
  embeddingUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Cohort {
  id: string;
  orgId: string;
  name: string;
  description: string;
  eventLabel: string;
  status: CohortStatus;
  createdByMembershipId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CohortMember {
  id: string;
  orgId: string;
  cohortId: string;
  membershipId: string;
  invitedEmail: string;
  invitedName: string;
  status: CohortMemberStatus;
  invitedAt: string;
  promotedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  membershipId: string;
  fullName: string;
  preferredName: string;
  displayNamePreference: string;
  profilePhoto: string;
  headline: string;
  shortBio: string;
  longBio: string;
  city: string;
  country: string;
  timezone: string;
  schoolOrCompany: string;
  currentStatus: string;
  startupName: string;
  startupOneLiner: string;
  startupDescription: string;
  stage: string;
  industryTags: string[];
  problemSpaceTags: string[];
  businessModelTags: string[];
  currentProgress: string;
  tractionSummary: string;
  regionFocus: string;
  lookingForTypes: string[];
  seekingMatchTypes: string[];
  offeringMatchTypes: string[];
  desiredRoles: string[];
  helpNeededTags: string[];
  idealMatchDescription: string;
  skillTags: string[];
  yearsOfExperience: number;
  topStrengths: string[];
  canContribute: string[];
  priorProjects: string;
  notableWins: string;
  timeCommitment: string;
  availabilityStart: string;
  remotePreference: string;
  preferredGeographies: string[];
  meetingFrequencyPreference: string;
  ambitionLevel: number;
  riskTolerance: number;
  speedPreference: string;
  decisionStyle: string;
  workStyle: string;
  communicationStyle: string;
  conflictStyle: string;
  commitmentHorizon: string;
  missionVsMarketOrientation: string;
  structureVsChaos: number;
  mentorExpertiseTags: string[];
  mentorStageExperience: string[];
  mentorFunctionalStrengths: string[];
  mentorAvailability: string;
  mentorOffers: string[];
  maxMentees: number | null;
  mentorshipPreferences: string;
  publicContactEnabled: boolean;
  emailForIntro: string;
  whatsappNumber: string;
  whatsappVisibleAfterAccept: boolean;
  introOptIn: boolean;
  profileVisibleInMatching: boolean;
  profileCompletionPercent: number;
  lastActiveAt: string;
  featured: boolean;
  stale: boolean;
  onboardingComplete: boolean;
  seekingEmbeddingText: string;
  offeringEmbeddingText: string;
  seekingEmbedding?: number[];
  offeringEmbedding?: number[];
  embeddingModel?: string;
  embeddingSourceHash?: string;
  embeddingStatus: "pending" | "ready" | "failed";
  embeddingError?: string;
  embeddingUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileLink {
  id: string;
  profileId: string;
  type: ProfileLinkType;
  url: string;
}

export interface Post {
  id: string;
  orgId: string;
  spaceId?: string;
  authorMembershipId: string;
  type: PostType;
  opportunitySource?: OpportunitySource;
  title: string;
  body: string;
  tags: string[];
  relatedStartupName?: string;
  relatedRolesNeeded: string[];
  visibility: "org_only" | "space_only";
  status: PostStatus;
  featured: boolean;
  hidden: boolean;
  commentsLocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Follow {
  id: string;
  orgId: string;
  spaceId?: string;
  followerMembershipId: string;
  followedMembershipId: string;
  createdAt: string;
}

export interface PostSave {
  id: string;
  orgId: string;
  membershipId: string;
  postId: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorMembershipId: string;
  body: string;
  status: CommentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MatchRecord {
  id: string;
  orgId: string;
  spaceId?: string;
  sourceProfileId: string;
  targetProfileId: string;
  matchType: MatchType;
  score: number;
  scoreBreakdown: Record<string, number>;
  explanationText: string;
  overlapTags: string[];
  scoreBand: "high" | "good" | "emerging";
  confidence: MatchConfidence;
  algorithmVersion: string;
  runId?: string;
  surfacedAt: string;
  dismissedBySource: boolean;
  hiddenByAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MatchRun {
  id: string;
  orgId: string;
  spaceId?: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  metadata: Record<string, unknown>;
}

export interface MatchFeedback {
  id: string;
  orgId: string;
  spaceId?: string;
  matchId: string;
  sourceProfileId: string;
  matchType: MatchType;
  algorithmVersion: string;
  score: number;
  value: MatchFeedbackValue;
  reasons: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MatchFeedbackSummary {
  total: number;
  helpful: number;
  notRelevant: number;
  byMatchType: Array<{
    matchType: MatchType;
    helpful: number;
    notRelevant: number;
    total: number;
  }>;
  reasons: Array<{ reason: string; count: number }>;
}

export interface IntroRequest {
  id: string;
  orgId: string;
  spaceId?: string;
  requesterMembershipId: string;
  receiverMembershipId: string;
  sourceType: IntroSourceType;
  sourceId: string;
  introPurpose: string;
  note: string;
  status: IntroStatus;
  respondedAt?: string;
  contactRevealedAt?: string;
  suggestedFirstMessage: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  orgId: string;
  spaceId?: string;
  membershipId: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  readAt?: string;
  createdAt: string;
}

export interface AnalyticsEvent {
  id: string;
  orgId: string;
  spaceId?: string;
  membershipId?: string;
  eventName: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface LimitedProfileCard {
  membershipId: string;
  profileId: string;
  displayName: string;
  photo: string;
  headline: string;
  currentStatus: string;
  whatTheyAreBuilding: string;
  whatTheyNeed: string[];
  keyTags: string[];
  affiliationLabel: string;
  location: string;
}

export interface FullAdminProfile extends LimitedProfileCard {
  emailForIntro: string;
  whatsappNumber: string;
  longBio: string;
  startupDescription: string;
  desiredRoles: string[];
  mentorOffers: string[];
  profileCompletionPercent: number;
  status: MembershipStatus;
  featured: boolean;
  stale: boolean;
}

export interface FeedPostView {
  id: string;
  type: PostType;
  opportunitySource?: OpportunitySource;
  title: string;
  body: string;
  tags: string[];
  relatedRolesNeeded: string[];
  status: PostStatus;
  featured: boolean;
  createdAt: string;
  author: LimitedProfileCard;
  commentCount: number;
  isFollowingAuthor: boolean;
  isSaved: boolean;
  isRecommended: boolean;
  recommendationReasons: Array<"Followed" | "Matched">;
}

export interface MemberDirectoryFilters {
  q?: string;
  affiliation?: string;
  stage?: string;
  industry?: string;
  need?: string;
  skill?: string;
}

export interface MemberDirectoryProfileView extends LimitedProfileCard {
  stage: string;
  startupName: string;
  startupDescription: string;
  currentProgress: string;
  tractionSummary: string;
  industryTags: string[];
  problemSpaceTags: string[];
  skillTags: string[];
  desiredRoles: string[];
  mentorOffers: string[];
  profileLinks: ProfileLink[];
  isFollowing: boolean;
  introStatus?: IntroStatus;
}

export interface KnowledgePostView extends FeedPostView {
  knowledgeReason: "resource" | "featured" | "active_discussion" | "saved";
  savedAt?: string;
}

export interface MatchCardView {
  id: string;
  matchType: MatchType;
  matchTypeLabel: string;
  score: number;
  scoreBand: "high" | "good" | "emerging";
  confidence: MatchConfidence;
  explanationText: string;
  overlapTags: string[];
  target: LimitedProfileCard;
}

export interface IntroRequestView {
  id: string;
  spaceId?: string;
  spaceName?: string;
  spaceSlug?: string;
  status: IntroStatus;
  introPurpose: string;
  note: string;
  sourceType: IntroSourceType;
  createdAt: string;
  respondedAt?: string;
  contactDetails?: {
    email: string;
    whatsapp: string;
  };
  otherParty: LimitedProfileCard;
  isIncoming: boolean;
  suggestedFirstMessage: string;
}

export interface NotificationView {
  id: string;
  spaceId?: string;
  spaceName?: string;
  title: string;
  body: string;
  createdAt: string;
  link: string;
  readAt?: string;
}

export type ActivationChecklistItemId = "profile" | "post" | "matches" | "intro";

export interface ActivationChecklistItem {
  id: ActivationChecklistItemId;
  label: string;
  description: string;
  complete: boolean;
  href: string;
  cta: string;
}

export interface MemberActivationState {
  items: ActivationChecklistItem[];
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
}

export interface OrgAnalyticsSnapshot {
  approvedMembers: number;
  completedProfiles: number;
  activeWeeklyPosters: number;
  introRequestsSent: number;
  introRequestsAccepted: number;
  cofounderMatchesAccepted: number;
  mentorMatchesAccepted: number;
  teamsFormed: number;
  startupsLaunched: number;
  dailySeries: Array<{
    date: string;
    posts: number;
    comments: number;
    introRequests: number;
    acceptedIntros: number;
  }>;
}

export interface ViewerContext {
  org: Organization;
  user: User;
  membership: Membership;
  profile?: Profile;
  canAdmin: boolean;
  scopes: string[];
}

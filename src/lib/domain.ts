export type PlatformRole = "platform_owner" | "standard";
export type MembershipRole = "org_admin" | "member";
export type MembershipStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "suspended"
  | "waitlist";
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
export type MatchType = "cofounder_match" | "mentor_match";
export type IntroStatus = "pending" | "accepted" | "declined" | "expired";
export type IntroSourceType = "match" | "post" | "admin_manual";
export type NotificationType =
  | "membership_approved"
  | "intro_requested"
  | "intro_accepted"
  | "intro_declined"
  | "manual_intro"
  | "admin_note";
export type ProfileLinkType = "linkedin" | "github" | "website" | "x";

export interface Organization {
  id: string;
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

export interface User {
  id: string;
  email: string;
  name: string;
  imageUrl: string;
  platformRole: PlatformRole;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  orgId: string;
  userId: string;
  role: MembershipRole;
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
  embeddingText: string;
  profileEmbedding: number[];
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
  authorMembershipId: string;
  type: PostType;
  opportunitySource?: OpportunitySource;
  title: string;
  body: string;
  tags: string[];
  relatedStartupName?: string;
  relatedRolesNeeded: string[];
  visibility: "org_only";
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
  followerMembershipId: string;
  followedMembershipId: string;
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
  sourceProfileId: string;
  targetProfileId: string;
  matchType: MatchType;
  score: number;
  scoreBreakdown: Record<string, number>;
  explanationText: string;
  overlapTags: string[];
  scoreBand: "high" | "good" | "emerging";
  surfacedAt: string;
  dismissedBySource: boolean;
  hiddenByAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IntroRequest {
  id: string;
  orgId: string;
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
  isRecommended: boolean;
  recommendationReasons: Array<"Followed" | "Matched">;
}

export interface MatchCardView {
  id: string;
  matchType: MatchType;
  score: number;
  scoreBand: "high" | "good" | "emerging";
  explanationText: string;
  overlapTags: string[];
  target: LimitedProfileCard;
}

export interface IntroRequestView {
  id: string;
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

import type { MembershipStatus, Profile } from "@/lib/domain";
import { parseTags } from "@/lib/utils";

export interface ProfileReadinessField {
  key: string;
  label: string;
}

export interface ProfileReadiness {
  completionPercent: number;
  missingFields: ProfileReadinessField[];
  isReady: boolean;
}

export interface StatusBannerCopy {
  title: string;
  body: string;
}

export interface PendingAccessTimelineItem {
  title: string;
  description: string;
  status: "complete" | "current" | "upcoming" | "blocked";
}

export interface PendingAccessExperience {
  title: string;
  body: string;
  timeline: PendingAccessTimelineItem[];
  primaryHref?: string;
  primaryLabel?: string;
  noteLabel: string;
}

const readinessFields: Array<ProfileReadinessField & { hasValue: (profile: Profile) => boolean }> = [
  {
    key: "preferred_name",
    label: "Preferred name",
    hasValue: (profile) => Boolean(profile.preferredName.trim()),
  },
  {
    key: "headline",
    label: "Headline",
    hasValue: (profile) => Boolean(profile.headline.trim()),
  },
  {
    key: "startup_one_liner",
    label: "Startup one-liner",
    hasValue: (profile) => Boolean(profile.startupOneLiner.trim()),
  },
  {
    key: "startup_description",
    label: "Startup description",
    hasValue: (profile) => Boolean(profile.startupDescription.trim()),
  },
  {
    key: "looking_for_types",
    label: "Looking for",
    hasValue: (profile) => profile.lookingForTypes.length > 0,
  },
  {
    key: "desired_roles",
    label: "Desired roles",
    hasValue: (profile) => profile.desiredRoles.length > 0,
  },
  {
    key: "skill_tags",
    label: "Skill tags",
    hasValue: (profile) => profile.skillTags.length > 0,
  },
  {
    key: "email_for_intro",
    label: "Email for intros",
    hasValue: (profile) => Boolean(profile.emailForIntro.trim()),
  },
];

export function getProfileReadiness(profile: Profile): ProfileReadiness {
  const missingFields = readinessFields
    .filter((field) => !field.hasValue(profile))
    .map(({ key, label }) => ({ key, label }));
  const completedFields = readinessFields.length - missingFields.length;

  return {
    completionPercent: Math.round((completedFields / readinessFields.length) * 100),
    missingFields,
    isReady: missingFields.length === 0,
  };
}

export function getProfileReadinessFromFormData(
  formData: FormData,
  fallbackProfile: Profile,
): ProfileReadiness {
  const profile: Profile = {
    ...fallbackProfile,
    preferredName:
      String(formData.get("preferred_name") ?? fallbackProfile.preferredName).trim(),
    headline: String(formData.get("headline") ?? fallbackProfile.headline).trim(),
    startupOneLiner: String(
      formData.get("startup_one_liner") ?? fallbackProfile.startupOneLiner,
    ).trim(),
    startupDescription: String(
      formData.get("startup_description") ?? fallbackProfile.startupDescription,
    ).trim(),
    lookingForTypes: parseTags(formData.get("looking_for_types")),
    desiredRoles: parseTags(formData.get("desired_roles")),
    skillTags: parseTags(formData.get("skill_tags")),
    emailForIntro:
      String(formData.get("email_for_intro") ?? fallbackProfile.emailForIntro).trim(),
  };

  return getProfileReadiness(profile);
}

export function getStatusBannerCopy(status?: string): StatusBannerCopy | null {
  switch (status) {
    case "profile_saved":
      return {
        title: "Profile saved",
        body: "Your matching context is updated. Matches and recommendations can now use the latest details.",
      };
    case "post_created":
      return {
        title: "Post published",
        body: "Your update is now visible to approved members in this community.",
      };
    case "intro_requested":
      return {
        title: "Intro request sent",
        body: "The request is now in your intro inbox. You can track the response from here.",
      };
    case "intro_existing":
      return {
        title: "Intro already exists",
        body: "You already have an intro request with this member in your requests inbox.",
      };
    case "comment_added":
      return {
        title: "Comment added",
        body: "Your reply is now visible in the thread.",
      };
    case "post_saved":
      return {
        title: "Post saved",
        body: "This thread is now available from your Knowledge saved view.",
      };
    case "post_unsaved":
      return {
        title: "Post removed from saved",
        body: "This thread is no longer in your saved Knowledge view.",
      };
    case "intro_accepted":
      return {
        title: "Intro accepted",
        body: "Contact details are now unlocked for both sides in the requests inbox.",
      };
    case "intro_declined":
      return {
        title: "Intro declined",
        body: "The sender has been notified that you passed for now.",
      };
    case "member_followed":
      return {
        title: "Member followed",
        body: "Their posts and opportunities can now be highlighted for you.",
      };
    case "member_unfollowed":
      return {
        title: "Member unfollowed",
        body: "They will no longer be prioritized as a followed member.",
      };
    case "notifications_read":
      return {
        title: "Notifications marked read",
        body: "The latest inbox notifications are now cleared.",
      };
    case "manual_intro_created":
      return {
        title: "Manual intro created",
        body: "The recipient has been notified and the request is now visible in the intro flow.",
      };
    case "member_invited":
      return {
        title: "Invitation sent",
        body: "Clerk has the account invitation, and the local membership state is ready for review.",
      };
    case "member_saved":
      return {
        title: "Member saved",
        body: "The local account and membership state were updated.",
      };
    case "membership_updated":
      return {
        title: "Membership updated",
        body: "The member status and admin note are saved.",
      };
    case "org_settings_saved":
      return {
        title: "Settings saved",
        body: "The organization profile and branding details are updated.",
      };
    case "post_moderation_updated":
      return {
        title: "Post moderation updated",
        body: "The post moderation state is saved and the feed has been refreshed.",
      };
    case "comment_moderation_updated":
      return {
        title: "Comment moderation updated",
        body: "The comment visibility state is saved.",
      };
    case "profile_flags_updated":
      return {
        title: "Profile flags updated",
        body: "The profile moderation flags are saved and match surfaces have been refreshed.",
      };
    case "matches_recomputed":
      return {
        title: "Matches recomputed",
        body: "The latest profile data has been used to refresh match rankings.",
      };
    default:
      return null;
  }
}

export function getPendingAccessExperience(
  status: MembershipStatus,
  approvalNote?: string,
): PendingAccessExperience {
  if (status === "approved") {
    return {
      title: "Complete your profile to unlock the community",
      body:
        "Your membership is approved. Finish the required profile context to enter the feed and matches.",
      noteLabel: "Access note",
      primaryHref: "onboarding",
      primaryLabel: "Complete profile",
      timeline: [
        {
          title: "Membership approved",
          description: "Your account can enter the community once profile context is ready.",
          status: "complete",
        },
        {
          title: "Profile completion required",
          description:
            "Matching and intro surfaces need enough detail before access opens.",
          status: "current",
        },
      ],
    };
  }

  if (status === "rejected") {
    return {
      title: "Your application wasn’t approved",
      body:
        approvalNote ??
        "Your current application is closed. Admin notes are shown below if they were provided.",
      noteLabel: "Admin decision note",
      timeline: [
        {
          title: "Application reviewed",
          description: "The admin team reviewed your membership request and profile context.",
          status: "complete",
        },
        {
          title: "Access closed",
          description: "This account cannot enter the member feed or matching surfaces.",
          status: "blocked",
        },
      ],
    };
  }

  if (status === "suspended") {
    return {
      title: "Your access is currently paused",
      body:
        approvalNote ??
        "Suspended members cannot enter the feed or matching surfaces until access is restored.",
      noteLabel: "Access note",
      timeline: [
        {
          title: "Membership paused",
          description: "Community access is disabled for this account.",
          status: "current",
        },
        {
          title: "Feed and matching locked",
          description: "Contact details and member surfaces remain unavailable while paused.",
          status: "blocked",
        },
      ],
    };
  }

  const waitlist = status === "waitlist";

  return {
    title: waitlist ? "You’re on the waitlist" : "Your application is in review",
    body: waitlist
      ? "Admins have your profile and may approve access when a relevant cohort or opening is ready."
      : "Admins can see your full profile and will approve, waitlist, or reject access from the membership queue.",
    noteLabel: "Access note",
    primaryHref: "onboarding",
    primaryLabel: "Continue editing your profile",
    timeline: [
      {
        title: "Profile stays editable",
        description:
          "You can keep sharpening your profile so admins and future matches have better context.",
        status: "complete",
      },
      {
        title: waitlist ? "Waiting for the right opening" : "Admin review",
        description: waitlist
          ? "The admin team will unlock access when your profile fits an active community need."
          : "Admins review identity, founder context, collaboration asks, and intro readiness.",
        status: "current",
      },
      {
        title: "First member action",
        description:
          "Once approved, start with the feed, browse matches, or request a high-context intro.",
        status: "upcoming",
      },
    ],
  };
}

import type { MembershipStatus, Profile } from "@/lib/domain";
import { parseTags } from "@/lib/utils";
import { legacySeekingMatchTypes } from "@/lib/match-config";

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
    label: "One-line introduction",
    hasValue: (profile) => Boolean(profile.headline.trim()),
  },
  {
    key: "bio",
    label: "About you",
    hasValue: (profile) => Boolean(profile.bio.trim()),
  },
  {
    key: "current_focus",
    label: "What you’re exploring",
    hasValue: (profile) => Boolean(profile.currentFocus.trim()),
  },
  {
    key: "looking_for_types",
    label: "Matching intent",
    hasValue: (profile) => profile.seekingMatchTypes.length > 0,
  },
  {
    key: "skill_tags",
    label: "Skills or learning interests",
    hasValue: (profile) => profile.skillTags.length > 0,
  },
  {
    key: "email_for_intro",
    label: "Email for accepted introductions",
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
  const hasMatchingIntentSubmission =
    formData.has("matching_intent_version") ||
    formData.has("looking_for_types") ||
    formData.has("seeking_match_types") ||
    formData.has("offering_match_types");
  const submittedSeekingMatchTypes = formData
    .getAll("seeking_match_types")
    .map(String)
    .filter(Boolean);
  const profile: Profile = {
    ...fallbackProfile,
    preferredName:
      String(formData.get("preferred_name") ?? fallbackProfile.preferredName).trim(),
    headline: String(formData.get("headline") ?? fallbackProfile.headline).trim(),
    bio: String(
      formData.has("bio")
        ? formData.get("bio")
        : fallbackProfile.bio,
    ).trim(),
    currentFocus: String(
      formData.has("current_focus")
        ? formData.get("current_focus")
        : fallbackProfile.currentFocus,
    ).trim(),
    seekingMatchTypes: hasMatchingIntentSubmission
      ? submittedSeekingMatchTypes.length
        ? submittedSeekingMatchTypes
        : legacySeekingMatchTypes(parseTags(formData.get("looking_for_types")))
      : fallbackProfile.seekingMatchTypes,
    skillTags: formData.has("skill_tags")
      ? parseTags(formData.get("skill_tags"))
      : fallbackProfile.skillTags,
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
        body: "Your latest details will be used for future matches and recommendations.",
      };
    case "profile_draft_saved":
      return {
        title: "Draft saved",
        body: "Your changes are saved. Complete the remaining fields before you post, comment, browse People, or request an introduction.",
      };
    case "profile_incomplete":
      return {
        title: "Your profile is not finished yet",
        body: "Your changes are saved. Complete the remaining fields to finish setting up your profile.",
      };
    case "profile_invalid":
      return {
        title: "Check the profile fields",
        body: "Use a valid email, HTTP(S) links, and values inside the displayed numeric ranges.",
      };
    case "post_created":
      return {
        title: "Post published",
        body: "Your update is now visible to people who have access here.",
      };
    case "intro_requested":
      return {
        title: "Introduction request sent",
        body: "You can follow the response from Introductions.",
      };
    case "intro_existing":
      return {
        title: "Introduction already requested",
        body: "You already have an introduction request with this person.",
      };
    case "comment_added":
      return {
        title: "Comment added",
        body: "Your reply is now visible in the thread.",
      };
    case "post_saved":
      return {
        title: "Post saved",
        body: "This post is now in your saved items.",
      };
    case "post_unsaved":
      return {
        title: "Post removed from saved",
        body: "This post is no longer in your saved items.",
      };
    case "intro_accepted":
      return {
        title: "Introduction accepted",
        body: "Both of you can now see each other’s contact details in Introductions.",
      };
    case "intro_declined":
      return {
        title: "Introduction declined",
        body: "The requester has been notified. No contact details were shared.",
      };
    case "member_followed":
      return {
        title: "Now following",
        body: "Their posts and opportunities can now be highlighted for you.",
      };
    case "member_unfollowed":
      return {
        title: "No longer following",
        body: "Their posts will no longer be highlighted for you.",
      };
    case "match_type_saved":
      return {
        title: "Matching category saved",
        body: "The new settings are active. Match suggestions are being refreshed.",
      };
    case "match_type_invalid":
      return {
        title: "Check the matching category",
        body: "Complete every field, keep the minimum match quality from 35 to 80, and make the importance values add up to 100.",
      };
    case "match_feedback_saved":
      return {
        title: "Feedback saved",
        body: "Your private feedback will help us improve future match suggestions.",
      };
    case "notifications_read":
      return {
        title: "Notifications marked read",
        body: "The latest inbox notifications are now cleared.",
      };
    case "manual_intro_created":
      return {
        title: "Introduction created",
        body: "The recipient has been notified and can now respond from their inbox.",
      };
    case "member_invited":
      return {
        title: "Invitation created",
        body: "The invitation is ready. If this person already had an account, their access was added immediately.",
      };
    case "member_invite_failed":
      return {
        title: "Invitation failed",
        body: "The invitation could not be created. Review the error in member details, then try again.",
      };
    case "member_invite_revoked":
      return {
        title: "Invitation revoked",
        body: "The invitation link can no longer be used. You can send a new invitation later.",
      };
    case "member_existing":
      return {
        title: "This person is already listed",
        body: "No profile, role, or access was changed. Manage this person from their details page.",
      };
    case "member_added_to_cohort":
      return {
        title: "Participant added",
        body: "This person was added to the event. Their profile and other access were not changed.",
      };
    case "member_added_to_space":
      return {
        title: "Access added",
        body: "This person can now join the selected community or event. Their other access was not changed.",
      };
    case "space_access_conflict":
      return {
        title: "Review this person’s access",
        body: "Their access was previously rejected, paused, or removed. Open member details to restore it intentionally.",
      };
    case "account_inactive_conflict":
      return {
        title: "Restore the account first",
        body: "This account is paused or no longer active. Restore it before adding community or event access.",
      };
    case "event_created":
      return {
        title: "Event created",
        body: "You can now add participants, prepare event content, and configure matching.",
      };
    case "event_updated":
      return {
        title: "Event updated",
        body: "Your changes are saved. Access to Wavesparks Community and other events was not changed.",
      };
    case "event_archived":
      return {
        title: "Event archived",
        body: "Participants can no longer open this event or receive new matches. You can restore it later.",
      };
    case "event_restored":
      return {
        title: "Event restored",
        body: "Participants can open the event again. Its people, content, and matches are unchanged.",
      };
    case "member_inactive_conflict":
      return {
        title: "Review this person’s access",
        body: "Their access was previously rejected or paused. Open member details to restore it intentionally.",
      };
    case "cohort_created":
      return {
        title: "Event created",
        body: "You can now add participants and prepare the event.",
      };
    case "cohort_updated":
      return {
        title: "Event updated",
        body: "The event name and notes are saved.",
      };
    case "cohort_archived":
      return {
        title: "Event archived",
        body: "Participants can no longer open this event. Their access to Wavesparks Community and other events is unchanged.",
      };
    case "cohort_students_imported":
      return {
        title: "Participants imported",
        body: "The successful invitations and event access changes are complete.",
      };
    case "cohort_students_partially_imported":
      return {
        title: "Some participants could not be invited",
        body: "Review the results below and retry only the failed invitations.",
      };
    case "cohort_import_too_large":
      return {
        title: "The list is too large",
        body: "Import no more than 100 unique email addresses at a time.",
      };
    case "cohort_import_empty":
      return {
        title: "No participants to import",
        body: "Add at least one email address before importing the list.",
      };
    case "cohort_import_invalid":
      return {
        title: "Check the roster format",
        body: "Each line needs an email address, optionally followed by a comma and name.",
      };
    case "cohort_clerk_unconfigured":
      return {
        title: "Invitations are not configured",
        body: "Complete the account service setup before sending invitations.",
      };
    case "cohort_clerk_session_required":
      return {
        title: "Choose your organization first",
        body: "Switch to the Wavesparks organization before adding participants.",
      };
    case "cohort_clerk_admin_required":
      return {
        title: "Admin permission required",
        body: "Use an organization admin account to send invitations.",
      };
    case "cohort_members_promoted":
      return {
        title: "Added to Wavesparks Community",
        body: "The selected participants can now join Wavesparks Community. Their event access is unchanged.",
      };
    case "cohort_no_selection":
      return {
        title: "No participants selected",
        body: "Select at least one participant to add to Wavesparks Community.",
      };
    case "member_saved":
      return {
        title: "Member saved",
        body: "The account and access details are updated.",
      };
    case "membership_updated":
      return {
        title: "Member updated",
        body: "The account status, access, and admin note are saved.",
      };
    case "membership_clerk_failed":
      return {
        title: "Saved, but account update failed",
        body: "Your decision is saved. Review the account error in member details, then try again.",
      };
    case "org_settings_saved":
      return {
        title: "Settings saved",
        body: "The organization profile and branding details are updated.",
      };
    case "post_moderation_updated":
      return {
        title: "Post settings saved",
        body: "The post settings are saved and the feed is up to date.",
      };
    case "comment_moderation_updated":
      return {
        title: "Comment settings saved",
        body: "The comment settings are saved.",
      };
    case "profile_flags_updated":
      return {
        title: "Profile review updated",
        body: "The profile review settings are saved and match suggestions have been refreshed.",
      };
    case "matches_recomputed":
      return {
        title: "Matches refreshed",
        body: "Match suggestions now use the latest member profiles and preferences.",
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
      title: "Complete your profile to get started",
      body:
        "Your membership is approved. Finish the required profile details to view members and matches.",
      noteLabel: "Access note",
      primaryHref: "onboarding",
      primaryLabel: "Complete profile",
      timeline: [
        {
          title: "Membership approved",
          description: "Your account is ready once your profile is complete.",
          status: "complete",
        },
        {
          title: "Profile completion required",
          description: "Add the remaining details before browsing members or requesting introductions.",
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
          description: "The Wavesparks team reviewed your membership request and profile.",
          status: "complete",
        },
        {
          title: "Access closed",
          description: "This account cannot view member content or matches.",
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
        "This account cannot view member content or matches until access is restored.",
      noteLabel: "Access note",
      timeline: [
        {
          title: "Membership paused",
          description: "Community access is disabled for this account.",
          status: "current",
        },
        {
          title: "Feed and matching locked",
          description: "Member content and contact details remain unavailable while paused.",
          status: "blocked",
        },
      ],
    };
  }

  const waitlist = status === "waitlist";

  return {
    title: waitlist ? "You’re on the waitlist" : "Your application is in review",
    body: waitlist
      ? "The Wavesparks team has your profile and will contact you if a place becomes available."
      : "The Wavesparks team is reviewing your profile and will update your access when a decision is made.",
    noteLabel: "Access note",
    primaryHref: "onboarding",
    primaryLabel: "Continue editing your profile",
    timeline: [
      {
        title: "Profile stays editable",
        description: "You can keep updating your profile while you wait.",
        status: "complete",
      },
      {
        title: waitlist ? "Waiting for the right opening" : "Admin review",
        description: waitlist
          ? "The Wavesparks team will contact you if a place becomes available."
          : "The Wavesparks team reviews your profile and what you hope to find in the community.",
        status: "current",
      },
      {
        title: "Get started",
        description: "Once approved, read the latest posts, browse members, or request an introduction.",
        status: "upcoming",
      },
    ],
  };
}

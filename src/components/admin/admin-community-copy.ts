import {
  getCommunityDisplayName,
  WAVESPARKS_COMMUNITY_NAME,
} from "@/lib/community-copy";

export { WAVESPARKS_COMMUNITY_NAME } from "@/lib/community-copy";

interface AdminSpaceLabelInput {
  kind: "main" | "event";
  name: string;
}

export function adminSpaceName(space: AdminSpaceLabelInput) {
  return getCommunityDisplayName(space);
}

export function adminSpaceOptionLabel(space: AdminSpaceLabelInput) {
  const name = adminSpaceName(space);
  return space.kind === "main" ? name : `${name} · Event`;
}

export function adminFriendlyMessage(message: string) {
  if (
    /\b(clerk|resend|vercel|openai|api[_ -]?key|postgres|sql|provider|stack trace)\b/i.test(
      message,
    )
  ) {
    return "This action couldn’t be completed right now. Try again in a few minutes.";
  }
  if (/account_suspended|deprovisioned/i.test(message)) {
    return "This account is paused or closed. Review it in member details before continuing.";
  }

  return message
    .replaceAll("Add to Main Community", "Add to Wavesparks Community")
    .replaceAll("Main Community", WAVESPARKS_COMMUNITY_NAME)
    .replaceAll("Main access", "Wavesparks Community access")
    .replaceAll("Archived Spaces", "Archived Events")
    .replaceAll("Event Spaces", "Events")
    .replaceAll("Event Space", "Event")
    .replaceAll("Main Spaces", WAVESPARKS_COMMUNITY_NAME)
    .replaceAll("Main Space", WAVESPARKS_COMMUNITY_NAME)
    .replaceAll("Space access", "Access")
    .replaceAll("Destination Space", "Destination")
    .replace(/\bMain\b/g, WAVESPARKS_COMMUNITY_NAME)
    .replace(/\bSpaces\b/g, "communities and Events")
    .replace(/\bSpace\b/g, "community or Event")
    .replace(/\bspaces\b/g, "communities and Events")
    .replace(/\bspace\b/g, "community or Event")
    .replace(/\bcohorts?\b/gi, "Event")
    .replace(/\bentitlements?\b/gi, "access")
    .replace(/\bscopes?\b/gi, "location")
    .replace(/\bpools?\b/gi, "group");
}

export function adminInvitationIssue(message?: string) {
  const normalized = message?.toLowerCase() ?? "";
  if (!normalized) {
    return "Invitation status is tracked separately from community and Event access.";
  }
  if (normalized.includes("rate") || normalized.includes("too many")) {
    return "The invitation service is busy. Wait a few minutes, then try again.";
  }
  if (normalized.includes("email") || normalized.includes("resend")) {
    return "The account was updated, but the notification email could not be sent. Try again.";
  }
  return "The last invitation attempt failed. Try again or contact support if the problem continues.";
}

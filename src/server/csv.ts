import type { FullAdminProfile } from "@/lib/domain";

function csvCell(value: string) {
  const text = String(value);
  const spreadsheetSafe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}

export function fullProfilesToCsv(profiles: FullAdminProfile[]) {
  const headers = [
    "Display Name",
    "Headline",
    "Bio",
    "Problem Or Topic Of Interest",
    "Current Focus",
    "Technical Experience Level",
    "Technical Experience",
    "Affiliation",
    "Status",
    "Location",
    "Email For Intro",
    "WhatsApp",
    "Desired Roles",
    "Mentor Offers",
    "Profile Completion",
  ];

  const rows = profiles.map((profile) => [
    profile.displayName,
    profile.headline,
    profile.bio,
    profile.problemInterest,
    profile.currentFocus,
    profile.technicalExperienceLevel,
    profile.technicalExperience,
    profile.affiliationLabel,
    profile.status,
    profile.location,
    profile.emailForIntro,
    profile.whatsappNumber,
    profile.desiredRoles.join(" | "),
    profile.mentorOffers.join(" | "),
    String(profile.profileCompletionPercent),
  ]);

  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

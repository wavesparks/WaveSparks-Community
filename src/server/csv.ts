import type { FullAdminProfile } from "@/lib/domain";

export function fullProfilesToCsv(profiles: FullAdminProfile[]) {
  const headers = [
    "Display Name",
    "Headline",
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
    profile.affiliationLabel,
    profile.status,
    profile.location,
    profile.emailForIntro,
    profile.whatsappNumber,
    profile.desiredRoles.join(" | "),
    profile.mentorOffers.join(" | "),
    String(profile.profileCompletionPercent),
  ]);

  return [headers, ...rows]
    .map((row) =>
      row
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
}

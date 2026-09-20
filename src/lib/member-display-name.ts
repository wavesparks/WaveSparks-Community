interface MemberDisplayNameInput {
  email: string;
  name: string;
  preferredName?: string;
}

function usableName(value?: string) {
  const trimmed = value?.trim();
  return trimmed && !trimmed.includes("@") ? trimmed : undefined;
}

function nameFromEmail(email: string) {
  const localPart = email.trim().split("@")[0]?.split("+")[0] ?? "";
  const words = localPart
    .split(/[._-]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  return words
    .map((word) => {
      const normalized = word.toLocaleLowerCase("en");
      return `${normalized.charAt(0).toLocaleUpperCase("en")}${normalized.slice(1)}`;
    })
    .join(" ");
}

export function getMemberDisplayName({
  email,
  name,
  preferredName,
}: MemberDisplayNameInput) {
  return usableName(preferredName) ?? usableName(name) ?? (nameFromEmail(email) || "Member");
}
export function getAdminMemberDisplayName(record: {
  profile?: { fullName?: string; preferredName?: string };
  user?: { name?: string; email?: string };
}) {
  const full = record.profile?.fullName?.trim() || record.user?.name?.trim();
  const preferred = record.profile?.preferredName?.trim();
  if (full && preferred && full.toLocaleLowerCase() !== preferred.toLocaleLowerCase()) {
    return `${full} (${preferred})`;
  }
  return full || preferred || record.user?.email || "Unnamed member";
}

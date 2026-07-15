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

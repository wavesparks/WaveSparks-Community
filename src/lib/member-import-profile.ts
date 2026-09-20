import type { MemberImportPreviewRow } from "@/lib/member-import";

export const importProfileFields = [
  { key: "preferred_name", label: "Preferred name", aliases: ["preferredname", "nickname"] },
  { key: "headline", label: "One-line introduction", aliases: ["headline", "onelineintroduction", "introyourselfinoneline"] },
  { key: "bio", label: "About you", aliases: ["bio", "aboutyou", "aboutme", "biography"] },
  { key: "current_focus", label: "What are you exploring?", aliases: ["currentfocus", "whatareyouexploring", "currentgoal"] },
  { key: "skill_tags", label: "Skills", aliases: ["skilltags", "skills", "yourskills"] },
  { key: "seeking_match_types", label: "Looking for (match types)", aliases: ["seekingmatchtypes", "matchtypes", "lookingfor", "lookingfortypes"] },
  { key: "ideal_match_description", label: "Ideal match / goals", aliases: ["idealmatchdescription", "idealmatch", "matchinggoals"] },
  { key: "help_needed_tags", label: "Help needed", aliases: ["helpneededtags", "helpneeded", "needs"] },
  { key: "can_contribute", label: "What you can offer", aliases: ["cancontribute", "offers", "whatyoucanoffer"] },
  { key: "industry_tags", label: "Industries", aliases: ["industrytags", "industries", "industry"] },
  { key: "school_or_company", label: "School or company", aliases: ["schoolorcompany", "company", "school"] },
  { key: "technical_experience", label: "Technical experience", aliases: ["technicalexperience", "technicalbackground"] },
  { key: "mentor_expertise_tags", label: "Mentor expertise", aliases: ["mentorexpertisetags", "mentorexpertise"] },
  { key: "mentor_offers", label: "Mentor offers", aliases: ["mentoroffers", "mentorservices"] },
] as const;

export type ImportProfileField = typeof importProfileFields[number]["key"];
export type MemberImportProfile = Partial<Record<ImportProfileField, string>>;

export function normalizeImportHeader(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function parseImportedMatchTypes(value: string) {
  const aliases: Record<string, string> = {
    cofounder: "cofounder_match", cofounders: "cofounder_match", cofoundermatch: "cofounder_match",
    collaborator: "collaborator_match", collaborators: "collaborator_match", collaboratormatch: "collaborator_match",
    mentor: "mentor_match", mentors: "mentor_match", mentormatch: "mentor_match", advisor: "mentor_match",
  };
  return [...new Set(value.split(/[,;|\n]+/).map((item) => aliases[normalizeImportHeader(item)] ?? item.trim()).filter(Boolean))];
}

export function normalizeImportedProfile(value: unknown): { profile?: MemberImportProfile; error?: string } {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Profile fields must be text." };
  const input = value as Record<string, unknown>;
  const profile: MemberImportProfile = {};
  for (const { key, label } of importProfileFields) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "string") return { error: `${label} must be text.` };
    const text = (input[key] as string).trim();
    const limit = key === "preferred_name" ? 120 : key === "headline" ? 240 : 4000;
    if (text.length > limit) return { error: `${label} must be ${limit} characters or fewer.` };
    if (/^[=+@]/.test(text)) return { error: `${label} must be a plain value, not a formula.` };
    if (text) profile[key] = text;
  }
  return Object.keys(profile).length ? { profile } : {};
}

export function isImportRowActionable(row: MemberImportPreviewRow) {
  return row.classification === "ready" || row.classification === "retryable" ||
    (["already_connected", "already_invited", "existing_member"].includes(row.classification) &&
      (row.spaceAction === "grant" || row.spaceAction === "activate_waitlist" || Boolean(row.profile && Object.keys(row.profile).length)));
}

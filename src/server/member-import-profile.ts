import type { Membership, Profile, User } from "@/lib/domain";
import type { MemberImportProfile } from "@/lib/member-import-profile";
import { parseImportedMatchTypes } from "@/lib/member-import-profile";
import { profileFromFormData } from "@/lib/profile-form";
import { getProfileByMembershipId, listProfileLinks, upsertProfile } from "@/server/store";

const profileKeys: Record<keyof MemberImportProfile, keyof Profile> = {
  preferred_name: "preferredName", headline: "headline", bio: "bio", current_focus: "currentFocus",
  skill_tags: "skillTags", seeking_match_types: "seekingMatchTypes", ideal_match_description: "idealMatchDescription",
  help_needed_tags: "helpNeededTags", can_contribute: "canContribute", industry_tags: "industryTags",
  school_or_company: "schoolOrCompany", technical_experience: "technicalExperience",
  mentor_expertise_tags: "mentorExpertiseTags", mentor_offers: "mentorOffers",
};

export async function fillImportedProfile(input: {
  profile: MemberImportProfile;
  user: User;
  membership: Membership;
}) {
  const existing = await getProfileByMembershipId(input.membership.id);
  const form = new FormData();
  for (const [key, value] of Object.entries(input.profile)) {
    const old = existing?.[profileKeys[key as keyof MemberImportProfile]];
    if (!value || (Array.isArray(old) ? old.length : typeof old === "string" ? old.trim() : old)) continue;
    if (key.startsWith("mentor_") && input.membership.mentorStatus !== "approved") continue;
    if (key === "seeking_match_types") {
      const types = parseImportedMatchTypes(value);
      for (const type of types) form.append(key, type);
      // Mutual categories imply willingness to collaborate; mentor provider status is never granted by import.
      if (!existing?.offeringMatchTypes.length) {
        for (const type of types.filter((type) => type !== "mentor_match")) form.append("offering_match_types", type);
      }
    } else form.set(key, Array.isArray(existing?.[profileKeys[key as keyof MemberImportProfile]]) ||
      ["skill_tags", "help_needed_tags", "can_contribute", "industry_tags", "mentor_expertise_tags", "mentor_offers"].includes(key)
      ? value.split(/[,;|\n]+/).map((item) => item.trim()).filter(Boolean).join(",") : value);
  }
  if (!Array.from(form.keys()).length) return false;
  const existingLinks = existing ? await listProfileLinks(existing.id) : [];
  const { profile, links } = profileFromFormData({
    formData: form, user: input.user, membership: input.membership,
    existingProfile: existing, existingLinks,
  });
  await upsertProfile(profile, links, { orgId: input.membership.orgId, recomputeMatches: false });
  return true;
}

import type { Profile, SpaceIntent } from "@/lib/domain";

const typeLabels: Record<string, string> = {
  cofounder_match: "Co-founder",
  collaborator_match: "Collaborator",
  mentor_match: "Mentor",
};

export function spaceIntentDefaults(profile?: Profile, intent?: SpaceIntent) {
  // A saved Space preference, including an intentionally empty field, wins.
  if (intent && (intent.currentGoal || intent.lookingFor.length || intent.offers.length ||
    !intent.matchingOptIn || intent.updatedAt !== intent.createdAt)) return intent;
  return {
    currentGoal: profile?.currentFocus || profile?.idealMatchDescription || profile?.startupOneLiner || "",
    lookingFor: [...new Set([
      ...(profile?.seekingMatchTypes ?? []).map((type) => typeLabels[type] ?? type),
      ...(profile?.desiredRoles ?? []),
      ...(profile?.helpNeededTags ?? []),
    ])],
    offers: [...new Set([...(profile?.skillTags ?? []), ...(profile?.canContribute ?? [])])],
    matchingOptIn: profile?.profileVisibleInMatching ?? true,
  };
}

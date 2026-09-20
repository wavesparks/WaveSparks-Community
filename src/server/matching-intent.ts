import type { Profile, SpaceIntent } from "@/lib/domain";

const types = [
  ["cofounder_match", /\bco[ -]?founders?\b/i],
  ["collaborator_match", /\b(?:collaborators?|teammates?)\b/i],
  ["mentor_match", /\b(?:mentors?|advis[oe]rs?)\b/i],
] as const;

export function intentMatchTypes(intent: SpaceIntent, fallback: string[]) {
  const requested = types.filter(([, pattern]) => intent.lookingFor.some((value) => pattern.test(value))).map(([type]) => type);
  return requested.length ? requested : fallback;
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/\b(?:education technology|educational technology|education tech|ed-tech)\b/g, "edtech")
    .replace(/\b(?:computer science|computer sci|cs|software engineering|software development|programming|coding)\b/g, "computing")
    .replace(/\b(?:machine learning|artificial intelligence)\b/g, "ai")
    .replace(/\b(?:go.to.market)\b/g, "gtm");
}

const filler = new Set(("i we me my our a an the to of in on at for with and or who that is are has have having be been " +
  "someone people person anyone good strong background experience experienced expertise skilled skills skill " +
  "need needs want wanted looking look find meet connect seeking would like can could help support " +
  "co founder cofounder cofounders collaborator collaborators teammate teammates mentor mentors advisor advisors " +
  "build building work working project projects startup startups new other open interested interest together").split(/\s+/));

function terms(value: string) {
  return [...new Set((normalize(value).match(/[\p{L}\p{N}+#]+/gu) ?? []).filter((word) => word.length > 1 && !filler.has(word)))];
}

/** Only explicit requests for a counterpart are hard constraints; a general goal remains a ranking signal. */
export function matchesExplicitIntent(intent: SpaceIntent, target: Profile, targetIntent: SpaceIntent) {
  const goalRequest = intent.currentGoal.match(/\b(?:someone|anyone|people|person|co[ -]?founder|collaborator|mentor|partner)\s+(?:(?:who\s+)+(?:is\s+|has\s+|can\s+)?|with\s+|in\s+|good\s+(?:at|with)\s+|experienced\s+in\s+)([^.!?]+)/i)?.[1];
  if (!goalRequest) return true;
  // Read demonstrated capability only: what a target wants to learn is not proof that they can offer it.
  const evidence = [
    target.headline, target.bio, target.technicalExperience, target.schoolOrCompany,
    target.priorProjects, target.startupDescription, target.startupOneLiner,
    ...target.skillTags, ...target.topStrengths, ...target.canContribute,
    ...target.industryTags, ...target.problemSpaceTags, ...target.mentorExpertiseTags,
    ...target.mentorFunctionalStrengths, ...target.mentorOffers, ...targetIntent.offers,
  ].join("\n");
  const available = new Set(terms(evidence));
  // "A and B" requires both; "A or B" permits alternatives.
  return goalRequest.split(/\s+and\s+/i).every((requirement) =>
    requirement.split(/\s+or\s+/i).some((alternative) => {
      const requested = terms(alternative);
      return !requested.length || requested.every((term) => available.has(term));
    }),
  );
}

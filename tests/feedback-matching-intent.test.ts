import { describe, expect, it } from "vitest";
import { seedProfiles } from "@/data/seed-data";
import type { SpaceIntent } from "@/lib/domain";
import { intentMatchTypes, matchesExplicitIntent } from "@/server/matching-intent";

const intent = { currentGoal: "To meet people", lookingFor: ["collaborators"], offers: [] } as unknown as SpaceIntent;
const blank = { ...seedProfiles[0], headline: "", bio: "", technicalExperience: "", schoolOrCompany: "", priorProjects: "", startupDescription: "", startupOneLiner: "", skillTags: [], topStrengths: [], canContribute: [], industryTags: [], problemSpaceTags: [], mentorExpertiseTags: [], mentorFunctionalStrengths: [], mentorOffers: [] };

describe("current Space intent", () => {
  it("overrides the old co-founder choice for Kate's collaborator or mentor request", () => {
    expect(intentMatchTypes(intent, ["cofounder_match"])).toEqual(["collaborator_match"]);
    expect(intentMatchTypes({ ...intent, lookingFor: ["mentors"] }, ["cofounder_match"])).toEqual(["mentor_match"]);
    expect(intentMatchTypes({ ...intent, lookingFor: ["Python"] }, ["cofounder_match"])).toEqual(["cofounder_match"]);
  });

  it("requires both computer science and Python evidence for Maya's request", () => {
    const request = { ...intent, currentGoal: "i need someone good with computer science background and good with python" };
    expect(matchesExplicitIntent(request, { ...blank, skillTags: ["Canva", "Finance"] }, intent)).toBe(false);
    expect(matchesExplicitIntent(request, { ...blank, skillTags: ["Python"] }, intent)).toBe(false);
    expect(matchesExplicitIntent(request, { ...blank, headline: "Computer science student", skillTags: ["Python"] }, intent)).toBe(true);
  });

  it("handles Arjun's repeated word and education technology synonyms", () => {
    const request = { ...intent, currentGoal: "Someone who who is interested in edtech" };
    expect(matchesExplicitIntent(request, { ...blank, industryTags: ["Finance"] }, intent)).toBe(false);
    expect(matchesExplicitIntent(request, { ...blank, industryTags: ["Education technology"] }, intent)).toBe(true);
    expect(matchesExplicitIntent(intent, blank, intent)).toBe(true);
  });

  it("does not confuse a target's own search with offered skills", () => {
    const request = { ...intent, currentGoal: "Find people with Python experience" };
    expect(matchesExplicitIntent(request, { ...blank, currentFocus: "Learn Python", helpNeededTags: ["Python"] }, { ...intent, lookingFor: ["Python"] })).toBe(false);
  });
});

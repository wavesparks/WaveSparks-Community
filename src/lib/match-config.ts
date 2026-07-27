import { nanoid } from "nanoid";

import type {
  MatchDirection,
  MatchFactorKey,
  MatchFactorWeights,
  MatchTypeConfig,
} from "@/lib/domain";

export const matchFactorLabels: Record<MatchFactorKey, string> = {
  semantic: "needs and offering",
  skills: "roles and skills",
  venture: "venture context",
  availability: "availability and commitment",
  work_style: "working style",
  location: "location and timezone",
};

export const balancedMatchWeights: MatchFactorWeights = {
  semantic: 30,
  skills: 25,
  venture: 15,
  availability: 15,
  work_style: 10,
  location: 5,
};

const defaultDefinitions: Array<
  Pick<
    MatchTypeConfig,
    | "slug"
    | "name"
    | "description"
    | "direction"
    | "seekerLabel"
    | "providerLabel"
    | "weights"
    | "minimumScore"
  >
> = [
  {
    slug: "cofounder_match",
    name: "Co-founder",
    description: "Meet someone interested in building a company together.",
    direction: "mutual",
    seekerLabel: "I am looking for a co-founder",
    providerLabel: "I am open to being a co-founder",
    weights: {
      semantic: 25,
      skills: 20,
      venture: 15,
      availability: 15,
      work_style: 20,
      location: 5,
    },
    minimumScore: 45,
  },
  {
    slug: "mentor_match",
    name: "Mentor",
    description: "Meet someone who can offer relevant advice and experience.",
    direction: "seeker_provider",
    seekerLabel: "I am looking for a mentor or adviser",
    providerLabel: "I can mentor or advise",
    weights: {
      semantic: 35,
      skills: 30,
      venture: 20,
      availability: 10,
      work_style: 5,
      location: 0,
    },
    minimumScore: 45,
  },
  {
    slug: "collaborator_match",
    name: "Collaborator",
    description: "Meet someone to work with on a project or idea.",
    direction: "mutual",
    seekerLabel: "I am looking for a collaborator or teammate",
    providerLabel: "I am open to collaborating",
    weights: {
      semantic: 30,
      skills: 30,
      venture: 15,
      availability: 15,
      work_style: 5,
      location: 5,
    },
    minimumScore: 45,
  },
];

export function defaultMatchTypeConfigs(orgId: string, now = new Date().toISOString()) {
  return defaultDefinitions.map((definition) => ({
    id: `mtc_${nanoid(8)}`,
    orgId,
    ...definition,
    active: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
  })) satisfies MatchTypeConfig[];
}

export function stableDefaultMatchTypeConfigs(
  orgId: string,
  now = new Date().toISOString(),
) {
  return defaultDefinitions.map((definition) => ({
    id: `mtc_${orgId}_${definition.slug}`,
    orgId,
    ...definition,
    active: true,
    version: 1,
    createdAt: now,
    updatedAt: now,
  })) satisfies MatchTypeConfig[];
}

export function matchTypeSlug(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function validateMatchTypeConfig(input: {
  name: string;
  description: string;
  direction: string;
  seekerLabel: string;
  providerLabel: string;
  minimumScore: number;
  weights: MatchFactorWeights;
}) {
  const errors: string[] = [];
  if (input.name.trim().length < 2 || input.name.trim().length > 60) {
    errors.push("Name must contain 2 to 60 characters.");
  }
  if (input.description.trim().length < 10 || input.description.trim().length > 280) {
    errors.push("Description must contain 10 to 280 characters.");
  }
  if (input.seekerLabel.trim().length < 3 || input.seekerLabel.trim().length > 100) {
    errors.push("The seeking label must contain 3 to 100 characters.");
  }
  if (input.providerLabel.trim().length < 3 || input.providerLabel.trim().length > 100) {
    errors.push("The offering label must contain 3 to 100 characters.");
  }
  if (input.direction !== "mutual" && input.direction !== "seeker_provider") {
    errors.push("Choose how people should be paired.");
  }
  if (!Number.isInteger(input.minimumScore) || input.minimumScore < 35 || input.minimumScore > 80) {
    errors.push("Minimum match quality must be a whole number from 35 to 80.");
  }

  const weights = Object.values(input.weights);
  if (weights.some((weight) => !Number.isInteger(weight) || weight < 0 || weight > 100)) {
    errors.push("Each importance value must be a whole number from 0 to 100.");
  }
  if (weights.reduce((sum, weight) => sum + weight, 0) !== 100) {
    errors.push("Importance values must total 100.");
  }
  return errors;
}

export function parseMatchDirection(value: string): MatchDirection {
  return value === "seeker_provider" ? "seeker_provider" : "mutual";
}

export function legacySeekingMatchTypes(values: string[]) {
  const normalized = new Set(values.map((value) => value.trim().toLowerCase()));
  const slugs: string[] = [];
  if (normalized.has("cofounder") || normalized.has("co-founder")) {
    slugs.push("cofounder_match");
  }
  if (normalized.has("mentor") || normalized.has("advice") || normalized.has("advisor")) {
    slugs.push("mentor_match");
  }
  if (
    normalized.has("collaborator") ||
    normalized.has("collaborators") ||
    normalized.has("teammate") ||
    normalized.has("team mate")
  ) {
    slugs.push("collaborator_match");
  }
  return slugs;
}

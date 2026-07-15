export const postTypes = [
  "general_update",
  "ask",
  "opportunity",
  "looking_for_cofounder",
  "looking_for_mentor",
  "resource",
  "announcement",
] as const;

export const introductionPurposes = [
  "co-founder conversation",
  "mentor guidance",
  "collaboration",
  "general connection",
] as const;

export const memberArchetypes = [
  "founder",
  "cofounder_seeker",
  "mentor",
  "mentee",
  "operator",
  "invited_outsider",
] as const;

export const onboardingSteps = [
  {
    key: "identity",
    title: "About you",
    description: "Share the basics that help people recognize and approach you.",
  },
  {
    key: "interests",
    title: "Interests & experience",
    description: "Start with what sparks your curiosity—no startup or technical background required.",
  },
  {
    key: "connections",
    title: "Connections",
    description: "Share the people, support, and conversations you are generally open to.",
  },
  {
    key: "contact",
    title: "Contact & preferences",
    description: "Set your working preferences and how accepted introductions can reach you.",
  },
] as const;

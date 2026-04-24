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
    title: "Identity & Community",
    description: "Ground each member in the right org, cohort, and credibility cues.",
  },
  {
    key: "startup",
    title: "What You're Building",
    description: "Capture enough startup context to make the feed and matches meaningful.",
  },
  {
    key: "skills",
    title: "What You Need",
    description: "Clarify the roles, strengths, and collaboration asks that others should respond to.",
  },
  {
    key: "compatibility",
    title: "Compatibility & Contact",
    description: "Round out the matching model with style, commitment, and intro preferences.",
  },
] as const;

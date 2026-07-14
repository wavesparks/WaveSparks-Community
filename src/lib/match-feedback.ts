export const matchFeedbackReasonLabels = {
  wrong_intent: "Wrong intent",
  missing_skill: "Missing skill",
  timing: "Timing or availability",
  location: "Location or timezone",
  already_connected: "Already connected",
  other: "Other fit issue",
} as const;

export type MatchFeedbackReason = keyof typeof matchFeedbackReasonLabels;

export function sanitizeMatchFeedbackReasons(values: string[]) {
  const allowed = new Set<string>(Object.keys(matchFeedbackReasonLabels));
  return [...new Set(values.map((value) => value.trim()).filter((value) => allowed.has(value)))];
}

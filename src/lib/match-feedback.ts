export const matchFeedbackReasonLabels = {
  wrong_intent: "Not what I’m looking for",
  missing_skill: "Their experience doesn’t match what I need",
  timing: "Timing or availability",
  location: "Location or timezone",
  already_connected: "Already connected",
  other: "Something else",
} as const;

export type MatchFeedbackReason = keyof typeof matchFeedbackReasonLabels;

export function sanitizeMatchFeedbackReasons(values: string[]) {
  const allowed = new Set<string>(Object.keys(matchFeedbackReasonLabels));
  return [...new Set(values.map((value) => value.trim()).filter((value) => allowed.has(value)))];
}

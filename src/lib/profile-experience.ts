export const technicalExperienceOptions = [
  { value: "not_sure", label: "Not sure yet" },
  { value: "new", label: "New to this" },
  { value: "learning", label: "Learning the basics" },
  { value: "guided", label: "Can make things with guidance" },
  { value: "independent", label: "Can build or design independently" },
  { value: "mentor", label: "Can lead or mentor others" },
] as const;

export function technicalExperienceLabel(value: string) {
  return (
    technicalExperienceOptions.find((option) => option.value === value)?.label ??
    "Not specified"
  );
}

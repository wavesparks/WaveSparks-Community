import { technicalExperienceOptions } from "@/lib/profile-experience";

function field(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export function validateProfileFormData(formData: FormData) {
  const errors: Array<{ field: string; message: string }> = [];
  const email = field(formData, "email_for_intro");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    errors.push({ field: "email_for_intro", message: "Enter a valid intro email." });
  }

  for (const key of ["linkedin_url", "github_url", "website_url", "x_url"] as const) {
    const value = field(formData, key);
    if (!value) continue;

    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Unsupported protocol.");
      }
    } catch {
      errors.push({ field: key, message: "Links must use http:// or https://." });
    }
  }

  const technicalLevel = field(formData, "technical_experience_level");
  if (
    technicalLevel &&
    !technicalExperienceOptions.some((option) => option.value === technicalLevel)
  ) {
    errors.push({
      field: "technical_experience_level",
      message: "Choose one of the displayed experience levels.",
    });
  }

  const maxMentees = field(formData, "max_mentees");
  if (maxMentees) {
    const value = Number(maxMentees);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 100) {
      errors.push({
        field: "max_mentees",
        message: "Enter a whole number from 0 to 100.",
      });
    }
  }

  return { errors, isValid: errors.length === 0 };
}

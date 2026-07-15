export function postTypeLabel(type: string) {
  const labels: Record<string, string> = {
    general_update: "Update",
    ask: "Question",
    resource: "Resource",
    announcement: "Announcement",
    opportunity: "Opportunity",
    looking_for_cofounder: "Looking for a co-founder",
    looking_for_mentor: "Looking for a mentor",
  };
  if (labels[type]) return labels[type];

  const label = type.replaceAll("_", " ").trim();
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : "Post";
}

export function postStatusLabel(status: string) {
  if (status === "active") return "Open";
  if (status === "archived") return "Archived";
  if (status === "hidden") return "Hidden";

  const label = status.replaceAll("_", " ").trim();
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : "Unavailable";
}

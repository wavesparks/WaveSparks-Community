import type { MemberImportResult } from "@/lib/member-import";

export type MemberImportOutcome = {
  body: string;
  title: string;
  tone: "success" | "warning" | "error";
};

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function getMemberImportOutcome(
  result: MemberImportResult,
): MemberImportOutcome {
  const { connected, failed, invited, skipped } = result.summary;
  const added = result.summary.spaceAdded ?? result.summary.cohortAdded;
  const completed = invited + connected + added;
  const completedParts = [
    invited ? `${countLabel(invited, "invitation")} created` : null,
    connected ? `${countLabel(connected, "account")} connected` : null,
    added ? `${countLabel(added, "person", "people")} given access` : null,
  ].filter((part): part is string => Boolean(part));
  const completedSummary = completedParts.join(", ");

  if (failed > 0 && completed === 0) {
    return {
      body: `No invitations or access changes were completed. Review the ${countLabel(
        failed,
        "failed row",
      )} below and try again.`,
      title: "We couldn't complete these changes",
      tone: "error",
    };
  }

  if (failed > 0) {
    return {
      body: `${completedSummary}. ${countLabel(
        failed,
        "row",
      )} failed. Review the details below and retry any invitation that is ready to try again.`,
      title: "Some rows need attention",
      tone: "warning",
    };
  }

  if (completed === 0) {
    return {
      body: skipped
        ? `No changes were needed. Review the ${countLabel(
            skipped,
            "skipped row",
          )} below for details.`
        : "No changes were made. Review the row details below.",
      title: "No changes made",
      tone: "warning",
    };
  }

  return {
    body: `${completedSummary}. Review each row below for the final result.`,
    title:
      invited && (connected || added)
        ? "Invitations and access updated"
        : invited
          ? invited === 1
            ? "Invitation created"
            : "Invitations created"
          : "Access updated",
    tone: "success",
  };
}

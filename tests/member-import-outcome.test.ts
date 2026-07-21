import { describe, expect, it } from "vitest";

import { getMemberImportOutcome } from "@/lib/member-import-outcome";
import type { MemberImportResult } from "@/lib/member-import";

function result(
  summary: MemberImportResult["summary"],
  rowCount = Object.values(summary).reduce((total, count) => total + count, 0),
): MemberImportResult {
  return {
    rows: Array.from({ length: rowCount }, (_, index) => ({
      email: `person-${index}@example.com`,
      message: "",
      name: "",
      normalizedEmail: `person-${index}@example.com`,
      retryable: false,
      rowNumber: index + 1,
      status: "skipped" as const,
    })),
    summary,
  };
}

describe("member import result copy", () => {
  it("describes a successful invitation without claiming email delivery", () => {
    const outcome = getMemberImportOutcome(
      result({
        invited: 1,
        connected: 0,
        spaceAdded: 0,
        cohortAdded: 0,
        skipped: 0,
        failed: 0,
      }),
    );

    expect(outcome).toMatchObject({ tone: "success", title: "Invitation sent" });
    expect(outcome.body).toContain("1 invitation sent");
    expect(outcome.body).not.toMatch(/email delivered/i);
  });

  it("shows an error when every attempted change failed", () => {
    const outcome = getMemberImportOutcome(
      result({
        invited: 0,
        connected: 0,
        spaceAdded: 0,
        cohortAdded: 0,
        skipped: 0,
        failed: 2,
      }),
    );

    expect(outcome).toMatchObject({
      tone: "error",
      title: "We couldn't complete these changes",
    });
    expect(outcome.body).toContain("2 failed rows");
  });

  it("does not present skipped-only results as success", () => {
    expect(
      getMemberImportOutcome(
        result({
          invited: 0,
          connected: 0,
          spaceAdded: 0,
          cohortAdded: 0,
          skipped: 3,
          failed: 0,
        }),
      ),
    ).toMatchObject({ tone: "warning", title: "No changes made" });
  });

  it("separates completed changes from failures", () => {
    const outcome = getMemberImportOutcome(
      result({
        invited: 1,
        connected: 1,
        spaceAdded: 1,
        cohortAdded: 1,
        skipped: 0,
        failed: 1,
      }),
    );

    expect(outcome).toMatchObject({
      tone: "warning",
      title: "Some rows need attention",
    });
    expect(outcome.body).toContain("1 row failed");
  });
});

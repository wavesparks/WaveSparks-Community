import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(process.cwd(), "drizzle/0016_right_nocturne.sql"),
  "utf8",
);
const snapshots = ["0016_snapshot.json", "0017_snapshot.json"].map((file) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "drizzle/meta", file), "utf8")),
);

describe("mentor designation data migration", () => {
  it("adds independent mentor and intro classifications with safe defaults", () => {
    expect(migration).toContain(
      `CREATE TYPE "public"."mentor_status" AS ENUM('not_mentor', 'needs_review', 'approved')`,
    );
    expect(migration).toContain(
      `"mentor_status" "mentor_status" DEFAULT 'not_mentor' NOT NULL`,
    );
    expect(migration).toContain(
      `CREATE TYPE "public"."intro_kind" AS ENUM('general', 'mentoring')`,
    );
    expect(migration).toContain(`"kind" "intro_kind" DEFAULT 'general' NOT NULL`);
  });

  it("queues legacy mentor signals for review without approving them", () => {
    expect(migration).toMatch(
      /SET "mentor_status" = 'needs_review'[\s\S]*"mentor_status" = 'not_mentor'[\s\S]*"affiliation_type" = 'mentor'[\s\S]*ANY\("archetypes"\)/,
    );
    expect(migration).toContain(`lower(btrim("profile"."current_status")) = 'mentor'`);
    expect(migration).toContain(`'mentor_match' = ANY("profile"."offering_match_types")`);
    expect(migration).toContain(`cardinality("profile"."mentor_offers") > 0`);
    expect(migration).toContain(`"profile"."max_mentees" IS NOT NULL`);
    expect(migration).not.toMatch(/SET "mentor_status" = 'approved'/);
  });

  it("classifies only explicit legacy mentoring requests", () => {
    expect(migration).toMatch(
      /SET "kind" = 'mentoring'[\s\S]*"intro_purpose"\)\) = 'mentor guidance'/,
    );
    expect(migration).toMatch(/"match"\."match_type" = 'mentor_match'/);
    expect(migration).toMatch(
      /"receiver"\."mentor_status" IN \('needs_review', 'approved'\)/,
    );
  });

  it("binds mentor reviewers to the reviewed membership organization", () => {
    expect(migration).toContain(
      `FOREIGN KEY ("mentor_reviewed_by_membership_id","org_id") REFERENCES "public"."memberships"("id","org_id") ON DELETE restrict`,
    );
    for (const snapshot of snapshots) {
      expect(
        snapshot.tables["public.memberships"].foreignKeys[
          "memberships_mentor_reviewer_fk"
        ],
      ).toMatchObject({
        columnsFrom: ["mentor_reviewed_by_membership_id", "org_id"],
        columnsTo: ["id", "org_id"],
        onDelete: "restrict",
      });
    }
  });
});

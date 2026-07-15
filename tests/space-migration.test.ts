import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function migration(name: string) {
  return readFileSync(resolve(process.cwd(), "drizzle", name), "utf8");
}

describe("Space migration safety", () => {
  it("stops before backfill for duplicate, cross-org, and suspended legacy data", () => {
    const sql = migration("0009_unified_spaces.sql");

    expect(sql).toContain("0009 preflight: duplicate organization membership");
    expect(sql).toContain("0009 preflight: duplicate cohort membership");
    expect(sql).toContain("0009 preflight: orphan or cross-organization cohort membership");
    expect(sql).toContain(
      "0009 preflight: rejected/suspended membership still belongs to a cohort",
    );
    expect(sql).toContain('OR ps."org_id" <> p."org_id" OR ps."org_id" <> m."org_id"');
  });

  it("validates the deterministic backfill before Space reads are switched", () => {
    const sql = migration("0009_unified_spaces.sql");

    expect(sql).toContain(
      "0009 postflight: every organization must have exactly one Main space",
    );
    expect(sql).toContain(
      "0009 postflight: cohort membership was not mapped to active Event access",
    );
    expect(sql).toContain("0009 postflight: Space-scoped resource has null space_id");
    expect(sql).not.toContain("ON CONFLICT");
  });

  it("adds composite organization constraints after the expand/backfill migration", () => {
    const sql = migration("0010_space_integrity_constraints.sql");

    expect(sql).toContain("space_memberships_space_membership_org_idx");
    expect(sql).toContain("space_intents_space_membership_fk");
    expect(sql).toContain("posts_author_org_fk");
    expect(sql).toContain("intro_requests_requester_org_fk");
  });
});

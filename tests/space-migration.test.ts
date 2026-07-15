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

  it("renames the member-facing community without changing stable ids or slugs", () => {
    const sql = migration("0011_wavesparks_community_name.sql");

    expect(sql).toContain("'Wavesparks Community'");
    expect(sql).toContain('WHERE\n\t"kind" = \'main\'');
    expect(sql).toContain("replace(\"title\", 'Main Community', 'Wavesparks Community')");
    expect(sql).toContain("Meet someone interested in building a company together.");
    expect(sql).not.toContain('UPDATE "spaces"\nSET\n\t"slug"');
  });

  it("adds and backfills the inclusive onboarding profile fields", () => {
    const sql = migration("0012_lively_nuke.sql");

    expect(sql).toContain('ADD COLUMN "bio"');
    expect(sql).toContain('ADD COLUMN "current_focus"');
    expect(sql).toContain('ADD COLUMN "technical_experience"');
    expect(sql).toContain('WHEN NULLIF(BTRIM("long_bio"), \'\') IS NULL');
    expect(sql).toContain('ELSE BTRIM("short_bio") || E\'\\n\\n\' || BTRIM("long_bio")');
    expect(sql).toContain('"problem_interest" = "startup_description"');
    expect(sql).toContain('NULLIF(BTRIM("startup_one_liner"), \'\')');
    expect(sql).toContain('NULLIF(BTRIM("startup_description"), \'\')');
    expect(sql).toContain('NULLIF(BTRIM("headline"), \'\')');
    expect(sql).toContain('"technical_experience_level" = \'not_sure\'');
    expect(sql).not.toContain('WHEN "years_of_experience" <=');
    expect(sql).toContain('"technical_experience" = "prior_projects"');
    expect(sql).toContain('"profile_completion_percent" = CASE');
    expect(sql).toContain('WHEN "onboarding_complete" THEN 100');
    expect(sql).toContain('CARDINALITY("seeking_match_types") > 0');
    expect(sql).toContain('"onboarding_complete" OR (');
  });
});

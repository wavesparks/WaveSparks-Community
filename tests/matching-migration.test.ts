import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0017_motionless_mad_thinker.sql"),
  "utf8",
);

describe("hybrid-v4 matching migration", () => {
  it("makes the algorithm version and score range database invariants", () => {
    expect(migration).toContain(
      `ALTER TABLE "matches" ALTER COLUMN "algorithm_version" SET DEFAULT 'hybrid-v4'`,
    );
    expect(migration).toContain(
      `CONSTRAINT "matches_score_range_check" CHECK ("matches"."score" BETWEEN 1 AND 100)`,
    );
  });

  it("removes invalid scores without discarding versioned state before recompute", () => {
    expect(migration).toContain(`WHERE "score" NOT BETWEEN 1 AND 100`);
    expect(migration).not.toContain(`DELETE FROM "matches"\nWHERE "algorithm_version"`);
    expect(migration.indexOf(`DELETE FROM "matches"`)).toBeLessThan(
      migration.indexOf(`ADD CONSTRAINT "matches_score_range_check"`),
    );
  });

  it("updates only untouched legacy default weights", () => {
    expect(migration).toContain(
      `'cofounder_match' AND "weights_json" = '{"semantic":30,"skills":20,"venture":10,"availability":15,"work_style":15,"location":10}'::jsonb`,
    );
    expect(migration).toContain(
      `'cofounder_match' THEN '{"semantic":25,"skills":20,"venture":15,"availability":15,"work_style":20,"location":5}'::jsonb`,
    );
    expect(migration).toContain(`"version" = "version" + 1`);
  });
});

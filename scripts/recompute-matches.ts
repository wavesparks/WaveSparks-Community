import { loadScriptEnv } from "./load-script-env";
import { assertWriteAllowed, databaseTarget, readScriptTarget } from "./script-safety";

async function main() {
  const target = readScriptTarget();
  loadScriptEnv(target.environment);
  const { env } = await import("@/lib/env");
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }
  console.info(
    `Match recompute target: ${target.environment} (${databaseTarget(env.databaseUrl)}).`,
  );
  if (!assertWriteAllowed(target)) {
    console.info("Dry run only. Re-run with --apply to recompute matches.");
    return;
  }

  const { recomputeMatchesForOrg } = await import("@/server/store");
  const matches = await recomputeMatchesForOrg("org_wavespark");
  console.info(`Recomputed ${matches.length} matches for Wavesparks.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { loadScriptEnv } from "./load-script-env";
import { assertWriteAllowed, databaseTarget, readScriptTarget } from "./script-safety";

async function main() {
  const target = readScriptTarget();
  loadScriptEnv(target.environment);
  const { env } = await import("@/lib/env");
  const { getMigrationDb, getSqlClient } = await import("@/db/client");

  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }
  console.info(`Migration target: ${target.environment} (${databaseTarget(env.databaseUrl)}).`);
  if (!assertWriteAllowed(target)) {
    console.info("Dry run only. Re-run with --apply to execute migrations.");
    return;
  }

  const db = getMigrationDb();
  await db.execute(sql`create extension if not exists vector;`);
  await migrate(db, { migrationsFolder: "drizzle" });
  await getSqlClient().end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

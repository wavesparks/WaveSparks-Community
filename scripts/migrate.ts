import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { loadScriptEnv } from "./load-script-env";

async function main() {
  loadScriptEnv("production");
  const { env } = await import("@/lib/env");
  const { getMigrationDb, getSqlClient } = await import("@/db/client");

  if (!env.databaseUrl) {
    console.info("DATABASE_URL not configured. Skipping migrations.");
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

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { env } from "@/lib/env";
import { getMigrationDb, getSqlClient } from "@/db/client";

async function main() {
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

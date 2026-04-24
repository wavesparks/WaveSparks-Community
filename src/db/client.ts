import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import { env } from "@/lib/env";
import * as schema from "@/db/schema";

let _client: postgres.Sql | undefined;

function createClient() {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return postgres(env.databaseUrl, { max: 1 });
}

export function getSqlClient() {
  if (!_client) {
    _client = createClient();
  }

  return _client;
}

export function getDb() {
  return drizzle(getSqlClient(), { schema });
}

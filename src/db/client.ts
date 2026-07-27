import postgres from "postgres";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle } from "drizzle-orm/postgres-js";

import { env } from "@/lib/env";
import * as schema from "@/db/schema";

let _client: postgres.Sql | undefined;
let _db: ReturnType<typeof drizzleNeonHttp<typeof schema>> | undefined;
let _transactionDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

function createClient() {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return postgres(env.databaseUrl, { max: 1 });
}

export function createDedicatedSqlClient() {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return postgres(env.databaseUrl, { max: 1, prepare: false });
}

export function getSqlClient() {
  if (!_client) {
    _client = createClient();
  }

  return _client;
}

export function getDb() {
  if (!_db) {
    if (!env.databaseUrl) {
      throw new Error("DATABASE_URL is not configured.");
    }

    _db = drizzleNeonHttp(neon(env.databaseUrl), { schema });
  }

  return _db;
}

export function getTransactionDb() {
  if (!_transactionDb) {
    _transactionDb = drizzle(getSqlClient(), { schema });
  }

  return _transactionDb;
}

export function getMigrationDb() {
  return getTransactionDb();
}

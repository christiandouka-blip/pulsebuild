/**
 * Server-only PostgreSQL client. Lazy: importing this module does not connect.
 *
 * Never import from components/, store/, domain engines, Agent, or Voice.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/drizzle/schema";
import { isProductionRuntime, type EnvRecord } from "@/lib/auth/runtimeMode";

export type Database = PostgresJsDatabase<typeof schema>;

let queryClient: ReturnType<typeof postgres> | undefined;
let database: Database | undefined;

export function getDatabaseUrl(env: EnvRecord = process.env): string | undefined {
  const url = env.DATABASE_URL?.trim();
  return url ? url : undefined;
}

export function requireDatabaseUrl(env: EnvRecord = process.env): string {
  const url = getDatabaseUrl(env);
  if (!url) {
    throw new Error("DATABASE_URL is required for production database access.");
  }
  return url;
}

export function getDb(env: EnvRecord = process.env): Database {
  if (!isProductionRuntime(env)) {
    throw new Error(
      "Database client is unavailable in demo/test mode. Set PULSEBUILD_RUNTIME_MODE=production.",
    );
  }

  const url = requireDatabaseUrl(env);
  if (!database) {
    queryClient = postgres(url, { max: 1, idle_timeout: 20 });
    database = drizzle(queryClient, { schema });
  }
  return database;
}

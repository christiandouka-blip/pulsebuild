import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type LiveDatabaseConfig = {
  databaseUrl: string;
  runtimeMode: string;
  envFileExists: boolean;
  databaseUrlStatus: "SET" | "EMPTY" | "UNSET";
  runtimeModeStatus: "SET" | "EMPTY" | "UNSET";
  usesPooledHost: boolean;
};

function classify(value: string | undefined): "SET" | "EMPTY" | "UNSET" {
  if (value === undefined) return "UNSET";
  if (!value.trim()) return "EMPTY";
  return "SET";
}

function parseEnvFile(path: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!existsSync(path)) return parsed;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

/**
 * Read live database configuration from .env.local without mutating
 * process.env. Callers must not log the URL.
 */
export function readLiveDatabaseConfig(): LiveDatabaseConfig | null {
  const fileEnv = parseEnvFile(resolve(".env.local"));
  const databaseUrl = (fileEnv.DATABASE_URL ?? process.env.DATABASE_URL)?.trim();
  const runtimeMode = (
    fileEnv.PULSEBUILD_RUNTIME_MODE ?? process.env.PULSEBUILD_RUNTIME_MODE
  )?.trim();
  const databaseUrlStatus = classify(databaseUrl);
  const runtimeModeStatus = classify(runtimeMode);
  if (databaseUrlStatus !== "SET") {
    return null;
  }
  let usesPooledHost = false;
  try {
    usesPooledHost = /pooler/i.test(new URL(databaseUrl!).hostname);
  } catch {
    usesPooledHost = false;
  }
  return {
    databaseUrl: databaseUrl!,
    runtimeMode: runtimeMode || "UNSET",
    envFileExists: existsSync(resolve(".env.local")),
    databaseUrlStatus,
    runtimeModeStatus,
    usesPooledHost,
  };
}

export function liveDatabaseUnavailableMessage(): string {
  return "LIVE DATABASE INTEGRATION TEST: SKIPPED — DATABASE_URL NOT CONFIGURED";
}

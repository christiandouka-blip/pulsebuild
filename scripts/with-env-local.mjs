/**
 * Load gitignored .env.local into the process environment, then run a command.
 * Never prints secret values.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function sanitize(text) {
  return text
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-db-url]")
    .replace(/DATABASE_URL\s*=\s*\S+/gi, "DATABASE_URL=[redacted]");
}

function loadEnvLocal() {
  const envPath = resolve(".env.local");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("with-env-local: missing command");
  process.exit(1);
}

const child = spawn(args[0], args.slice(1), {
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => {
  process.stdout.write(sanitize(String(chunk)));
});
child.stderr.on("data", (chunk) => {
  process.stderr.write(sanitize(String(chunk)));
});
child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});

import { defineConfig } from "drizzle-kit";

/**
 * Schema/migration config. Credentials come only from process.env.
 * Never hardcode DATABASE_URL. drizzle-kit check works without a URL.
 */
const databaseUrl = process.env.DATABASE_URL?.trim();

export default defineConfig({
  schema: "./drizzle/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});

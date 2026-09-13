/**
 * Server/data-layer schema re-export.
 *
 * Do not import from components/, store/, or domain engines.
 * No live database client is created in this module.
 * Use lib/db/client.ts on the server only.
 */

export * from "@/drizzle/schema";

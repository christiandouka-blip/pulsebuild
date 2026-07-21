import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest config for deterministic engine unit tests only (Phase 3A).
 * The "@/" alias mirrors tsconfig paths. No jsdom or DOM environment: engines
 * are pure and run in the default node environment.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.spec.ts"],
    environment: "node",
  },
});

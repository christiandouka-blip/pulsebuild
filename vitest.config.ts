import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./", import.meta.url)),
};

/**
 * Unit tests stay fast and isolated from PostgreSQL.
 * Live integration tests use a longer timeout and never share the memory backend.
 */
export default defineConfig({
  resolve: { alias },
  test: {
    environment: "node",
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/**/*.spec.ts"],
          exclude: ["tests/integration/**"],
          environment: "node",
          testTimeout: 5_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: "live",
          include: ["tests/integration/**/*.spec.ts"],
          environment: "node",
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});

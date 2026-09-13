import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPOSITORY_TOKENS = [
  "@/lib/db",
  "@/lib/repositories",
  "drizzle-orm",
  "createPostgresProjectRepository",
  "selectProjectRepository",
];

const CLOCK_TOKENS = [
  "Date.now(",
  "Math.random(",
  "randomUUID",
  "setTimeout(",
  "setInterval(",
];

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

describe("Phase 5C source boundaries", () => {
  it("engines, decisions, effects, recovery, Agent, and Voice import no repository or DB code", () => {
    const files = [
      ...listFiles("domain/engines"),
      ...listFiles("domain/decisions"),
      ...listFiles("domain/effects"),
      ...listFiles("domain/recovery"),
      ...listFiles("domain/agent"),
      ...listFiles("domain/voice"),
    ];
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const token of REPOSITORY_TOKENS) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });

  it("client stores import no production repository", () => {
    for (const file of listFiles("store")) {
      const source = readFileSync(file, "utf8");
      for (const token of REPOSITORY_TOKENS) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });

  it("client components import no repository or database code", () => {
    for (const file of listFiles("components")) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      const source = readFileSync(file, "utf8");
      for (const token of REPOSITORY_TOKENS) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });

  it("production repository files do not read the system clock or inject randomness", () => {
    const files = listFiles("lib/repositories");
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const token of CLOCK_TOKENS) {
        expect(source.includes(token), `${file} contains ${token}`).toBe(false);
      }
      expect(
        source.includes("validateHarborPointSeedSnapshot"),
        `${file} invokes Harbor Point seed validation`,
      ).toBe(false);
      if (!file.endsWith("demoProjectRepository.ts")) {
        expect(
          source.includes("getInitialProjectSnapshot"),
          `${file} mixes demo seed loading into production`,
        ).toBe(false);
      }
    }
  });
});

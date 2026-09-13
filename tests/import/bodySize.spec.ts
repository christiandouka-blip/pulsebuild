import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  IMPORT_SERVER_ACTION_BODY_SIZE_BYTES,
  IMPORT_SERVER_ACTION_BODY_SIZE_LIMIT,
  VERCEL_FUNCTION_BODY_LIMIT_BYTES,
  importBodyLimitCoversApprovedUpload,
  importEnvelopeFitsVercelFunctionLimit,
} from "@/lib/import/bodySize";
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_FILE_LABEL,
  guardImportFile,
} from "@/lib/import/fileGuard";

function csvBytes(size: number): Uint8Array {
  return new Uint8Array(size).fill(0x61);
}

describe("Phase 5H.1 import body-size contract", () => {
  it("keeps the application 4 MB guard", () => {
    expect(MAX_IMPORT_FILE_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_IMPORT_FILE_LABEL).toBe("4 MB");
  });

  it("accepts a file below 4 MB", () => {
    const result = guardImportFile({
      filename: "pilot.csv",
      bytes: csvBytes(MAX_IMPORT_FILE_BYTES - 1),
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a file of exactly 4 MB", () => {
    const result = guardImportFile({
      filename: "pilot.csv",
      bytes: csvBytes(MAX_IMPORT_FILE_BYTES),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a file over 4 MB and reports the 4 MB contract", () => {
    const result = guardImportFile({
      filename: "pilot.csv",
      bytes: csvBytes(MAX_IMPORT_FILE_BYTES + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe("file.too_large");
      expect(result.issues[0]?.message).toContain("4 MB");
      expect(result.issues[0]?.message).not.toContain("5 MB");
    }
  });

  it("no longer allows the previous 5 MB upload", () => {
    const result = guardImportFile({
      filename: "pilot.csv",
      bytes: csvBytes(5 * 1024 * 1024),
    });
    expect(result.ok).toBe(false);
  });

  it("keeps the Next.js parse limit under the Vercel Function ceiling", () => {
    expect(IMPORT_SERVER_ACTION_BODY_SIZE_LIMIT).toBe("4352kb");
    expect(IMPORT_SERVER_ACTION_BODY_SIZE_BYTES).toBe(
      4 * 1024 * 1024 + 256 * 1024,
    );
    expect(VERCEL_FUNCTION_BODY_LIMIT_BYTES).toBe(Math.floor(4.5 * 1024 * 1024));
    expect(importBodyLimitCoversApprovedUpload()).toBe(true);
    expect(importEnvelopeFitsVercelFunctionLimit()).toBe(true);
    expect(IMPORT_SERVER_ACTION_BODY_SIZE_BYTES).toBeLessThan(
      VERCEL_FUNCTION_BODY_LIMIT_BYTES,
    );
  });

  it("wires that Next.js limit without claiming to override Vercel", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config.includes(`bodySizeLimit: "${IMPORT_SERVER_ACTION_BODY_SIZE_LIMIT}"`)).toBe(
      true,
    );
    expect(config.includes("does not override")).toBe(true);
    expect(config.includes("6mb")).toBe(false);
  });

  it("does not enable the csv-parse columns pollution options", () => {
    const source = readFileSync("lib/import/parseCsv.ts", "utf8");
    expect(source.includes("columns:")).toBe(false);
    expect(source.includes("group_columns_by_name")).toBe(false);
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PROJECT_SNAPSHOT_READ_ISOLATION } from "@/lib/repositories/postgresProjectWorldSource";
import {
  PROJECT_LOAD_QUERY_TABLES,
  tenantScopedProjectSelectSql,
} from "@/lib/repositories/postgresProjectQueries";

describe("postgres project query boundary", () => {
  it("scopes the root project select by id and organizationId", () => {
    const query = tenantScopedProjectSelectSql("proj-1", "org-1");
    expect(query.sql).toContain("organization_id");
    expect(query.params).toEqual(expect.arrayContaining(["proj-1", "org-1"]));
  });

  it("does not expose an unscoped loadProjectById production path", () => {
    const source = readFileSync(
      "lib/repositories/postgresProjectWorldSource.ts",
      "utf8",
    );
    expect(source).not.toContain("loadProjectById");
    expect(source).toContain("tenantScopedProjectWhere");
    expect(source).toContain("repeatable read");
  });

  it("loads one bounded query per construction table", () => {
    expect(PROJECT_LOAD_QUERY_TABLES).toHaveLength(15);
    expect(new Set(PROJECT_LOAD_QUERY_TABLES).size).toBe(15);
  });

  it("uses repeatable-read read-only isolation", () => {
    expect(PROJECT_SNAPSHOT_READ_ISOLATION).toEqual({
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  });
});

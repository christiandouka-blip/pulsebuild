import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { authorizeProjectCreateRequest } from "@/lib/auth/authorize";
import { normalizeImportDate } from "@/domain/import/dates";
import { normalizeTaskState } from "@/domain/import/taskStateMap";
import { normalizeTaskType } from "@/domain/import/taskTypeMap";
import { createFixedClock } from "@/lib/import/clock";
import { guardImportFile, MAX_IMPORT_FILE_BYTES } from "@/lib/import/fileGuard";
import { MemoryImportBackend } from "@/lib/import/memoryBackend";
import { normalizeWorkbook } from "@/lib/import/normalizeWorkbook";
import { parseCsvWorkbook } from "@/lib/import/parseCsv";
import { parseXlsxWorkbook } from "@/lib/import/parseXlsx";
import { writeXlsxWorkbook } from "@/lib/import/xlsxIo";
import {
  confirmImportJob,
  createParsedImportJob,
  loadImportJobForTenant,
} from "@/lib/import/service";
import { validateNormalizedImport } from "@/lib/import/validateNormalized";
import { validateHarborPointSeedSnapshot } from "@/domain/validation/validateHarborPointSeedSnapshot";
import { validateProjectSnapshot } from "@/domain/validation/validateProjectSnapshot";
import {
  makeMembership,
  makeUser,
  MemoryIdentityDirectory,
} from "@/tests/auth/memoryDirectory";
import {
  IMPORT_CLOCK,
  ownerAuth,
  roleAuth,
  sheetsToCsv,
  VALID_SETUP,
  validSheets,
} from "@/tests/import/fixtures";

const clock = createFixedClock(IMPORT_CLOCK);

function csvBytes(sheets = validSheets()): Uint8Array {
  return new TextEncoder().encode(sheetsToCsv(sheets));
}

function xlsxBytes(sheets = validSheets()): Uint8Array {
  return writeXlsxWorkbook(
    sheets.map((sheet) => ({ name: sheet.sheet, rows: sheet.rows })),
  );
}

describe("Phase 5D authorization", () => {
  async function directory() {
    const memory = new MemoryIdentityDirectory();
    memory.users.set("owner-a", makeUser("owner-a", "owner-a@pulsebuild.test"));
    memory.users.set("pm-a", makeUser("pm-a", "pm-a@pulsebuild.test"));
    memory.users.set("super-a", makeUser("super-a", "super-a@pulsebuild.test"));
    memory.users.set("viewer-a", makeUser("viewer-a", "viewer-a@pulsebuild.test"));
    memory.memberships.push(
      makeMembership("owner-a", "org-a", "Owner"),
      makeMembership("pm-a", "org-a", "ProjectManager"),
      makeMembership("super-a", "org-a", "Superintendent"),
      makeMembership("viewer-a", "org-a", "Viewer"),
    );
    return memory;
  }

  it("allows Owner to create/import a project", async () => {
    const result = await authorizeProjectCreateRequest({
      identity: { userId: "owner-a", email: "o@x", displayName: "O" },
      organizationId: "org-a",
      directory: await directory(),
    });
    expect(result.status).toBe("Authorized");
  });

  it("denies ProjectManager new-project import", async () => {
    const result = await authorizeProjectCreateRequest({
      identity: { userId: "pm-a", email: "p@x", displayName: "P" },
      organizationId: "org-a",
      directory: await directory(),
    });
    expect(result.status).toBe("CapabilityDenied");
  });

  it("denies Superintendent", async () => {
    const result = await authorizeProjectCreateRequest({
      identity: { userId: "super-a", email: "s@x", displayName: "S" },
      organizationId: "org-a",
      directory: await directory(),
    });
    expect(result.status).toBe("CapabilityDenied");
  });

  it("denies Viewer", async () => {
    const result = await authorizeProjectCreateRequest({
      identity: { userId: "viewer-a", email: "v@x", displayName: "V" },
      organizationId: "org-a",
      directory: await directory(),
    });
    expect(result.status).toBe("CapabilityDenied");
  });
});

describe("Phase 5D file guard and parsers", () => {
  it("accepts CSV and XLSX", () => {
    expect(guardImportFile({ filename: "a.csv", bytes: csvBytes() }).ok).toBe(true);
    expect(guardImportFile({ filename: "a.xlsx", bytes: xlsxBytes() }).ok).toBe(true);
  });

  it("rejects unsupported and macro-enabled types", () => {
    expect(guardImportFile({ filename: "a.exe", bytes: csvBytes() }).ok).toBe(false);
    expect(guardImportFile({ filename: "a.xlsm", bytes: xlsxBytes() }).ok).toBe(false);
  });

  it("rejects oversized, empty, and excessive-row files", () => {
    expect(guardImportFile({ filename: "a.csv", bytes: new Uint8Array() }).ok).toBe(
      false,
    );
    expect(
      guardImportFile({
        filename: "a.csv",
        bytes: new Uint8Array(MAX_IMPORT_FILE_BYTES + 1),
      }).ok,
    ).toBe(false);
    const rows = ["id,name,phase_id,status,task_type,planned_start,planned_end"];
    for (let i = 0; i < 5001; i += 1) {
      rows.push(`t${i},T,phase-structure,Planned,concrete,2026-01-01,2026-01-02`);
    }
    const parsed = parseCsvWorkbook(new TextEncoder().encode(rows.join("\n")));
    expect(parsed.issues.some((item) => item.code === "file.too_many_rows")).toBe(
      true,
    );
  });

  it("parses CSV headers and XLSX approved sheets", () => {
    const csv = parseCsvWorkbook(csvBytes());
    expect(csv.sheets.some((sheet) => sheet.sheet === "Tasks")).toBe(true);
    const xlsx = parseXlsxWorkbook(xlsxBytes());
    expect(xlsx.sheets.map((sheet) => sheet.sheet)).toContain("Phases");
  });

  it("does not execute spreadsheet formulas", () => {
    const bytes = writeXlsxWorkbook([
      {
        name: "Tasks",
        rows: [
          ["id", "name"],
          ["task-1", ""],
        ],
        cells: { B2: { t: "str", v: "", f: "1+1" } },
      },
    ]);
    const parsed = parseXlsxWorkbook(bytes);
    const name = parsed.sheets[0].rows[1]?.[1];
    expect(name).not.toBe("2");
    expect(name === "" || parsed.issues.some((item) => item.code === "xlsx.formula_without_value")).toBe(
      true,
    );
  });

  it("ignores unknown sheets and columns", () => {
    const sheets = validSheets();
    sheets.push({ sheet: "Notes", rows: [["hello"], ["world"]] });
    sheets[2].rows[0].push("custom_column");
    sheets[2].rows[1].push("ignored");
    const result = normalizeWorkbook({ sheets, setup: VALID_SETUP });
    expect(
      result.issues.some((item) => item.code === "sheet.unmapped"),
    ).toBe(true);
    expect(
      result.issues.some((item) => item.code === "column.unmapped"),
    ).toBe(true);
  });
});

describe("Phase 5D normalization", () => {
  it("maps supported TaskState and TaskType values", () => {
    expect(normalizeTaskState("Not Started")).toEqual({ status: "Planned" });
    expect(normalizeTaskState("In Progress")).toEqual({ status: "Executing" });
    expect(normalizeTaskState("Complete")).toEqual({ status: "Completed" });
    expect(normalizeTaskType("electrical rough")).toEqual({
      taskType: "electrical_rough",
    });
  });

  it("errors on unsupported TaskState and TaskType", () => {
    expect(normalizeTaskState("Almost Done")).toEqual({ unknown: "Almost Done" });
    expect(normalizeTaskType("welding")).toEqual({ unknown: "welding" });
  });

  it("normalizes ISO and Excel dates and uses project timezone", () => {
    const iso = normalizeImportDate("2026-03-14", "America/Chicago");
    expect(iso).toEqual({ ok: true, value: "2026-03-14", kind: "date" });
    const wall = normalizeImportDate("2026-03-14 09:00:00", "America/Chicago");
    expect(wall.ok).toBe(true);
    if (wall.ok) {
      expect(wall.value).toContain("2026-03-14");
    }
    const serial = normalizeImportDate(45314, "America/Chicago");
    expect(serial.ok).toBe(true);
  });

  it("rejects ambiguous and invalid dates", () => {
    expect(normalizeImportDate("03/14/2026", "America/Chicago").ok).toBe(false);
    expect(normalizeImportDate("not-a-date", "America/Chicago").ok).toBe(false);
  });
});

describe("Phase 5D relationships and validation", () => {
  it("resolves dependencies, requirements, inspection and permit targets", () => {
    const normalized = normalizeWorkbook({
      sheets: validSheets(),
      setup: VALID_SETUP,
    });
    const issues = validateNormalizedImport(
      normalized.staging,
      "phase-structure",
    );
    expect(issues.filter((item) => item.severity === "Error")).toEqual([]);
    expect(normalized.staging.tasks[1].dependencyExternalIds).toEqual([
      "task-foundation",
    ]);
    expect(normalized.staging.inspections[0].requiredBeforeTaskExternalId).toBe(
      "task-pour",
    );
    expect(normalized.staging.permits[0].requiredForTaskExternalId).toBe(
      "task-pour",
    );
  });

  it("errors on missing dependency, self-dependency, and cycles", () => {
    const missing = validSheets();
    missing[2].rows[2][9] = "task-missing";
    const self = validSheets();
    self[2].rows[1][9] = "task-foundation";
    const cycle = validSheets();
    cycle[2].rows[1][9] = "task-pour";

    expect(
      validateNormalizedImport(
        normalizeWorkbook({ sheets: missing, setup: VALID_SETUP }).staging,
        "phase-structure",
      ).some((item) => item.code === "task.dependency_missing"),
    ).toBe(true);
    expect(
      validateNormalizedImport(
        normalizeWorkbook({ sheets: self, setup: VALID_SETUP }).staging,
        "phase-structure",
      ).some((item) => item.code === "task.self_dependency"),
    ).toBe(true);
    expect(
      validateNormalizedImport(
        normalizeWorkbook({ sheets: cycle, setup: VALID_SETUP }).staging,
        "phase-structure",
      ).some((item) => item.code === "task.dependency_cycle"),
    ).toBe(true);
  });

  it("allows requirement/assignment mismatch", () => {
    const sheets = validSheets();
    sheets[3].rows[1][6] = "task-foundation";
    const staging = normalizeWorkbook({ sheets, setup: VALID_SETUP }).staging;
    const pour = staging.tasks.find((task) => task.externalId === "task-pour");
    expect(pour?.requiredCrewExternalIds).toEqual(["crew-a"]);
    expect(staging.crews[0].currentTaskExternalId).toBe("task-foundation");
    expect(
      validateNormalizedImport(staging, "phase-structure").filter(
        (item) => item.severity === "Error",
      ),
    ).toEqual([]);
  });

  it("errors on duplicate ids, missing required fields, and invalid timezone", () => {
    const dup = validSheets();
    dup[2].rows.push([...dup[2].rows[1]]);
    expect(
      validateNormalizedImport(
        normalizeWorkbook({ sheets: dup, setup: VALID_SETUP }).staging,
        "phase-structure",
      ).some((item) => item.code === "task.duplicate_external_id"),
    ).toBe(true);

    const missingName = validSheets();
    missingName[2].rows[1][1] = "";
    expect(
      normalizeWorkbook({ sheets: missingName, setup: VALID_SETUP }).issues.some(
        (item) => item.field === "name",
      ),
    ).toBe(true);

    expect(
      validateNormalizedImport(
        normalizeWorkbook({
          sheets: validSheets(),
          setup: { ...VALID_SETUP, timezone: "Not/AZone" },
        }).staging,
        "phase-structure",
      ).some((item) => item.code === "project.timezone_invalid"),
    ).toBe(true);
  });

  it("requires current phase before confirmation", () => {
    const staging = normalizeWorkbook({
      sheets: validSheets(),
      setup: { ...VALID_SETUP, currentPhaseExternalId: "" },
    }).staging;
    staging.project.currentPhaseExternalId = undefined;
    expect(
      validateNormalizedImport(staging, null).some(
        (item) => item.code === "project.current_phase_required",
      ),
    ).toBe(true);
  });
});

describe("Phase 5D import service", () => {
  it("keeps imports inside the authenticated organization", async () => {
    const backend = new MemoryImportBackend();
    const created = await createParsedImportJob({
      authorization: ownerAuth("org-a"),
      setup: VALID_SETUP,
      filename: "job.csv",
      bytes: csvBytes(),
      clock,
      store: backend,
    });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;
    expect(created.job.organizationId).toBe("org-a");

    const cross = await loadImportJobForTenant({
      authorization: ownerAuth("org-b", "owner-b"),
      importId: created.job.id,
      store: backend,
    });
    expect(cross.status).toBe("not_found");

    const confirmCross = await confirmImportJob({
      authorization: ownerAuth("org-b", "owner-b"),
      importId: created.job.id,
      acknowledgeWarnings: true,
      clock,
      store: backend,
      persistence: backend,
    });
    expect(confirmCross.status).toBe("not_found");
  });

  it("does not persist before confirm and rejects remaining errors", async () => {
    const backend = new MemoryImportBackend();
    const created = await createParsedImportJob({
      authorization: ownerAuth(),
      setup: VALID_SETUP,
      filename: "job.csv",
      bytes: csvBytes(),
      clock,
      store: backend,
    });
    expect(created.status).toBe("created");
    expect(backend.projects.size).toBe(0);
    if (created.status !== "created") return;
    expect(created.preview.taskCount).toBe(2);
    expect(created.preview.criticalPathCount).toBe(2);

    const denied = await createParsedImportJob({
      authorization: roleAuth("ProjectManager"),
      setup: VALID_SETUP,
      filename: "job.csv",
      bytes: csvBytes(),
      clock,
      store: backend,
    });
    expect(denied.status).toBe("unauthorized");

    const bad = validSheets();
    bad[2].rows[2][9] = "task-missing";
    const blocked = await createParsedImportJob({
      authorization: ownerAuth(),
      setup: VALID_SETUP,
      filename: "bad.csv",
      bytes: csvBytes(bad),
      clock,
      store: backend,
    });
    expect(blocked.status).toBe("created");
    if (blocked.status !== "created") return;
    expect(blocked.job.status).toBe("NeedsReview");
    const rejected = await confirmImportJob({
      authorization: ownerAuth(),
      importId: blocked.job.id,
      acknowledgeWarnings: true,
      clock,
      store: backend,
      persistence: backend,
    });
    expect(rejected.status).toBe("rejected");
    expect(backend.projects.size).toBe(0);
  });

  it("persists a valid import, reloads through ProjectRepository, and is idempotent", async () => {
    const backend = new MemoryImportBackend();
    const genericSpy = vi.spyOn(
      await import("@/domain/validation/validateProjectSnapshot"),
      "validateProjectSnapshot",
    );
    const harborSpy = vi.spyOn(
      await import("@/domain/validation/validateHarborPointSeedSnapshot"),
      "validateHarborPointSeedSnapshot",
    );
    const created = await createParsedImportJob({
      authorization: ownerAuth(),
      setup: VALID_SETUP,
      filename: "job.csv",
      bytes: csvBytes(),
      clock,
      store: backend,
    });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;

    const confirmed = await confirmImportJob({
      authorization: ownerAuth(),
      importId: created.job.id,
      acknowledgeWarnings: true,
      clock,
      store: backend,
      persistence: backend,
    });
    expect(confirmed.status).toBe("Imported");
    if (confirmed.status !== "Imported") return;
    expect(backend.projects.size).toBe(1);
    const snapshot = [...backend.projects.values()][0];
    expect(snapshot).toBeDefined();

    const loadedJob = await loadImportJobForTenant({
      authorization: ownerAuth(),
      importId: created.job.id,
      store: backend,
    });
    expect(loadedJob.status).toBe("loaded");
    if (loadedJob.status !== "loaded") return;
    expect(loadedJob.job.status).toBe("Imported");
    expect(loadedJob.job.projectId).toBe(confirmed.projectId);

    const again = await confirmImportJob({
      authorization: ownerAuth(),
      importId: created.job.id,
      acknowledgeWarnings: true,
      clock,
      store: backend,
      persistence: backend,
    });
    expect(again.status).toBe("AlreadyImported");
    expect(backend.projects.size).toBe(1);
    expect(genericSpy).toHaveBeenCalled();
    expect(harborSpy).not.toHaveBeenCalled();
    genericSpy.mockRestore();
    harborSpy.mockRestore();
  });

  it("rolls back when persistence fails", async () => {
    const backend = new MemoryImportBackend();
    backend.failNextPersist = true;
    const created = await createParsedImportJob({
      authorization: ownerAuth(),
      setup: VALID_SETUP,
      filename: "job.csv",
      bytes: csvBytes(),
      clock,
      store: backend,
    });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;
    const result = await confirmImportJob({
      authorization: ownerAuth(),
      importId: created.job.id,
      acknowledgeWarnings: true,
      clock,
      store: backend,
      persistence: backend,
    });
    expect(result.status).toBe("rolled_back");
    expect(backend.projects.size).toBe(0);
    expect((await backend.get({ organizationId: "org-a", importId: created.job.id }))?.status).not.toBe(
      "Imported",
    );
  });

  it("loads a confirmed snapshot with empty fixtures through the repository mapper", async () => {
    const backend = new MemoryImportBackend();
    const created = await createParsedImportJob({
      authorization: ownerAuth(),
      setup: VALID_SETUP,
      filename: "job.xlsx",
      bytes: xlsxBytes(),
      clock,
      store: backend,
    });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;
    const confirmed = await confirmImportJob({
      authorization: ownerAuth(),
      importId: created.job.id,
      acknowledgeWarnings: true,
      clock,
      store: backend,
      persistence: backend,
    });
    expect(confirmed.status).toBe("Imported");
    const records = [...backend.projects.values()][0];
    const { mapProjectSnapshot } = await import(
      "@/lib/repositories/projectSnapshotMapper"
    );
    const mapped = mapProjectSnapshot(records, IMPORT_CLOCK);
    expect(mapped.status).toBe("Mapped");
    if (mapped.status !== "Mapped") return;
    expect(mapped.snapshot.scenarioFixtures).toEqual([]);
    expect(validateProjectSnapshot(mapped.snapshot).ok).toBe(true);
    expect(validateHarborPointSeedSnapshot(mapped.snapshot).ok).toBe(false);
  });

  it("keeps warnings visible on preview", async () => {
    const backend = new MemoryImportBackend();
    const sheets = validSheets();
    sheets[2].rows[0].push("extra");
    sheets[2].rows[1].push("x");
    sheets[2].rows[2].push("y");
    const created = await createParsedImportJob({
      authorization: ownerAuth(),
      setup: VALID_SETUP,
      filename: "job.csv",
      bytes: csvBytes(sheets),
      clock,
      store: backend,
    });
    expect(created.status).toBe("created");
    if (created.status !== "created") return;
    expect(created.preview.warningCount).toBeGreaterThan(0);
    expect(created.job.issues.some((item) => item.severity === "Warning")).toBe(
      true,
    );
  });
});

describe("Phase 5D source boundaries", () => {
  it("keeps DB imports out of client components", () => {
    const files = [
      "components/import/NewProjectImportForm.tsx",
      "components/import/ImportReviewPanel.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source.includes("@/lib/db")).toBe(false);
      expect(source.includes("drizzle-orm")).toBe(false);
      expect(source.includes("getDb")).toBe(false);
    }
  });

  it("does not execute formulas, spawn processes, or fetch workbook links in parsers", () => {
    for (const file of [
      "lib/import/parseCsv.ts",
      "lib/import/parseXlsx.ts",
      "lib/import/xlsxIo.ts",
      "lib/import/normalizeWorkbook.ts",
      "lib/import/fileGuard.ts",
      "domain/import/dates.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source.includes("eval(")).toBe(false);
      expect(source.includes("Function(")).toBe(false);
      expect(source.includes("child_process")).toBe(false);
      expect(source.includes("Math.random(")).toBe(false);
      expect(source.includes("randomUUID")).toBe(false);
      expect(source.includes("fetch(")).toBe(false);
    }
  });

  it("does not modify engines, Agent/Voice, or Harbor Point seeds", () => {
    expect(readFileSync("domain/engines/reasoningPipeline.ts", "utf8")).not.toContain(
      "createParsedImportJob",
    );
    expect(readFileSync("domain/agent/types.ts", "utf8")).not.toContain("lib/import");
    expect(readFileSync("domain/voice/types.ts", "utf8")).not.toContain("lib/import");
    expect(readFileSync("data/seedProject.ts", "utf8")).toContain("proj-harbor-point");
  });
});

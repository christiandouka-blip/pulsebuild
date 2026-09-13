import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { normalizeImportDate } from "@/domain/import/dates";
import { validateHarborPointSeedSnapshot } from "@/domain/validation/validateHarborPointSeedSnapshot";
import { validateProjectSnapshot } from "@/domain/validation/validateProjectSnapshot";
import { createFixedClock } from "@/lib/import/clock";
import { guardImportFile, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_SHEETS } from "@/lib/import/fileGuard";
import { MemoryImportBackend } from "@/lib/import/memoryBackend";
import { normalizeWorkbook } from "@/lib/import/normalizeWorkbook";
import {
  MAX_XLSX_ENTRY_UNCOMPRESSED,
  parseXlsxWorkbook,
} from "@/lib/import/parseXlsx";
import {
  confirmImportJob,
  createParsedImportJob,
} from "@/lib/import/service";
import { writeXlsxWorkbook } from "@/lib/import/xlsxIo";
import {
  IMPORT_CLOCK,
  ownerAuth,
  VALID_SETUP,
  validSheets,
} from "@/tests/import/fixtures";

const clock = createFixedClock(IMPORT_CLOCK);

function xlsxBytes(sheets = validSheets()) {
  return writeXlsxWorkbook(
    sheets.map((sheet) => ({ name: sheet.sheet, rows: sheet.rows })),
  );
}

function zipWithDeclaredUncompressed(name: string, uncompressed: number, data: Uint8Array) {
  const nameBytes = new TextEncoder().encode(name);
  const local = new Uint8Array(30 + nameBytes.length + data.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint32(18, data.length, true);
  localView.setUint32(22, uncompressed, true);
  localView.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(data, 30 + nameBytes.length);

  const central = new Uint8Array(46 + nameBytes.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint32(20, data.length, true);
  centralView.setUint32(24, uncompressed, true);
  centralView.setUint16(28, nameBytes.length, true);
  central.set(nameBytes, 46);

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, 1, true);
  eocdView.setUint16(10, 1, true);
  eocdView.setUint32(12, central.length, true);
  eocdView.setUint32(16, local.length, true);

  const out = new Uint8Array(local.length + central.length + eocd.length);
  out.set(local, 0);
  out.set(central, local.length);
  out.set(eocd, local.length + central.length);
  return out;
}

function collectSourceFiles(dir: string): string[] {
  const skip = new Set(["node_modules", ".next", "dist", ".git"]);
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...collectSourceFiles(path));
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) files.push(path);
  }
  return files;
}

describe("Phase 5D XLSX security amendment", () => {
  it("parses a valid .xlsx workbook including Project and Tasks sheets", () => {
    const parsed = parseXlsxWorkbook(xlsxBytes());
    expect(parsed.issues.some((item) => item.severity === "Error")).toBe(false);
    expect(parsed.sheets.map((sheet) => sheet.sheet)).toEqual(
      expect.arrayContaining(["Project", "Phases", "Tasks"]),
    );
    const project = parsed.sheets.find((sheet) => sheet.sheet === "Project");
    expect(project?.rows[0]).toContain("timezone");
    expect(project?.rows[1]).toContain("Example Tower");
    const tasks = parsed.sheets.find((sheet) => sheet.sheet === "Tasks");
    expect(tasks?.rows[1]?.[0]).toBe("task-foundation");
    expect(tasks?.rows[2]?.[0]).toBe("task-pour");
  });

  it("parses multi-sheet workbooks", () => {
    const parsed = parseXlsxWorkbook(xlsxBytes());
    expect(parsed.sheets.length).toBe(validSheets().length);
  });

  it("normalizes Excel serial dates from stored numeric cells", () => {
    const sheets = validSheets();
    const startIndex = sheets[1].rows[0].indexOf("planned_start");
    const parsed = parseXlsxWorkbook(
      writeXlsxWorkbook(
        sheets.map((sheet, sheetIndex) => ({
          name: sheet.sheet,
          rows: sheet.rows.map((row, rowIndex) =>
            sheetIndex === 1 && rowIndex === 1
              ? row.map((cell, columnIndex) =>
                  columnIndex === startIndex ? 45314 : cell,
                )
              : row,
          ),
        })),
      ),
    );
    const stored = parsed.sheets
      .find((sheet) => sheet.sheet === "Phases")
      ?.rows[1]?.[startIndex];
    expect(stored).toBe("45314");
    const expected = normalizeImportDate(45314, "America/Chicago");
    const actual = normalizeImportDate(stored, "America/Chicago");
    expect(actual).toEqual(expected);
    const normalized = normalizeWorkbook({
      sheets: parsed.sheets,
      setup: VALID_SETUP,
    });
    expect(normalized.staging.phases[0]?.plannedStart).toBe(
      expected.ok ? expected.value : "",
    );
  });

  it("does not execute formula cells and uses cached stored values only", () => {
    const withoutValue = parseXlsxWorkbook(
      writeXlsxWorkbook([
        {
          name: "Tasks",
          rows: [
            ["id", "name"],
            ["task-1", ""],
          ],
          cells: { B2: { t: "str", v: "", f: "1+1" } },
        },
      ]),
    );
    expect(withoutValue.sheets[0]?.rows[1]?.[1]).not.toBe("2");
    expect(withoutValue.sheets[0]?.rows[1]?.[1]).toBe("");
    expect(
      withoutValue.issues.some((item) => item.code === "xlsx.formula_without_value"),
    ).toBe(true);

    const cached = parseXlsxWorkbook(
      writeXlsxWorkbook([
        {
          name: "Tasks",
          rows: [
            ["id", "name"],
            ["task-1", ""],
          ],
          cells: { B2: { t: "n", v: 99, f: "1+1" } },
        },
      ]),
    );
    expect(cached.sheets[0]?.rows[1]?.[1]).toBe("99");
    expect(cached.sheets[0]?.rows[1]?.[1]).not.toBe("2");
    expect(
      cached.issues.some((item) => item.code === "xlsx.formula_without_value"),
    ).toBe(false);
  });

  it("does not fetch external workbook links or embedded URLs", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const parsed = parseXlsxWorkbook(
      writeXlsxWorkbook([
        {
          name: "Tasks",
          rows: [
            ["id", "name"],
            ["task-1", "link"],
          ],
          cells: {
            B2: {
              t: "str",
              v: "link",
              f: "='[http://127.0.0.1:9/Book2.xlsx]Sheet1'!A1",
              l: { Target: "http://127.0.0.1:9/Book2.xlsx" },
            },
          },
        },
      ]),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(parsed.sheets[0]?.rows[1]?.[1]).toBe("link");
    vi.unstubAllGlobals();
  });

  it("rejects .xlsm, .xls, and oversized workbooks", () => {
    const bytes = xlsxBytes();
    expect(guardImportFile({ filename: "a.xlsm", bytes }).ok).toBe(false);
    expect(guardImportFile({ filename: "a.xls", bytes }).ok).toBe(false);
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(guardImportFile({ filename: "a.xlsx", bytes: ole }).ok).toBe(false);
    expect(
      guardImportFile({
        filename: "a.xlsx",
        bytes: new Uint8Array(MAX_IMPORT_FILE_BYTES + 1),
      }).ok,
    ).toBe(false);
  });

  it("rejects excessive row and sheet counts", () => {
    const tooManySheets = Array.from({ length: MAX_IMPORT_SHEETS + 1 }, (_, index) => ({
      name: `S${index}`,
      rows: [["id"], [`r${index}`]],
    }));
    const sheetsParsed = parseXlsxWorkbook(writeXlsxWorkbook(tooManySheets));
    expect(sheetsParsed.issues.some((item) => item.code === "file.too_many_sheets")).toBe(
      true,
    );

    const header = ["id", "name"];
    const rows: Array<Array<string>> = [header];
    for (let i = 0; i < 5001; i += 1) {
      rows.push([`t${i}`, "T"]);
    }
    const rowsParsed = parseXlsxWorkbook(
      writeXlsxWorkbook([{ name: "Tasks", rows }]),
    );
    expect(rowsParsed.issues.some((item) => item.code === "file.too_many_rows")).toBe(
      true,
    );
  });

  it("keeps unknown sheets and columns as warnings", () => {
    const sheets = validSheets();
    sheets.push({ sheet: "Notes", rows: [["hello"], ["world"]] });
    sheets[2].rows[0].push("custom_column");
    sheets[2].rows[1].push("ignored");
    const parsed = parseXlsxWorkbook(xlsxBytes(sheets));
    const result = normalizeWorkbook({ sheets: parsed.sheets, setup: VALID_SETUP });
    expect(result.issues.some((item) => item.code === "sheet.unmapped")).toBe(true);
    expect(result.issues.some((item) => item.code === "column.unmapped")).toBe(true);
    expect(
      result.issues
        .filter((item) => item.code === "sheet.unmapped" || item.code === "column.unmapped")
        .every((item) => item.severity === "Warning"),
    ).toBe(true);
  });

  it("preserves the normalized DTO shape and preview from the Phase 5D fixture", async () => {
    const parsed = parseXlsxWorkbook(xlsxBytes());
    const normalized = normalizeWorkbook({
      sheets: parsed.sheets,
      setup: VALID_SETUP,
    });
    expect(normalized.staging.project.name).toBe("Example Tower");
    expect(normalized.staging.project.timezone).toBe("America/Chicago");
    expect(normalized.staging.phases.map((phase) => phase.externalId)).toEqual([
      "phase-structure",
    ]);
    expect(normalized.staging.tasks.map((task) => task.externalId)).toEqual([
      "task-foundation",
      "task-pour",
    ]);
    expect(normalized.staging.tasks.map((task) => task.status)).toEqual([
      "Completed",
      "Ready",
    ]);
    expect(normalized.staging.crews).toHaveLength(1);
    expect(normalized.staging.materials).toHaveLength(1);
    expect(normalized.staging.equipment).toHaveLength(1);
    expect(normalized.staging.inspections).toHaveLength(1);
    expect(normalized.staging.permits).toHaveLength(1);
    expect(normalized.staging.weather).toEqual([]);

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
    expect(created.preview.projectName).toBe("Example Tower");
    expect(created.preview.phaseCount).toBe(1);
    expect(created.preview.taskCount).toBe(2);
    expect(created.preview.crewCount).toBe(1);
    expect(created.preview.errorCount).toBe(0);
  });

  it("keeps confirmation, rollback, and ProjectRepository snapshot proof green", async () => {
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

  it("rejects declared zip-expansion bombs without executing workbook content", () => {
    const bomb = zipWithDeclaredUncompressed(
      "xl/worksheets/sheet1.xml",
      MAX_XLSX_ENTRY_UNCOMPRESSED + 1,
      new TextEncoder().encode("<worksheet/>"),
    );
    const parsed = parseXlsxWorkbook(bomb);
    expect(parsed.sheets).toEqual([]);
    expect(parsed.issues.some((item) => item.code === "xlsx.expanded_too_large")).toBe(
      true,
    );
  });

  it("isolates the XLSX library and does not change engines, Agent, Voice, or Harbor Point", () => {
    const files = ["app", "components", "domain", "lib", "tests", "data", "types"].flatMap(
      (dir) => collectSourceFiles(dir),
    );
    const libraryImporters = files.filter((file) => {
      if (file.startsWith("node_modules/") || file.includes("/node_modules/")) {
        return false;
      }
      const source = readFileSync(file, "utf8");
      return (
        /from ["']@stackline\/xlsx["']/.test(source) ||
        /from ["']xlsx["']/.test(source) ||
        /require\(["']xlsx["']\)/.test(source)
      );
    });
    expect(libraryImporters).toEqual(["lib/import/xlsxIo.ts"]);

    expect(readFileSync("domain/engines/reasoningPipeline.ts", "utf8")).not.toContain(
      "createParsedImportJob",
    );
    expect(readFileSync("domain/agent/types.ts", "utf8")).not.toContain("lib/import");
    expect(readFileSync("domain/voice/types.ts", "utf8")).not.toContain("lib/import");
    expect(readFileSync("data/seedProject.ts", "utf8")).toContain("proj-harbor-point");
  });
});

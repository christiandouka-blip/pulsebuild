import { parse } from "csv-parse/sync";

import { issue } from "@/domain/import/issues";
import { canonicalSheetName } from "@/domain/import/headers";
import type { ImportIssue } from "@/domain/import/types";
import { MAX_IMPORT_ROWS } from "@/lib/import/fileGuard";

export type SheetMatrix = {
  sheet: string;
  rows: string[][];
};

export function parseCsvWorkbook(
  bytes: Uint8Array,
): { sheets: SheetMatrix[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  let records: string[][];
  try {
    records = parse(text, {
      relax_column_count: true,
      skip_empty_lines: true,
      bom: true,
    }) as string[][];
  } catch {
    return {
      sheets: [],
      issues: [
        issue({
          code: "csv.parse_failed",
          entityType: "file",
          message: "The CSV file could not be parsed.",
        }),
      ],
    };
  }

  if (records.length === 0) {
    return {
      sheets: [],
      issues: [
        issue({
          code: "file.empty",
          entityType: "file",
          message: "The uploaded file is empty.",
        }),
      ],
    };
  }

  const header = records[0].map((cell) => String(cell ?? "").trim());
  const sheetIndex = header.findIndex((cell) => cell.toLowerCase() === "sheet");

  if (sheetIndex >= 0) {
    const grouped = new Map<string, string[][]>();
    const remainderHeaders = header.filter((_, index) => index !== sheetIndex);
    for (let i = 1; i < records.length; i += 1) {
      const row = records[i].map((cell) => String(cell ?? ""));
      const sheetRaw = row[sheetIndex] ?? "";
      const canonical = canonicalSheetName(sheetRaw) ?? sheetRaw.trim();
      const cells = row.filter((_, index) => index !== sheetIndex);
      const existing = grouped.get(canonical);
      if (!existing) {
        grouped.set(canonical, [remainderHeaders, cells]);
      } else {
        existing.push(cells);
      }
    }
    const sheets: SheetMatrix[] = [];
    let total = 0;
    for (const [sheet, rows] of grouped) {
      total += Math.max(0, rows.length - 1);
      sheets.push({ sheet, rows });
    }
    if (total > MAX_IMPORT_ROWS) {
      issues.push(
        issue({
          code: "file.too_many_rows",
          entityType: "file",
          message: `Imports may not exceed ${MAX_IMPORT_ROWS} data rows.`,
        }),
      );
    }
    return { sheets, issues };
  }

  if (records.length - 1 > MAX_IMPORT_ROWS) {
    issues.push(
      issue({
        code: "file.too_many_rows",
        entityType: "file",
        message: `Imports may not exceed ${MAX_IMPORT_ROWS} data rows.`,
      }),
    );
  }

  return {
    sheets: [{ sheet: "Tasks", rows: records.map((row) => row.map((cell) => String(cell ?? ""))) }],
    issues,
  };
}

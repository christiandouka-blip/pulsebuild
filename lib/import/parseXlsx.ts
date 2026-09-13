import { issue } from "@/domain/import/issues";
import type { ImportIssue } from "@/domain/import/types";
import { MAX_IMPORT_ROWS, MAX_IMPORT_SHEETS } from "@/lib/import/fileGuard";
import type { SheetMatrix } from "@/lib/import/parseCsv";
import { readStoredXlsx } from "@/lib/import/xlsxIo";

/** Declared uncompressed ZIP entry cap. Tightens the 5 MB upload bound. */
export const MAX_XLSX_ENTRY_UNCOMPRESSED = 16 * 1024 * 1024;
/** Declared uncompressed ZIP archive cap. */
export const MAX_XLSX_TOTAL_UNCOMPRESSED = 32 * 1024 * 1024;

/**
 * Reads stored cell values only. The isolated adapter does not execute Excel
 * formulas or VBA. Formula cells without a cached value are returned empty
 * and become validation issues later. External workbook links are ignored.
 */
export function parseXlsxWorkbook(
  bytes: Uint8Array,
): { sheets: SheetMatrix[]; issues: ImportIssue[] } {
  if (xlsxZipExpansionExceeded(bytes)) {
    return {
      sheets: [],
      issues: [
        issue({
          code: "xlsx.expanded_too_large",
          entityType: "file",
          message: "The spreadsheet expands beyond the allowed size.",
        }),
      ],
    };
  }

  const issues: ImportIssue[] = [];
  let storedSheets;
  try {
    storedSheets = readStoredXlsx(bytes);
  } catch {
    return {
      sheets: [],
      issues: [
        issue({
          code: "xlsx.parse_failed",
          entityType: "file",
          message: "The spreadsheet could not be read as data.",
        }),
      ],
    };
  }

  if (storedSheets.length > MAX_IMPORT_SHEETS) {
    issues.push(
      issue({
        code: "file.too_many_sheets",
        entityType: "file",
        message: `Spreadsheets may not exceed ${MAX_IMPORT_SHEETS} sheets.`,
      }),
    );
    return { sheets: [], issues };
  }

  const sheets: SheetMatrix[] = [];
  let totalRows = 0;

  for (const stored of storedSheets) {
    const matrix: string[][] = [];
    for (const row of stored.rows) {
      const values: string[] = [];
      for (const cell of row.cells) {
        if (cell.formula && cell.text === "") {
          issues.push(
            issue({
              code: "xlsx.formula_without_value",
              entityType: "file",
              sheet: stored.name,
              row: row.excelRow,
              message:
                "Formula cells are treated as data. A formula with no stored value was ignored.",
              rawValue: cell.formula,
              suggestedResolution: "Paste calculated values before import.",
              severity: "Warning",
            }),
          );
        }
        values.push(cell.text);
      }
      matrix.push(values);
    }
    if (matrix.length === 0) continue;
    totalRows += Math.max(0, matrix.length - 1);
    sheets.push({ sheet: stored.name, rows: matrix });
  }

  if (totalRows > MAX_IMPORT_ROWS) {
    issues.push(
      issue({
        code: "file.too_many_rows",
        entityType: "file",
        message: `Imports may not exceed ${MAX_IMPORT_ROWS} data rows.`,
      }),
    );
  }

  if (sheets.length === 0) {
    issues.push(
      issue({
        code: "file.empty",
        entityType: "file",
        message: "The spreadsheet has no data sheets.",
      }),
    );
  }

  return { sheets, issues };
}

function xlsxZipExpansionExceeded(bytes: Uint8Array): boolean {
  const eocd = findZipEocd(bytes);
  if (eocd === null) return false;
  const entries = readU16(bytes, eocd + 10);
  const cdSize = readU32(bytes, eocd + 12);
  const cdOffset = readU32(bytes, eocd + 16);
  if (cdOffset + cdSize > bytes.length) return false;
  let offset = cdOffset;
  let total = 0;
  for (let i = 0; i < entries; i += 1) {
    if (offset + 46 > bytes.length) return false;
    if (readU32(bytes, offset) !== 0x02014b50) return false;
    const uncompressed = readU32(bytes, offset + 24);
    if (uncompressed === 0xffffffff) return true;
    if (uncompressed > MAX_XLSX_ENTRY_UNCOMPRESSED) return true;
    total += uncompressed;
    if (total > MAX_XLSX_TOTAL_UNCOMPRESSED) return true;
    const nameLen = readU16(bytes, offset + 28);
    const extraLen = readU16(bytes, offset + 30);
    const commentLen = readU16(bytes, offset + 32);
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return false;
}

function findZipEocd(bytes: Uint8Array): number | null {
  const min = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (readU32(bytes, i) !== 0x06054b50) continue;
    const commentLen = readU16(bytes, i + 20);
    if (i + 22 + commentLen === bytes.length) return i;
  }
  return null;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

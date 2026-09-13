import { issue } from "@/domain/import/issues";
import type { ImportFileType, ImportIssue } from "@/domain/import/types";

export const MAX_IMPORT_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_IMPORT_FILE_LABEL = "4 MB";
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_SHEETS = 16;

const ALLOWED_EXTENSIONS = new Set(["csv", "xlsx"]);
const REJECTED_EXTENSIONS = new Set([
  "xlsm",
  "xlsb",
  "xltm",
  "xltx",
  "xls",
  "exe",
  "js",
  "zip",
  "html",
  "htm",
]);

const CSV_MIME = new Set([
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
]);

const XLSX_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/octet-stream",
]);

export type GuardedImportFile = {
  filename: string;
  fileType: ImportFileType;
  bytes: Uint8Array;
};

export function guardImportFile(input: {
  filename: string;
  bytes: Uint8Array;
  mimeType?: string;
}): { ok: true; file: GuardedImportFile } | { ok: false; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const filename = input.filename.trim();
  const ext = extensionOf(filename);

  if (!filename || !ext) {
    issues.push(
      issue({
        code: "file.filename",
        entityType: "file",
        message: "A file name with an extension is required.",
      }),
    );
    return { ok: false, issues };
  }

  if (REJECTED_EXTENSIONS.has(ext) || ext === "xlsm") {
    issues.push(
      issue({
        code: "file.rejected_type",
        entityType: "file",
        message: "Macro-enabled or executable files are not allowed.",
        rawValue: ext,
        suggestedResolution: "Export a .csv or .xlsx file without macros.",
      }),
    );
    return { ok: false, issues };
  }

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    issues.push(
      issue({
        code: "file.unsupported_type",
        entityType: "file",
        message: "Only .csv and .xlsx files are accepted.",
        rawValue: ext,
      }),
    );
    return { ok: false, issues };
  }

  if (input.bytes.byteLength === 0) {
    issues.push(
      issue({
        code: "file.empty",
        entityType: "file",
        message: "The uploaded file is empty.",
      }),
    );
    return { ok: false, issues };
  }

  if (input.bytes.byteLength > MAX_IMPORT_FILE_BYTES) {
    issues.push(
      issue({
        code: "file.too_large",
        entityType: "file",
        message: `Files larger than ${MAX_IMPORT_FILE_LABEL} are rejected.`,
      }),
    );
    return { ok: false, issues };
  }

  if (ext === "xlsx") {
    if (isOleCompound(input.bytes)) {
      issues.push(
        issue({
          code: "file.legacy_excel",
          entityType: "file",
          message: "Legacy .xls / OLE compound files are rejected.",
        }),
      );
      return { ok: false, issues };
    }
    if (!isZipContainer(input.bytes)) {
      issues.push(
        issue({
          code: "file.invalid_xlsx",
          entityType: "file",
          message: "The .xlsx file is not a valid Office Open XML package.",
        }),
      );
      return { ok: false, issues };
    }
    if (input.mimeType && !XLSX_MIME.has(input.mimeType)) {
      issues.push(
        issue({
          severity: "Warning",
          code: "file.mime_mismatch",
          entityType: "file",
          message: "MIME type does not match .xlsx; file extension was used.",
          rawValue: input.mimeType,
        }),
      );
    }
    return {
      ok: true,
      file: { filename, fileType: "xlsx", bytes: input.bytes },
    };
  }

  if (input.bytes.includes(0)) {
    issues.push(
      issue({
        code: "file.binary_csv",
        entityType: "file",
        message: "CSV files must be text, not binary.",
      }),
    );
    return { ok: false, issues };
  }

  if (input.mimeType && !CSV_MIME.has(input.mimeType)) {
    issues.push(
      issue({
        severity: "Warning",
        code: "file.mime_mismatch",
        entityType: "file",
        message: "MIME type does not match .csv; file extension was used.",
        rawValue: input.mimeType,
      }),
    );
  }

  return {
    ok: true,
    file: { filename, fileType: "csv", bytes: input.bytes },
  };
}

function extensionOf(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function isZipContainer(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isOleCompound(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  );
}

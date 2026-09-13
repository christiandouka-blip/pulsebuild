import type { ImportIssue, ImportIssueSeverity } from "@/domain/import/types";

export function issue(
  input: Omit<ImportIssue, "severity"> & { severity?: ImportIssueSeverity },
): ImportIssue {
  return {
    severity: input.severity ?? "Error",
    code: input.code,
    entityType: input.entityType,
    sheet: input.sheet,
    row: input.row,
    field: input.field,
    message: input.message,
    rawValue: input.rawValue,
    suggestedResolution: input.suggestedResolution,
  };
}

export function errorCount(issues: ImportIssue[]): number {
  return issues.filter((item) => item.severity === "Error").length;
}

export function warningCount(issues: ImportIssue[]): number {
  return issues.filter((item) => item.severity === "Warning").length;
}

export function hasBlockingErrors(issues: ImportIssue[]): boolean {
  return errorCount(issues) > 0;
}

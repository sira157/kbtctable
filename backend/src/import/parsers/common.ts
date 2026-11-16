import type { RowIssue } from "../types";

export const PREVIEW_LIMIT = 100;

export function makeIssues() {
  const issues: RowIssue[] = [];
  return {
    issues,
    error: (sheet: string, row: number, message: string) => {
      issues.push({ sheet, row, level: "error", message });
    },
    warn: (sheet: string, row: number, message: string) => {
      issues.push({ sheet, row, level: "warning", message });
    },
  };
}

export function previewOf<T extends object>(columns: string[], rows: T[]) {
  return {
    columns,
    rows: rows.slice(0, PREVIEW_LIMIT) as Record<string, unknown>[],
    total: rows.length,
  };
}

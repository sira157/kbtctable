/** Trim and collapse whitespace (incl. newlines) into a single space. */
export function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return String(v).replace(/\s+/g, " ").trim();
}

export function textOrNull(v: unknown): string | null {
  const s = text(v);
  return s === "" ? null : s;
}

/**
 * Code columns (group code, subject code). Excel often stores numeric codes as floats,
 * e.g. 662010101 → 6.62010101E8 or 662010101.0. Return the plain integer string.
 */
export function code(v: unknown): string {
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : String(Math.round(v));
  }
  const s = text(v).replace(/\s+/g, "");
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(s) || /^\d+\.0+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.round(n));
  }
  return s;
}

/** Positive integer (periods per week). Returns null if invalid. */
export function positiveInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(text(v));
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

export function isBlankRow(row: unknown[] | undefined): boolean {
  return !row || row.every((c) => text(c) === "");
}

/** Find a column index by any of the given header names (case/space-insensitive). */
export function findCol(headers: unknown[], names: string[]): number {
  const want = names.map((n) => n.replace(/\s+/g, "").toLowerCase());
  return headers.findIndex((h) => want.includes(text(h).replace(/\s+/g, "").toLowerCase()));
}

import * as XLSX from "xlsx";
import type { Sheet } from "./types";

export type InputFormat = "xlsx" | "csv" | "json";

export class FormatError extends Error {}

export function formatOf(fileName: string): InputFormat | null {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "csv") return "csv";
  if (ext === "json") return "json";
  return null;
}

/** Excel workbook → sheets (row arrays, index 0 = header row) */
export function readWorkbook(buf: ArrayBuffer | Uint8Array): Sheet[] {
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  return wb.SheetNames.map((name) => ({ name, rows: sheetRows(wb.Sheets[name]!) }));
}

function sheetRows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: true, raw: true });
}

function decodeText(buf: Uint8Array): string {
  // UTF-8 (with or without BOM); fall back to Thai Windows-874 if it is not valid UTF-8 (CSV saved by old Excel)
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-874").decode(buf);
  }
}

/** CSV → one sheet. Codes stay as text (no "6.62E8" float conversion). */
export function readCsv(buf: Uint8Array, sheetName = "CSV"): Sheet[] {
  const text = decodeText(buf);
  const wb = XLSX.read(text, { type: "string", raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  return [{ name: sheetName, rows: sheetRows(ws) }];
}

/**
 * JSON → sheets. Accepted shapes:
 *   [ {col: value, …}, … ]                         → one sheet
 *   { "sheet name": [ {col: value}, … ], … }       → one sheet per key (e.g. teacher list + teaching rows)
 *   { "rows": [ … ] } / { "data": [ … ] }           → one sheet
 */
export function readJson(buf: Uint8Array, sheetName = "JSON"): Sheet[] {
  let data: unknown;
  try {
    data = JSON.parse(decodeText(buf));
  } catch (e) {
    throw new FormatError(`ไฟล์ JSON ไม่ถูกต้อง: ${(e as Error).message}`);
  }
  const toSheet = (name: string, arr: unknown): Sheet => {
    if (!Array.isArray(arr)) throw new FormatError(`"${name}" ต้องเป็นอาร์เรย์ของแถว เช่น [{"รหัสกลุ่มเรียน": "662010101", …}]`);
    const objects = arr.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r));
    const header: string[] = [];
    for (const o of objects) for (const k of Object.keys(o)) if (!header.includes(k)) header.push(k);
    return { name, rows: [header, ...objects.map((o) => header.map((h) => o[h] ?? null))] };
  };
  if (Array.isArray(data)) return [toSheet(sheetName, data)];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.rows)) return [toSheet(sheetName, obj.rows)];
    if (Array.isArray(obj.data)) return [toSheet(sheetName, obj.data)];
    const sheets = Object.entries(obj).filter(([, v]) => Array.isArray(v)).map(([k, v]) => toSheet(k, v));
    if (sheets.length) return sheets;
  }
  throw new FormatError("ไฟล์ JSON ต้องเป็นอาร์เรย์ของแถว หรืออ็อบเจกต์ที่แต่ละคีย์เป็นอาร์เรย์ของแถว");
}

/** read any supported input file into sheets */
export function readInput(fileName: string, buf: Uint8Array): Sheet[] {
  const fmt = formatOf(fileName);
  const base = fileName.replace(/\.[^.]+$/, "");
  if (fmt === "xlsx") return readWorkbook(buf);
  if (fmt === "csv") return readCsv(buf, base);
  if (fmt === "json") return readJson(buf, base);
  throw new FormatError("รองรับเฉพาะไฟล์ .xlsx, .csv และ .json");
}

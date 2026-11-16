import * as XLSX from "xlsx";
import type { ViewBy } from "../schedule/service";
import { cellLines, DAYS, PERIODS, VIEW_LABELS, type ExportEntry, type ExportPage } from "./data";

const safeSheetName = (s: string, used: Set<string>) => {
  let base = s.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Sheet";
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base.slice(0, 26)}~${i}`;
  used.add(name);
  return name;
};

/** Excel: sheet 1 = full list (filterable), then one timetable grid per group / teacher / building / room */
export function buildExcel(pages: ExportPage[], all: ExportEntry[], by: ViewBy, runId: number) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  const list = [...all]
    .sort((a, b) => a.groupCode.localeCompare(b.groupCode) || a.day - b.day || a.period - b.period)
    .map((e) => ({
      รหัสกลุ่ม: e.groupCode, ชื่อกลุ่ม: e.groupName ?? "", วัน: DAYS[e.day], คาบ: e.period + 1,
      รหัสวิชา: e.subjectCode, ชื่อวิชา: e.subjectName ?? "", อาจารย์: e.teacherName, อาคาร: e.building, ห้อง: e.roomCode ?? "",
    }));
  const wsList = XLSX.utils.json_to_sheet(list);
  wsList["!cols"] = [12, 28, 10, 6, 12, 36, 28, 18, 8].map((wch) => ({ wch }));
  wsList["!autofilter"] = { ref: wsList["!ref"]! };
  XLSX.utils.book_append_sheet(wb, wsList, safeSheetName("รายการทั้งหมด", used));

  for (const p of pages) {
    const cell = new Map<string, ExportEntry[]>();
    for (const e of p.entries) {
      const k = `${e.day}|${e.period}`;
      (cell.get(k) ?? cell.set(k, []).get(k)!).push(e);
    }
    const aoa: (string | number)[][] = [
      [`ตารางสอน${VIEW_LABELS[by]}: ${p.label}`],
      [`${p.hours} คาบ/สัปดาห์ · ผลการจัดครั้งที่ ${runId}`],
      ["วัน / คาบ", ...Array.from({ length: PERIODS }, (_, i) => `คาบ ${i + 1}`)],
    ];
    DAYS.forEach((day, d) => {
      const row: (string | number)[] = [day];
      for (let pi = 0; pi < PERIODS; pi++) {
        const items = cell.get(`${d}|${pi}`) ?? [];
        row.push(items.length === 1 ? cellLines(items[0]!, by).join(" · ")
          : items.length ? `${items.length} กลุ่ม: ${items.map((i) => `${i.groupCode} ${i.subjectCode}`).join(", ")}` : "");
      }
      aoa.push(row);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 10 }, ...Array.from({ length: PERIODS }, () => ({ wch: 26 }))];
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: PERIODS } }, { s: { r: 1, c: 0 }, e: { r: 1, c: PERIODS } }];
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(p.label, used));
  }
  return new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

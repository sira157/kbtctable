import { HEADERS } from "../detect";
import { code, findCol, isBlankRow, positiveInt, text } from "../normalize";
import type { ParseResult, Sheet, SubjectsData } from "../types";
import { makeIssues, previewOf } from "./common";

type Pair = SubjectsData["groupSubjects"][number];
interface Row { row: number; sc: string; sn: string; gc: string; p: number }

export function parseSubjects(sheets: Sheet[]): ParseResult {
  const sheet = sheets.find((s) => findCol(s.rows[0] ?? [], [...HEADERS.periods]) >= 0)!;
  const h = sheet.rows[0]!;
  const sci = findCol(h, [...HEADERS.subjectCode]);
  const sni = findCol(h, [...HEADERS.subjectName]);
  const gci = findCol(h, [...HEADERS.groupCode]);
  const pi = findCol(h, [...HEADERS.periods]);
  const { issues, error, warn } = makeIssues();

  // pass 1: valid rows
  const rows: Row[] = [];
  sheet.rows.slice(1).forEach((r, i) => {
    const row = i + 2;
    if (isBlankRow(r)) return;
    const sc = code(r[sci]);
    const sn = text(r[sni]);
    const gc = code(r[gci]);
    const p = positiveInt(r[pi]);
    if (!sc) return error(sheet.name, row, "ไม่มีรหัสวิชา");
    if (!gc) return error(sheet.name, row, `วิชา ${sc}: ไม่มีรหัสกลุ่มเรียน`);
    if (p === null) {
      return error(sheet.name, row, `วิชา ${sc}: คาบเรียนต่อสัปดาห์ไม่ถูกต้อง (${text(r[pi]) || "ว่าง"})`);
    }
    if (!/^\d+$/.test(gc)) warn(sheet.name, row, `รหัสกลุ่ม "${gc}" ไม่ใช่ตัวเลข — จัดเป็นกลุ่มแยก กรุณาตรวจ`);
    rows.push({ row, sc, sn, gc, p });
  });

  // pass 2: subject name = the most frequent name for that code (ties → first seen)
  const counts = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!r.sn) continue;
    const m = counts.get(r.sc) ?? counts.set(r.sc, new Map()).get(r.sc)!;
    m.set(r.sn, (m.get(r.sn) ?? 0) + 1);
  }
  const subjects = new Map<string, string>();
  for (const [sc, m] of counts) {
    const ranked = [...m].sort((a, b) => b[1] - a[1]);
    subjects.set(sc, ranked[0]![0]);
    if (ranked.length > 1) {
      warn(sheet.name, 0, `รหัสวิชา ${sc} มีหลายชื่อ: ${ranked.map(([n, c]) => `"${n}" (${c})`).join(", ")} — ตารางรายวิชาใช้ "${ranked[0]![0]}" ส่วนแต่ละกลุ่มเก็บชื่อตามที่ลงไว้ (ใช้จับคู่ผู้สอน)`);
    }
  }
  for (const r of rows) {
    if (!subjects.has(r.sc)) {
      subjects.set(r.sc, r.sc);
      warn(sheet.name, r.row, `วิชา ${r.sc}: ไม่มีชื่อวิชา (ใช้รหัสแทน)`);
    }
  }

  // pass 3: duplicate group × subject → prefer the row whose name matches the majority name
  const pairs = new Map<string, { pair: Pair; row: Row }>();
  for (const r of rows) {
    const key = `${r.gc}|${r.sc}`;
    const prev = pairs.get(key);
    const entry = {
      pair: { groupCode: r.gc, subjectCode: r.sc, subjectName: r.sn || subjects.get(r.sc)!, periodsPerWeek: r.p },
      row: r,
    };
    if (!prev) { pairs.set(key, entry); continue; }
    const major = subjects.get(r.sc);
    const keepPrev = prev.row.sn === major && r.sn !== major;
    const chosen = keepPrev ? prev : entry;
    pairs.set(key, chosen);
    warn(sheet.name, r.row,
      `กลุ่ม ${r.gc} ลงวิชา ${r.sc} ซ้ำกับแถว ${prev.row.row} — ใช้แถว ${chosen.row.row} (${chosen.pair.periodsPerWeek} คาบ) กรุณาตรวจ`);
  }

  const subjectList = [...subjects].map(([code, name]) => ({ code, name }));
  const groupSubjects = [...pairs.values()].map((v) => v.pair);
  return {
    data: { type: "subjects", subjects: subjectList, groupSubjects },
    issues,
    preview: {
      รายวิชา: previewOf(["code", "name"], subjectList),
      วิชาของกลุ่มเรียน: previewOf(["groupCode", "subjectCode", "subjectName", "periodsPerWeek"], groupSubjects),
    },
  };
}

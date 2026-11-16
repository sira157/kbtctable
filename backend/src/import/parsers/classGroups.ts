import { HEADERS } from "../detect";
import { code, findCol, isBlankRow, positiveInt, text, textOrNull } from "../normalize";
import type { ClassGroupsData, ParseResult, Sheet } from "../types";
import { makeIssues, previewOf } from "./common";

type Group = ClassGroupsData["groups"][number];

export function parseClassGroups(sheets: Sheet[]): ParseResult {
  const sheet = sheets.find((s) => findCol(s.rows[0] ?? [], [...HEADERS.groupCode]) >= 0)!;
  const h = sheet.rows[0]!;
  const ci = findCol(h, [...HEADERS.groupCode]);
  const ni = findCol(h, [...HEADERS.groupName]);
  const mi = findCol(h, [...HEADERS.major]);
  const si = findCol(h, [...HEADERS.students]);
  const { issues, error, warn } = makeIssues();
  const byCode = new Map<string, { group: Group; row: number }>();

  sheet.rows.slice(1).forEach((r, i) => {
    const row = i + 2;
    if (isBlankRow(r)) return;
    const c = code(r[ci]);
    const name = text(r[ni]);
    if (!c) return error(sheet.name, row, "ไม่มีรหัสกลุ่มเรียน");
    if (!name) return error(sheet.name, row, `กลุ่ม ${c}: ไม่มีชื่อกลุ่มเรียน`);
    const prev = byCode.get(c);
    if (prev) warn(sheet.name, row, `รหัสกลุ่มเรียน ${c} ซ้ำกับแถว ${prev.row} (ใช้แถวล่าสุด)`);
    let students: number | null = null;
    if (si >= 0 && text(r[si]) !== "") {
      students = positiveInt(r[si]);
      if (students === null) warn(sheet.name, row, `กลุ่ม ${c}: จำนวนนักศึกษา "${text(r[si])}" ไม่ถูกต้อง (ใช้ 30 คน)`);
    }
    byCode.set(c, { group: { code: c, name, major: mi >= 0 ? textOrNull(r[mi]) : null, students }, row });
  });

  const groups = [...byCode.values()].map((v) => v.group);
  return {
    data: { type: "class_groups", groups },
    issues,
    preview: { กลุ่มเรียน: previewOf(si >= 0 ? ["code", "name", "major", "students"] : ["code", "name", "major"], groups) },
  };
}

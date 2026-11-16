import { TEACHER_ROLES } from "../../db/schema";
import { HEADERS } from "../detect";
import { code, findCol, isBlankRow, text, textOrNull } from "../normalize";
import type { ParseResult, Sheet, TeachersData } from "../types";
import { makeIssues, previewOf } from "./common";

type Teacher = TeachersData["teachers"][number];
type Assignment = TeachersData["assignments"][number];

export function parseTeachers(sheets: Sheet[]): ParseResult {
  const { issues, error, warn } = makeIssues();
  const teachers = new Map<string, Teacher>();
  const subjects = new Map<string, string>();
  const assignments = new Map<string, { a: Assignment; row: number }>();

  // Sheet with teacher_name + rank/department -> teacher list (has many duplicate rows)
  const tSheet = sheets.find((s) => {
    const h = s.rows[0] ?? [];
    return (
      findCol(h, [...HEADERS.teacherName]) >= 0 &&
      (findCol(h, [...HEADERS.rank]) >= 0 || findCol(h, [...HEADERS.department]) >= 0)
    );
  });
  if (tSheet) {
    const h = tSheet.rows[0]!;
    const ni = findCol(h, [...HEADERS.teacherName]);
    const ri = findCol(h, [...HEADERS.rank]);
    const di = findCol(h, [...HEADERS.department]);
    tSheet.rows.slice(1).forEach((r, i) => {
      if (isBlankRow(r)) return;
      const name = text(r[ni]);
      if (!name) return error(tSheet.name, i + 2, "ไม่มีชื่ออาจารย์");
      const prev = teachers.get(name);
      teachers.set(name, {
        name,
        rank: (ri >= 0 ? textOrNull(r[ri]) : null) ?? prev?.rank ?? null,
        department: (di >= 0 ? textOrNull(r[di]) : null) ?? prev?.department ?? null,
      });
    });
  }

  // Sheet with subject + teacher + role -> assignments. Subject code column may have a blank header.
  // (may be the same sheet as the teacher list when a CSV/JSON combines both)
  const aSheet = sheets.find((s) => findCol(s.rows[0] ?? [], [...HEADERS.role]) >= 0);
  if (aSheet) {
    const h = aSheet.rows[0]!;
    let sci = findCol(h, [...HEADERS.subjectCode]);
    if (sci < 0) sci = h.findIndex((c) => text(c) === "");
    if (sci < 0) sci = 0;
    const sni = findCol(h, [...HEADERS.subjectName]);
    const ti = findCol(h, [...HEADERS.teacherName]);
    const roi = findCol(h, [...HEADERS.role]);
    aSheet.rows.slice(1).forEach((r, i) => {
      const row = i + 2;
      if (isBlankRow(r)) return;
      const sc = code(r[sci]);
      const sn = sni >= 0 ? text(r[sni]) : "";
      const tn = text(r[ti]);
      const role = text(r[roi]);
      if (!sc) return error(aSheet.name, row, "ไม่มีรหัสวิชา");
      if (!tn) return error(aSheet.name, row, `วิชา ${sc}: ไม่มีชื่ออาจารย์`);
      if (!(TEACHER_ROLES as readonly string[]).includes(role)) {
        return error(
          aSheet.name,
          row,
          `หน้าที่ "${role}" ไม่ถูกต้อง (ต้องเป็น ${TEACHER_ROLES.join(" / ")})`,
        );
      }
      if (!teachers.has(tn)) {
        warn(aSheet.name, row, `ไม่พบอาจารย์ "${tn}" ในรายชื่อ (จะเพิ่มให้อัตโนมัติ)`);
        teachers.set(tn, { name: tn, rank: null, department: null });
      }
      if (sn) subjects.set(sc, sn);
      else if (!subjects.has(sc)) subjects.set(sc, sc);
      const key = `${tn}|${sc}|${sn}`;
      const prev = assignments.get(key);
      if (prev) warn(aSheet.name, row, `อาจารย์ ${tn} วิชา ${sc} ${sn} ซ้ำกับแถว ${prev.row} (ใช้แถวล่าสุด)`);
      assignments.set(key, {
        a: { teacherName: tn, subjectCode: sc, subjectName: sn, role: role as Assignment["role"] },
        row,
      });
    });
  }

  const teacherList = [...teachers.values()];
  const subjectList = [...subjects].map(([code, name]) => ({ code, name }));
  const assignmentList = [...assignments.values()].map((v) => v.a);
  return {
    data: {
      type: "teachers",
      teachers: teacherList,
      subjects: subjectList,
      assignments: assignmentList,
    },
    issues,
    preview: {
      อาจารย์: previewOf(["name", "rank", "department"], teacherList),
      รายวิชาที่สอน: previewOf(["teacherName", "subjectCode", "subjectName", "role"], assignmentList),
    },
  };
}

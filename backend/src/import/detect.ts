import { findCol } from "./normalize";
import type { FileType, Sheet } from "./types";

export const HEADERS = {
  groupCode: ["รหัสกลุ่มเรียน", "group_code"],
  groupName: ["ชื่อกลุ่มเรียน", "group_name"],
  major: ["สาขาวิชา", "major"],
  students: ["จำนวนนักศึกษา", "นักศึกษา", "students"],
  capacity: ["ความจุ", "จำนวนที่นั่ง", "capacity"],
  roomType: ["ประเภทห้อง", "room_type"],
  subjectCode: ["รหัสวิชาเรียน", "รหัสวิชา", "subject_code"],
  subjectName: ["ชื่อวิชา", "subject_name"],
  periods: ["คาบเรียนต่อสัปดาห์", "periods_per_week"],
  teacherName: ["teacher_name", "ชื่ออาจารย์", "ชื่ออาจารย์ผู้สอน"],
  rank: ["rank", "ตำแหน่ง"],
  department: ["department", "แผนก", "แผนกวิชา"],
  role: ["หน้าที่", "role"],
  buildingName: ["building_name", "อาคารเรียน", "ชื่ออาคาร"],
  roomCode: ["room_code", "room", "ห้องเรียน", "ห้อง"],
} as const;

const has = (headers: unknown[], key: keyof typeof HEADERS) =>
  findCol(headers, [...HEADERS[key]]) >= 0;

/** Detect which of the 4 known file layouts this workbook is, from header rows. */
export function detectFileType(sheets: Sheet[]): FileType | null {
  for (const s of sheets) {
    const h = s.rows[0] ?? [];
    // teacher list (name + rank/department) or teaching rows (name + role) — CSV/JSON may combine both in one table
    if (has(h, "teacherName") && (has(h, "rank") || has(h, "department") || has(h, "role"))) return "teachers";
    if (has(h, "subjectCode") && has(h, "periods") && has(h, "groupCode")) return "subjects";
    if (has(h, "groupCode") && has(h, "groupName")) return "class_groups";
    if (has(h, "buildingName")) return "buildings";
  }
  return null;
}

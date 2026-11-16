/**
 * SMART PRE-SCHEDULING FILTER — pure screening logic (no DB).
 * One item = one registration (group × subject × periods) from the subject file,
 * plus original rows of that file that could not be read at all.
 */
import { createHash } from "node:crypto";
import { norm, sameName, suitableRooms, type RawRoom } from "../schedule/input";
import { demandDepartment, departmentBuilding } from "../schedule/rules";
import { LIMITS } from "../schedule/types";

export const STATUSES = ["READY_TO_SCHEDULE", "NOT_REGISTERED", "INVALID_DATA", "PENDING_REVIEW"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  READY_TO_SCHEDULE: "พร้อมจัดตาราง",
  NOT_REGISTERED: "ไม่มีการลงทะเบียน",
  INVALID_DATA: "ข้อมูลผิดพลาด",
  PENDING_REVIEW: "รอตรวจสอบ",
};

export const ISSUE_TYPES = {
  GROUP_NOT_REGISTERED: "กลุ่มเรียนไม่อยู่ในทะเบียน",
  SPECIAL_GROUP_CODE: "รหัสกลุ่มกรณีพิเศษ",
  DUPLICATE_ROWS: "ลงทะเบียนวิชาซ้ำ",
  UNREADABLE_ROW: "แถวข้อมูลอ่านไม่ได้",
  NO_MAIN_TEACHER: "ไม่มีผู้สอนหลัก",
  GROUP_OVER_CAPACITY: "คาบรวมของกลุ่มเกิน 40",
  NO_SUITABLE_ROOM: "ไม่มีห้องที่เหมาะสม",
  UNKNOWN_DEPARTMENT: "ระบุแผนกไม่ได้",
} as const;
export type IssueType = keyof typeof ISSUE_TYPES;

export interface Issue {
  type: IssueType;
  /** blocking issues decide the status; non-blocking are warnings only */
  blocking: boolean;
  cause: string;
  fix: string[];
}

export interface ScreenItem {
  id: string; // "gs-<group_subjects.id>" | "src-<source_rows.id>"
  status: Status;
  groupCode: string;
  groupName: string;
  registered: boolean;
  subjectCode: string;
  subjectName: string;
  periods: number | null;
  department: string | null;
  building: string | null;
  mainTeachers: string[];
  coTeachers: string[];
  source: { file: string; sheet: string; row: number | null } | null;
  data: Record<string, unknown>;
  issues: Issue[];
  /** user can confirm this PENDING_REVIEW item */
  reviewable: boolean;
  approved: boolean;
}

export interface ScreenInput {
  groups: { code: string; name: string; major: string | null; registered: number; review: string; students: number | null }[];
  subjects: { code: string; name: string; roomType: string | null }[];
  registrations: {
    id: number; groupCode: string; subjectCode: string; subjectName: string; periodsPerWeek: number;
    sourceFile: string; sourceSheet: string; sourceRow: number | null; dupRows: string; review: string;
  }[];
  /** active rows of the subject file that failed to parse */
  failedRows: { id: number; fileName: string; sheet: string; rowNo: number; data: Record<string, unknown>; parseError: string }[];
  teachers: { id: number; name: string }[];
  teacherSubjects: { teacherId: number; subjectCode: string; subjectName: string; role: string }[];
  buildings: string[];
  rooms: RawRoom[];
}

export interface ScreenSummary {
  total: number;
  ready: number;
  notRegistered: number;
  invalid: number;
  pending: number;
  readyHours: number;
  notRegisteredHours: number;
  invalidHours: number;
  pendingHours: number;
  registeredGroups: number;
  byIssue: Record<string, number>;
}

const SUBJECT_FILE = "รหัสและชื่อวิชาและจำนวนคาบเรียน";
const TEACHER_FILE = "ชื่ออาจารย์ผู้สอน กับ รายวิชาที่เขาต้องสอน";
const GROUP_FILE = "กลุ่มเรียนและชื่อกลุ่มเรียน";
const MAX_WEEK = 40; // ≤ 4 consecutive + break → ≤ 8 periods/day

const where = (s: ScreenItem["source"]) =>
  s ? `ไฟล์ "${s.file}" ชีต "${s.sheet}"${s.row ? ` แถว ${s.row}` : ""}` : `ไฟล์ "${SUBJECT_FILE}"`;

export function screen(input: ScreenInput) {
  const groupMap = new Map(input.groups.map((g) => [g.code, g]));
  const subjMap = new Map(input.subjects.map((s) => [s.code, s]));
  const tName = new Map(input.teachers.map((t) => [t.id, t.name]));
  const registeredCount = input.groups.filter((g) => g.registered).length;
  const roomsByBuilding = new Map<string, RawRoom[]>();
  for (const r of input.rooms) (roomsByBuilding.get(r.building) ?? roomsByBuilding.set(r.building, []).get(r.building)!).push(r);
  const tsByCode = new Map<string, ScreenInput["teacherSubjects"]>();
  for (const ts of input.teacherSubjects) (tsByCode.get(ts.subjectCode) ?? tsByCode.set(ts.subjectCode, []).get(ts.subjectCode)!).push(ts);

  const items: ScreenItem[] = [];

  // ---- registrations ----
  for (const r of input.registrations) {
    const g = groupMap.get(r.groupCode);
    const name = norm(r.subjectName) || norm(subjMap.get(r.subjectCode)?.name) || r.subjectCode;
    const source = r.sourceFile ? { file: r.sourceFile, sheet: r.sourceSheet, row: r.sourceRow } : null;
    const issues: Issue[] = [];
    const special = !/^\d+$/.test(r.groupCode);
    const groupApproved = g?.review === "approved";

    if (special) {
      issues.push({
        type: "SPECIAL_GROUP_CODE", blocking: !groupApproved,
        cause: `รหัสกลุ่ม "${r.groupCode}" ไม่ใช่รหัสกลุ่มเรียนมาตรฐาน (ตัวเลข 9 หลัก) และไม่อยู่ในทะเบียน`,
        fix: [
          `ตรวจกับงานทะเบียนว่า "${r.groupCode}" คือกลุ่มเรียนใด`,
          `ถ้าเป็นกลุ่มที่มีอยู่แล้ว: แก้รหัสกลุ่มใน${where(source)} เป็นรหัส 9 หลัก แล้วนำเข้าไฟล์ใหม่`,
          `ถ้าเป็นกลุ่มพิเศษที่ต้องจัดตารางจริง: กด "ยืนยันให้จัดตาราง" (ยืนยันทั้งกลุ่ม)`,
          `กด "คัดกรองใหม่"`,
        ],
      });
    } else if (!g?.registered) {
      issues.push({
        type: "GROUP_NOT_REGISTERED", blocking: true,
        cause: `รหัสกลุ่ม ${r.groupCode} ไม่อยู่ในทะเบียนกลุ่มเรียน (${registeredCount} กลุ่ม) — ถือว่าไม่มีการลงทะเบียน`,
        fix: [
          `ถ้ารหัสพิมพ์ผิด: แก้รหัสกลุ่มใน${where(source)} แล้วนำเข้าไฟล์ใหม่`,
          `ถ้าเป็นกลุ่มที่เปิดสอนจริง: เพิ่มรหัส ${r.groupCode} ในไฟล์ "${GROUP_FILE}" แล้วนำเข้าใหม่ หรือเพิ่มที่ จัดการข้อมูล › กลุ่มเรียน (ติ๊ก "อยู่ในทะเบียน")`,
          `กด "คัดกรองใหม่" — ข้อมูลเดิมยังเก็บไว้ครบ`,
        ],
      });
    }

    const dups = r.dupRows.split(",").filter(Boolean);
    if (dups.length) {
      issues.push({
        type: "DUPLICATE_ROWS", blocking: r.review !== "approved",
        cause: `กลุ่ม ${r.groupCode} ลงวิชา ${r.subjectCode} ซ้ำ ${dups.length + 1} แถว (แถว ${[r.sourceRow, ...dups].join(", ")}) — ระบบเลือกแถว ${r.sourceRow} (${name}, ${r.periodsPerWeek} คาบ)`,
        fix: [
          `เปิด${where(source)} และแถว ${dups.join(", ")}`,
          "ลบหรือแก้แถวที่ไม่ถูกต้อง แล้วนำเข้าไฟล์ใหม่",
          `หรือถ้าแถวที่ระบบเลือกถูกต้องแล้ว: กด "ยืนยันให้จัดตาราง"`,
        ],
      });
    }

    // teachers: same subject code AND the name this group registered
    const eligible = (tsByCode.get(r.subjectCode) ?? []).filter((ts) => sameName(norm(ts.subjectName), name));
    const mains = [...new Set(eligible.filter((t) => t.role === "ผู้สอนหลัก").map((t) => t.teacherId))];
    const cos = [...new Set(eligible.filter((t) => t.role !== "ผู้สอนหลัก").map((t) => t.teacherId))].filter((id) => !mains.includes(id));
    if (!mains.length) {
      const otherNames = [...new Set((tsByCode.get(r.subjectCode) ?? []).map((t) => norm(t.subjectName)).filter((n) => n && n !== name))];
      issues.push({
        type: "NO_MAIN_TEACHER", blocking: true,
        cause: `ไม่มีอาจารย์ผู้สอนหลักของวิชา ${r.subjectCode} "${name}"` +
          (cos.length ? ` (มีแต่ผู้สอนร่วม: ${cos.map((id) => tName.get(id)).join(", ")})` : "") +
          (otherNames.length ? ` — มีผู้สอนรหัสนี้แต่ชื่อวิชาต่างกัน: ${otherNames.join(", ")}` : ""),
        fix: [
          `เปิดไฟล์ "${TEACHER_FILE}" ชีต "วิชาและอาจารย์ผู้สอน"`,
          `เพิ่มแถว: รหัสวิชา ${r.subjectCode} · ชื่อวิชา "${name}" · ชื่ออาจารย์ · หน้าที่ "ผู้สอนหลัก" แล้วนำเข้าใหม่`,
          ...(otherNames.length ? [`ถ้า "${otherNames[0]}" คือวิชาเดียวกัน: แก้ชื่อวิชาในไฟล์ใดไฟล์หนึ่งให้ตรงกัน`] : []),
          "หรือเพิ่มที่ จัดการข้อมูล › อาจารย์–รายวิชาที่สอน แล้วกด \"คัดกรองใหม่\"",
        ],
      });
    }

    const dept = demandDepartment(r.groupCode, g?.major ?? null, r.subjectCode);
    const { building } = departmentBuilding(dept, input.buildings);
    if (!dept) {
      issues.push({
        type: "UNKNOWN_DEPARTMENT", blocking: false,
        cause: `ระบุแผนกของกลุ่ม ${r.groupCode} จากรหัสกลุ่ม/สาขาไม่ได้ — ใช้ ${building}`,
        fix: [
          `แก้รหัสกลุ่มใน${where(source)} เป็นรหัส 9 หลัก (หลักที่ 4–5 = ประเภทวิชา) แล้วนำเข้าใหม่`,
          "หรือระบุสาขาวิชาของกลุ่ม ที่ จัดการข้อมูล › กลุ่มเรียน",
          "กด \"คัดกรองใหม่\"",
        ],
      });
    }

    const inBuilding = roomsByBuilding.get(building) ?? [];
    const students = g?.students ?? LIMITS.defaultStudents;
    const roomType = subjMap.get(r.subjectCode)?.roomType ?? null;
    if (inBuilding.length && !name.startsWith("กิจกรรมองค์การวิชาชีพ") && !suitableRooms(inBuilding, roomType, students).length) {
      issues.push({
        type: "NO_SUITABLE_ROOM", blocking: true,
        cause: `${building} ไม่มีห้อง${roomType ? `ประเภท${roomType}` : ""}ที่จุ ${students} คนได้`,
        fix: [
          `เพิ่มห้องใน ${building} ที่ จัดการข้อมูล › ห้องเรียน (ประเภท ${roomType ?? "ใดก็ได้"}, ความจุ ≥ ${students})`,
          "หรือแก้ความจุ/ประเภทของห้องเดิม หรือแก้ประเภทห้องที่วิชาต้องใช้ แล้วกด \"คัดกรองใหม่\"",
        ],
      });
    }

    items.push({
      id: `gs-${r.id}`, status: "READY_TO_SCHEDULE",
      groupCode: r.groupCode, groupName: g?.name ?? r.groupCode, registered: !!g?.registered || (special && groupApproved),
      subjectCode: r.subjectCode, subjectName: name, periods: r.periodsPerWeek,
      department: dept, building,
      mainTeachers: mains.map((id) => tName.get(id) ?? `#${id}`), coTeachers: cos.map((id) => tName.get(id) ?? `#${id}`),
      source, data: { รหัสวิชาเรียน: r.subjectCode, ชื่อวิชา: name, รหัสกลุ่มเรียน: r.groupCode, คาบเรียนต่อสัปดาห์: r.periodsPerWeek },
      issues,
      reviewable: issues.some((i) => (i.type === "SPECIAL_GROUP_CODE" || i.type === "DUPLICATE_ROWS")),
      approved: (special && groupApproved) || (dups.length > 0 && r.review === "approved"),
    });
  }

  // ---- group capacity: a group cannot take more than 40 periods/week ----
  const load = new Map<string, number>();
  for (const it of items) if (!it.issues.some((i) => i.blocking)) load.set(it.groupCode, (load.get(it.groupCode) ?? 0) + (it.periods ?? 0));
  for (const it of items) {
    const h = load.get(it.groupCode) ?? 0;
    if (h > MAX_WEEK && !it.issues.some((i) => i.blocking)) {
      it.issues.push({
        type: "GROUP_OVER_CAPACITY", blocking: true,
        cause: `กลุ่ม ${it.groupCode} มีรวม ${h} คาบ/สัปดาห์ เกิน ${MAX_WEEK} คาบที่จัดได้ (เรียนติดกันได้ไม่เกิน 4 คาบแล้วต้องพัก)`,
        fix: [`ลดคาบเรียนของกลุ่ม ${it.groupCode} ใน${where(it.source)} ให้รวมไม่เกิน ${MAX_WEEK}`, "นำเข้าใหม่ แล้วกด \"คัดกรองใหม่\""],
      });
    }
  }

  // ---- original rows that could not be read ----
  for (const f of input.failedRows) {
    const d = f.data ?? {};
    const pick = (...keys: string[]) => { for (const k of keys) if (d[k] != null && String(d[k]).trim()) return String(d[k]).trim(); return ""; };
    const source = { file: f.fileName, sheet: f.sheet, row: f.rowNo };
    items.push({
      id: `src-${f.id}`, status: "INVALID_DATA",
      groupCode: pick("รหัสกลุ่มเรียน"), groupName: "", registered: false,
      subjectCode: pick("รหัสวิชาเรียน", "รหัสวิชา"), subjectName: pick("ชื่อวิชา"),
      periods: Number(pick("คาบเรียนต่อสัปดาห์")) || null, department: null, building: null,
      mainTeachers: [], coTeachers: [], source, data: d,
      issues: [{
        type: "UNREADABLE_ROW", blocking: true,
        cause: f.parseError,
        fix: [`เปิด${where(source)}`, "เติมหรือแก้ช่องที่ว่าง/ผิดรูปแบบ (รหัสวิชา, รหัสกลุ่มเรียน, คาบเรียนต่อสัปดาห์เป็นจำนวนเต็มบวก)", "บันทึก แล้วนำเข้าไฟล์ใหม่"],
      }],
      reviewable: false, approved: false,
    });
  }

  // ---- status (precedence: unreadable / invalid → special review → not registered → invalid → pending → ready) ----
  for (const it of items) {
    const b = it.issues.filter((i) => i.blocking).map((i) => i.type);
    it.status =
      b.includes("UNREADABLE_ROW") ? "INVALID_DATA"
      : b.includes("SPECIAL_GROUP_CODE") ? "PENDING_REVIEW"
      : b.includes("GROUP_NOT_REGISTERED") ? "NOT_REGISTERED"
      : b.some((t) => t === "NO_MAIN_TEACHER" || t === "GROUP_OVER_CAPACITY" || t === "NO_SUITABLE_ROOM") ? "INVALID_DATA"
      : b.includes("DUPLICATE_ROWS") ? "PENDING_REVIEW"
      : "READY_TO_SCHEDULE";
    if (it.status !== "PENDING_REVIEW" && !it.approved) it.reviewable = false;
  }

  const hours = (s: Status) => items.filter((i) => i.status === s).reduce((n, i) => n + (i.periods ?? 0), 0);
  const count = (s: Status) => items.filter((i) => i.status === s).length;
  const byIssue: Record<string, number> = {};
  for (const it of items) for (const i of it.issues) byIssue[i.type] = (byIssue[i.type] ?? 0) + 1;
  const summary: ScreenSummary = {
    total: items.length,
    ready: count("READY_TO_SCHEDULE"),
    notRegistered: count("NOT_REGISTERED"),
    invalid: count("INVALID_DATA"),
    pending: count("PENDING_REVIEW"),
    readyHours: hours("READY_TO_SCHEDULE"),
    notRegisteredHours: hours("NOT_REGISTERED"),
    invalidHours: hours("INVALID_DATA"),
    pendingHours: hours("PENDING_REVIEW"),
    registeredGroups: registeredCount,
    byIssue,
  };

  // token = fingerprint of exactly what would be sent to the scheduler (the user confirms this)
  const ready = items.filter((i) => i.status === "READY_TO_SCHEDULE")
    .map((i) => [i.id, i.groupCode, i.subjectCode, i.subjectName, i.periods, i.building, i.mainTeachers, i.coTeachers]);
  const token = createHash("sha256").update(JSON.stringify({ ready, summary })).digest("hex").slice(0, 32);

  return { items, summary, token };
}

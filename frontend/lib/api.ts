/**
 * Browser → same-origin "/api" (proxied by Next to the backend, protected by the login middleware).
 * Server components → the backend directly on this machine.
 */
export const API_URL = typeof window === "undefined"
  ? `${process.env.BACKEND_URL ?? "http://127.0.0.1:3001"}/api`
  : "/api";

export class ApiError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string> = {}) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    // server components call the backend directly → send the backend secret
    const serverHeaders: Record<string, string> =
      typeof window === "undefined" && process.env.BACKEND_TOKEN ? { "x-backend-token": process.env.BACKEND_TOKEN } : {};
    res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...init,
      headers: { ...serverHeaders, ...(init?.headers as Record<string, string> | undefined) },
    });
  } catch {
    throw new Error(`เชื่อมต่อ API ไม่ได้ (${API_URL}) — เปิด backend แล้วหรือยัง?`);
  }
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError("กรุณาเข้าสู่ระบบ");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body?.message ?? `HTTP ${res.status}`, body?.fieldErrors ?? {});
  return body as T;
}

export function uploadFile<T>(path: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return api<T>(path, { method: "POST", body: fd });
}

export interface RowIssue { sheet: string; row: number; level: "error" | "warning"; message: string }
export interface PreviewSection { columns: string[]; rows: Record<string, unknown>[]; total: number }
export interface PreviewResult {
  fileName: string; type: string; typeLabel: string;
  preview: Record<string, PreviewSection>;
  issues: RowIssue[]; counts: Record<string, number>;
  errorCount: number; warningCount: number;
}
export interface TableCount { inserted: number; updated: number; skipped: number }
export interface CommitResult {
  id: number; fileName: string; type: string; typeLabel: string;
  inserted: number; updated: number; skipped: number;
  details: Record<string, TableCount>; issues: RowIssue[];
  /** A. automatic screening right after the import */
  screening?: { summary: { total: number; ready: number; notRegistered: number; invalid: number; pending: number; readyHours: number; notRegisteredHours: number } };
}
export interface ImportLog {
  id: number; fileName: string; fileType: string;
  inserted: number; updated: number; skipped: number;
  details: Record<string, TableCount> | null; errors: RowIssue[] | null; createdAt: string;
}
export interface TableData {
  table: string; label: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[]; total: number; page: number; limit: number;
}

export const TABLE_LABELS: Record<string, string> = {
  class_groups: "กลุ่มเรียน",
  teachers: "อาจารย์",
  subjects: "รายวิชา",
  group_subjects: "วิชาของกลุ่มเรียน",
  teacher_subjects: "อาจารย์–รายวิชาที่สอน",
  buildings: "อาคารเรียน",
  rooms: "ห้องเรียน",
};

export const FILE_TYPE_LABELS: Record<string, string> = {
  class_groups: "กลุ่มเรียน",
  subjects: "รายวิชาและคาบเรียน",
  teachers: "อาจารย์และรายวิชาที่สอน",
  buildings: "อาคารเรียนและห้องเรียน",
};

// ---------- timetable ----------
export const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
export type ViewBy = "group" | "teacher" | "building" | "room";
export interface Check { key: string; label: string; violations: number; note?: string; examples: string[] }
export interface ScheduleSummary {
  ms: number;
  checks: Check[];
  totalViolations: number;
  conflictFree: boolean;
  unplaced: { groupCode: string; subjectCode: string; hours: number; reason: string }[];
  coverage: {
    totalPeriods: number; assigned: number; pending: number; assignedPct: number;
    teacherCapacity: number; extraTeachersNeeded: number;
    topPendingSubjects: { code: string; name: string; hours: number }[];
  };
  balance: {
    groups: {
      count: number; totalHoles: number; groupsWithHoles: number; avgDayDiff: number; maxDayDiff: number;
      eveningPeriods: number; worst: { code: string; hours: number[]; diff: number; holes: number }[];
    };
    teachers: { min: number; max: number; avg: number; loads: { id: number; name: string; hours: number }[] };
  };
  notes: string[];
  suggestions: string[];
  data?: DataSummary;
}
export interface DataSummary {
  used: { registrations: number; groups: number; subjects: number; hours: number; teachers: number; assignments: number };
  skipped: {
    unregisteredSubjects: number; unregisteredExamples: string[]; assignmentsOfUnregistered: number;
    assignmentsNameMismatch: number; nameMismatchExamples: string[];
    teachersWithoutRegisteredSubject: number; groupsWithoutRegistration: number;
    registrationsWithoutTeacher: number; withoutTeacherExamples: string[];
  };
  departments: { department: string; building: string; ownBuilding: boolean; registrations: number; hours: number }[];
  rooms: { buildingsWithRooms: string[]; noSuitableRoom: number };
  checkList: string[];
}
export interface ScheduleRun { id: number; createdAt: string; options: { activityMode?: string } | null; summary: ScheduleSummary }
export interface RunListItem { id: number; createdAt: string; options: { activityMode?: string } | null; totalViolations: number | null; assignedPct: number | null; totalPeriods: number | null }
export interface ViewKey { key: string; label: string; hours: number }
export interface GridEntry {
  day: number; period: number; groupCode: string; groupName: string | null;
  subjectCode: string; subjectName: string | null; teacherId: number | null; teacherName: string; building: string;
  roomId: number | null; roomCode: string | null;
}

// ---------- manage (CRUD) ----------
export type FieldKind = "code" | "text" | "int" | "enum" | "ref" | "bool";
export interface FieldDef {
  key: string; label: string; kind: FieldKind; required?: boolean;
  min?: number; max?: number; options?: string[]; ref?: string; help?: string;
}
export interface EntityDef { label: string; pk: string; autoId: boolean; fields: FieldDef[]; cascade: string | null }
export type Meta = Record<string, EntityDef>;
export interface Option { value: string; label: string }

export const MANAGE_ORDER = ["class_groups", "subjects", "group_subjects", "teachers", "teacher_subjects", "buildings", "rooms"];

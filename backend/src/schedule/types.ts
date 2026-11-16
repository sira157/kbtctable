export const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"] as const;
export const PERIODS = 10;
export const THURSDAY = 3;

export const LIMITS = {
  teacherMaxPerDay: 7,
  /** teacher must have ≥1 free period among these (0-based → คาบ 4–6) */
  teacherBreakWindow: [3, 4, 5],
  maxSameSubjectRun: 4,
  maxStudentRun: 4,
  defaultStudents: 30,
} as const;

export type SpecialRule = "org_activity" | "org_activity_thu" | null;

export interface GroupIn { code: string; name: string; major: string | null; building: string; students: number }
export interface RoomIn { id: number; code: string; building: string; capacity: number | null; roomType: string | null }
export interface TeacherIn { id: number; name: string; department: string | null }
export interface DemandIn {
  groupCode: string;
  subjectCode: string;
  subjectName: string;
  hours: number;
  building: string;
  special: SpecialRule;
  isProject: boolean;
  students: number;
  /** ประเภทห้องที่วิชาต้องใช้ (null = ใดก็ได้) */
  roomType: string | null;
  /** true when the building has rooms registered → a room must be booked */
  roomRequired: boolean;
  /** suitable room ids (same building, type ok, capacity ok), smallest first */
  rooms: number[];
  /** eligible teacher ids, main teachers first */
  mainTeachers: number[];
  coTeachers: number[];
}

export interface SolverInput {
  groups: GroupIn[];
  teachers: TeacherIn[];
  demands: DemandIn[];
  rooms?: RoomIn[];
  /** teacherId -> list of "day:period" (0-based) the teacher is NOT available */
  unavailable?: Record<number, string[]>;
  options?: { activityMode?: "period10" | "groupLast" };
}

export interface Entry {
  groupCode: string;
  subjectCode: string;
  teacherId: number | null;
  building: string;
  day: number; // 0..4
  period: number; // 0..9
  roomId: number | null;
  blockId: number;
  /** block was split further than the default plan because it could not be placed contiguously */
  split: boolean;
}

export interface Unplaced { groupCode: string; subjectCode: string; hours: number; reason: string }

export interface SolverResult { entries: Entry[]; unplaced: Unplaced[]; ms: number }

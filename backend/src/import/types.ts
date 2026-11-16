export type FileType = "class_groups" | "subjects" | "teachers" | "buildings";

export const FILE_TYPE_LABELS: Record<FileType, string> = {
  class_groups: "กลุ่มเรียน",
  subjects: "รายวิชาและคาบเรียน",
  teachers: "อาจารย์และรายวิชาที่สอน",
  buildings: "อาคารเรียนและห้องเรียน",
};

export interface RowIssue {
  sheet: string;
  row: number; // Excel row number (1-based)
  level: "error" | "warning";
  message: string;
}

/** Raw sheet: rows as arrays of cell values, index 0 = Excel row 1. */
export interface Sheet {
  name: string;
  rows: unknown[][];
}

export interface ClassGroupsData {
  type: "class_groups";
  groups: { code: string; name: string; major: string | null; students: number | null }[];
}
export interface SubjectsData {
  type: "subjects";
  subjects: { code: string; name: string }[];
  /** subjectName = name as written in this group's row (one code may have different names per group) */
  groupSubjects: { groupCode: string; subjectCode: string; subjectName: string; periodsPerWeek: number }[];
  /** Group codes referenced but not in DB — created as placeholders on commit. */
  newGroups?: { code: string; major: string | null }[];
  /** existing placeholder groups whose major can now be guessed */
  fillMajors?: { code: string; major: string | null }[];
}
export interface TeachersData {
  type: "teachers";
  teachers: { name: string; rank: string | null; department: string | null }[];
  subjects: { code: string; name: string }[];
  assignments: { teacherName: string; subjectCode: string; subjectName: string; role: "ผู้สอนหลัก" | "ผู้สอนร่วม" }[];
}
export interface BuildingsData {
  type: "buildings";
  buildings: { name: string }[];
  rooms: { buildingName: string; roomCode: string; capacity: number | null; roomType: string | null }[];
}
export type ImportData = ClassGroupsData | SubjectsData | TeachersData | BuildingsData;

export interface ParseResult {
  data: ImportData;
  issues: RowIssue[];
  /** Sample rows for the preview table, keyed by sheet/section name. */
  preview: Record<string, { columns: string[]; rows: Record<string, unknown>[]; total: number }>;
}

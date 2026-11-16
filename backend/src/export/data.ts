import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { classGroups, groupSubjects, rooms, scheduleEntries, scheduleRuns, subjects, teachers } from "../db/schema";
import { viewKeys, type ViewBy } from "../schedule/service";

export interface ExportEntry {
  day: number; period: number; groupCode: string; groupName: string | null;
  subjectCode: string; subjectName: string | null; teacherId: number | null; teacherName: string;
  building: string; roomId: number | null; roomCode: string | null;
}
export interface ExportPage { key: string; label: string; hours: number; entries: ExportEntry[] }

export const VIEW_LABELS: Record<ViewBy, string> = {
  group: "กลุ่มเรียน", teacher: "อาจารย์", building: "อาคาร", room: "ห้อง",
};

const regName = sql<string>`COALESCE(NULLIF(${groupSubjects.subjectName}, ''), ${subjects.name})`;

/** All entries of a run, grouped into one "page" per group / teacher / building / room (optionally one key only). */
export async function exportPages(runId: number, by: ViewBy, onlyKey?: string) {
  const [run] = await db.select({ id: scheduleRuns.id, createdAt: scheduleRuns.createdAt }).from(scheduleRuns).where(eq(scheduleRuns.id, runId));
  if (!run) return null;
  const rows: ExportEntry[] = (await db.select({
    day: scheduleEntries.day, period: scheduleEntries.period, groupCode: scheduleEntries.groupCode, groupName: classGroups.name,
    subjectCode: scheduleEntries.subjectCode, subjectName: regName, teacherId: scheduleEntries.teacherId, teacherName: teachers.name,
    building: scheduleEntries.building, roomId: scheduleEntries.roomId, roomCode: rooms.roomCode,
  })
    .from(scheduleEntries)
    .leftJoin(groupSubjects, and(eq(groupSubjects.groupCode, scheduleEntries.groupCode), eq(groupSubjects.subjectCode, scheduleEntries.subjectCode)))
    .leftJoin(subjects, eq(subjects.code, scheduleEntries.subjectCode))
    .leftJoin(teachers, eq(teachers.id, scheduleEntries.teacherId))
    .leftJoin(classGroups, eq(classGroups.code, scheduleEntries.groupCode))
    .leftJoin(rooms, eq(rooms.id, scheduleEntries.roomId))
    .where(eq(scheduleEntries.runId, runId)))
    .map((r) => ({ ...r, teacherName: r.teacherName ?? "รอจัดสรรอาจารย์" }));

  const keyOf = (e: ExportEntry) =>
    by === "group" ? e.groupCode
    : by === "teacher" ? String(e.teacherId ?? "pending")
    : by === "room" ? (e.roomId === null ? null : String(e.roomId))
    : e.building;
  const byKey = new Map<string, ExportEntry[]>();
  for (const e of rows) {
    const k = keyOf(e);
    if (k === null) continue;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(e);
  }
  const keys = await viewKeys(runId, by);
  const pages: ExportPage[] = keys
    .filter((k) => !onlyKey || k.key === onlyKey)
    .map((k) => ({ key: k.key, label: k.label, hours: k.hours, entries: byKey.get(k.key) ?? [] }));
  return { run, by, pages, all: rows };
}

export const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];
export const PERIODS = 10;

/** text lines for one cell (single entry) depending on the view */
export function cellLines(e: ExportEntry, by: ViewBy): string[] {
  const group = e.groupName && e.groupName !== e.groupCode ? e.groupName : e.groupCode;
  const place = e.roomCode ? `${e.building} ห้อง ${e.roomCode}` : e.building;
  return [
    e.subjectCode,
    e.subjectName ?? "",
    ...(by !== "group" ? [group] : []),
    ...(by !== "teacher" ? [e.teacherName] : []),
    ...(by !== "building" && by !== "room" ? [place] : by === "building" && e.roomCode ? [`ห้อง ${e.roomCode}`] : []),
  ].filter(Boolean);
}

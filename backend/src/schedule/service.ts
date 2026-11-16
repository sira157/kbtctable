import { and, desc, eq, sql } from "drizzle-orm";
import { asJson, db } from "../db/client";
import {
  buildings, classGroups, groupSubjects, rooms, scheduleEntries, scheduleRuns, subjects, teachers, teacherSubjects,
  teacherUnavailability,
} from "../db/schema";
import { runScreening } from "../screening/service";
import { buildInput } from "./input";
import { solve } from "./solver";
import type { SolverInput } from "./types";
import { balanceReport, coverageReport, validate } from "./validate";

export class ScheduleError extends Error {}

const CHUNK = 1000;

/**
 * F. Scheduling Gate — the scheduler only runs on a screening result the user has seen and confirmed:
 *  - screening is re-run here (never skipped, even if generate is called directly)
 *  - `screeningToken` must equal the fingerprint of the current result, otherwise the data changed / was not confirmed
 *  - only READY_TO_SCHEDULE items go to the scheduler
 */
export async function generate(options: SolverInput["options"] = {}, screeningToken?: string) {
  const screening = await runScreening();
  if (!screeningToken) {
    throw new ScheduleError("ต้องตรวจผลคัดกรองข้อมูลและกดยืนยันก่อนเริ่มจัดตาราง (หน้า \"คัดกรองข้อมูล\")");
  }
  if (screeningToken !== screening.token) {
    throw new ScheduleError("ข้อมูลเปลี่ยนไปหลังจากที่ตรวจผลคัดกรอง — กรุณาตรวจผลคัดกรองใหม่แล้วยืนยันอีกครั้ง");
  }
  const readyIds = new Set(
    screening.items.filter((i) => i.status === "READY_TO_SCHEDULE" && i.id.startsWith("gs-")).map((i) => Number(i.id.slice(3))),
  );
  if (!readyIds.size) throw new ScheduleError("ไม่มีรายการที่พร้อมจัดตาราง — แก้ข้อมูลตามผลคัดกรองก่อน");

  const [g, s, gs, t, ts, b, r, u] = await Promise.all([
    db.select().from(classGroups),
    db.select().from(subjects),
    db.select().from(groupSubjects),
    db.select().from(teachers),
    db.select().from(teacherSubjects),
    db.select().from(buildings),
    db.select().from(rooms),
    db.select().from(teacherUnavailability),
  ]);

  const buildingName = new Map(b.map((x) => [x.id, x.name]));
  const unavailable: Record<number, string[]> = {};
  for (const x of u) (unavailable[x.teacherId] ??= []).push(`${x.day}:${x.period}`);

  const { input, summary: data, notes } = buildInput({
    groups: g, subjects: s,
    groupSubjects: gs.filter((x) => readyIds.has(x.id)), // ← gate: READY only
    teachers: t, teacherSubjects: ts, buildings: b.map((x) => x.name),
    rooms: r.map((x) => ({ id: x.id, building: buildingName.get(x.buildingId)!, roomCode: x.roomCode, capacity: x.capacity, roomType: x.roomType })),
    unavailable,
  }, options);
  // safety net: nothing that is not READY may reach the solver
  const leaked = input.demands.filter((d) => !gs.some((x) => readyIds.has(x.id) && x.groupCode === d.groupCode && x.subjectCode === d.subjectCode));
  if (leaked.length) throw new ScheduleError(`พบรายการที่ไม่ผ่านการคัดกรอง ${leaked.length} รายการ — หยุดการจัดตาราง`);
  const result = solve(input);
  const validation = validate(input, result.entries);
  const coverage = coverageReport(input, result.entries);
  const summary = {
    ms: result.ms,
    ...validation,
    conflictFree: validation.totalViolations === 0,
    unplaced: result.unplaced,
    coverage,
    balance: balanceReport(input, result.entries),
    data,
    screening: { ...screening.summary, token: screening.token, screenedAt: screening.screenedAt },
    notes,
    suggestions: suggestions(result.unplaced.length, coverage),
  };

  const runId = await db.transaction(async (tx) => {
    const [run] = await tx.insert(scheduleRuns).values({ options, summary }).$returningId();
    const rows = result.entries.map((e) => ({ ...e, split: e.split ? 1 : 0, runId: run!.id }));
    for (let i = 0; i < rows.length; i += CHUNK) await tx.insert(scheduleEntries).values(rows.slice(i, i + CHUNK));
    return run!.id;
  });
  return { id: runId, summary };
}

function suggestions(unplacedCount: number, cov: ReturnType<typeof coverageReport>): string[] {
  const out: string[] = [];
  if (cov.pending > 0) {
    out.push(
      `อาจารย์ไม่พอ: ต้องสอน ${cov.totalPeriods.toLocaleString()} คาบ แต่อาจารย์ ${cov.teacherCount} คนสอนได้สูงสุด ${cov.teacherCapacity.toLocaleString()} คาบ → เพิ่มอาจารย์อย่างน้อย ${cov.extraTeachersNeeded} คน หรือเพิ่มผู้สอนร่วม`,
    );
  }
  if (unplacedCount > 0) {
    out.push("จัดไม่ครบ: เพิ่มห้อง / ปรับประเภทหรือความจุห้อง / ลดเวลาไม่ว่างของอาจารย์");
  }
  return out;
}

export async function listRuns() {
  const rows = await db.select().from(scheduleRuns).orderBy(desc(scheduleRuns.id)).limit(20);
  return rows.map((r) => {
    const s = asJson<{ totalViolations?: number; coverage?: { assignedPct?: number; totalPeriods?: number } }>(r.summary);
    return {
      id: r.id, createdAt: r.createdAt, options: asJson(r.options),
      totalViolations: s?.totalViolations ?? null,
      assignedPct: s?.coverage?.assignedPct ?? null,
      totalPeriods: s?.coverage?.totalPeriods ?? null,
    };
  });
}

export async function getRun(id: number) {
  const [r] = await db.select().from(scheduleRuns).where(eq(scheduleRuns.id, id));
  return r ? { ...r, options: asJson(r.options), summary: asJson(r.summary) } : null;
}

export async function latestRunId(): Promise<number | null> {
  const [r] = await db.select({ id: scheduleRuns.id }).from(scheduleRuns).orderBy(desc(scheduleRuns.id)).limit(1);
  return r?.id ?? null;
}

export async function deleteRun(id: number) {
  await db.delete(scheduleRuns).where(eq(scheduleRuns.id, id));
}

/** subject name as the group registered it (falls back to the subjects table) */
const regName = sql<string>`COALESCE(NULLIF(${groupSubjects.subjectName}, ''), ${subjects.name})`;

export type ViewBy = "group" | "teacher" | "building" | "room";

/** list of groups / teachers / buildings that appear in a run, with hours */
export async function viewKeys(runId: number, by: ViewBy) {
  const rows = await db.select().from(scheduleEntries).where(eq(scheduleEntries.runId, runId));
  const count = new Map<string, number>();
  for (const e of rows) {
    if (by === "room" && e.roomId === null) continue;
    const k = by === "group" ? e.groupCode
      : by === "teacher" ? String(e.teacherId ?? "pending")
      : by === "room" ? String(e.roomId) : e.building;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  let labels = new Map<string, string>();
  if (by === "group") labels = new Map((await db.select().from(classGroups)).map((g) => [g.code, g.name === g.code ? g.code : `${g.code} ${g.name}`]));
  if (by === "teacher") {
    labels = new Map((await db.select().from(teachers)).map((t) => [String(t.id), t.name]));
    labels.set("pending", "รอจัดสรรอาจารย์");
  }
  if (by === "room") {
    const rs = await db.select({ id: rooms.id, code: rooms.roomCode, building: buildings.name }).from(rooms)
      .leftJoin(buildings, eq(buildings.id, rooms.buildingId));
    labels = new Map(rs.map((r) => [String(r.id), `${r.building} · ห้อง ${r.code}`]));
  }
  return [...count]
    .map(([key, hours]) => ({ key, label: labels.get(key) ?? key, hours }))
    .sort((a, b) => (a.key === "pending" ? 1 : b.key === "pending" ? -1 : a.label.localeCompare(b.label, "th")));
}

export async function viewGrid(runId: number, by: ViewBy, key: string) {
  // numeric keys (teacher / room id) — an unknown key means "nothing", not a server error
  if ((by === "room" || (by === "teacher" && key !== "pending")) && !Number.isInteger(Number(key))) return [];
  const where =
    by === "group" ? eq(scheduleEntries.groupCode, key)
    : by === "building" ? eq(scheduleEntries.building, key)
    : by === "room" ? eq(scheduleEntries.roomId, Number(key))
    : key === "pending" ? undefined : eq(scheduleEntries.teacherId, Number(key));
  let rows = await db
    .select({
      day: scheduleEntries.day, period: scheduleEntries.period, groupCode: scheduleEntries.groupCode,
      subjectCode: scheduleEntries.subjectCode, subjectName: regName, teacherId: scheduleEntries.teacherId,
      teacherName: teachers.name, building: scheduleEntries.building, groupName: classGroups.name,
      roomId: scheduleEntries.roomId, roomCode: rooms.roomCode,
    })
    .from(scheduleEntries)
    .leftJoin(groupSubjects, and(eq(groupSubjects.groupCode, scheduleEntries.groupCode), eq(groupSubjects.subjectCode, scheduleEntries.subjectCode)))
    .leftJoin(rooms, eq(rooms.id, scheduleEntries.roomId))
    .leftJoin(subjects, eq(subjects.code, scheduleEntries.subjectCode))
    .leftJoin(teachers, eq(teachers.id, scheduleEntries.teacherId))
    .leftJoin(classGroups, eq(classGroups.code, scheduleEntries.groupCode))
    .where(where ? and(eq(scheduleEntries.runId, runId), where) : eq(scheduleEntries.runId, runId));
  if (by === "teacher" && key === "pending") rows = rows.filter((r) => r.teacherId === null);
  return rows.map((r) => ({ ...r, teacherName: r.teacherName ?? "รอจัดสรรอาจารย์" }));
}

/** all entries of a run (for CSV export) */
export async function allEntries(runId: number) {
  return db.select({
    day: scheduleEntries.day, period: scheduleEntries.period, groupCode: scheduleEntries.groupCode,
    groupName: classGroups.name, subjectCode: scheduleEntries.subjectCode, subjectName: regName,
    teacherName: teachers.name, building: scheduleEntries.building, roomCode: rooms.roomCode,
  })
    .from(scheduleEntries)
    .leftJoin(groupSubjects, and(eq(groupSubjects.groupCode, scheduleEntries.groupCode), eq(groupSubjects.subjectCode, scheduleEntries.subjectCode)))
    .leftJoin(rooms, eq(rooms.id, scheduleEntries.roomId))
    .leftJoin(subjects, eq(subjects.code, scheduleEntries.subjectCode))
    .leftJoin(teachers, eq(teachers.id, scheduleEntries.teacherId))
    .leftJoin(classGroups, eq(classGroups.code, scheduleEntries.groupCode))
    .where(eq(scheduleEntries.runId, runId))
    .orderBy(scheduleEntries.groupCode, scheduleEntries.day, scheduleEntries.period);
}

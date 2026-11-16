import { and, eq, isNotNull } from "drizzle-orm";
import { asJson, db } from "../db/client";
import {
  buildings, classGroups, groupSubjects, rooms, sourceRows, subjects, teachers, teacherSubjects,
} from "../db/schema";
import { screen, type ScreenInput } from "./screen";

export class ScreeningError extends Error {}

/** Load everything the screening needs straight from the database (so numbers always match the DB). */
export async function loadScreenInput(): Promise<ScreenInput> {
  const [g, s, gs, failed, t, ts, b, r] = await Promise.all([
    db.select().from(classGroups),
    db.select().from(subjects),
    db.select().from(groupSubjects),
    db.select().from(sourceRows)
      .where(and(eq(sourceRows.fileType, "subjects"), eq(sourceRows.active, 1), isNotNull(sourceRows.parseError))),
    db.select().from(teachers),
    db.select().from(teacherSubjects),
    db.select().from(buildings),
    db.select().from(rooms),
  ]);
  const bName = new Map(b.map((x) => [x.id, x.name]));
  return {
    groups: g.map((x) => ({ code: x.code, name: x.name, major: x.major, registered: x.registered, review: x.review, students: x.students })),
    subjects: s.map((x) => ({ code: x.code, name: x.name, roomType: x.roomType })),
    registrations: gs.map((x) => ({
      id: x.id, groupCode: x.groupCode, subjectCode: x.subjectCode, subjectName: x.subjectName, periodsPerWeek: x.periodsPerWeek,
      sourceFile: x.sourceFile, sourceSheet: x.sourceSheet, sourceRow: x.sourceRow, dupRows: x.dupRows, review: x.review,
    })),
    failedRows: failed.map((x) => ({
      id: x.id, fileName: x.fileName, sheet: x.sheet, rowNo: x.rowNo,
      data: asJson<Record<string, unknown>>(x.data) ?? {}, parseError: x.parseError ?? "",
    })),
    teachers: t.map((x) => ({ id: x.id, name: x.name })),
    teacherSubjects: ts.map((x) => ({ teacherId: x.teacherId, subjectCode: x.subjectCode, subjectName: x.subjectName, role: x.role })),
    buildings: b.map((x) => x.name),
    rooms: r.map((x) => ({ id: x.id, building: bName.get(x.buildingId)!, roomCode: x.roomCode, capacity: x.capacity, roomType: x.roomType })),
  };
}

export async function runScreening() {
  const input = await loadScreenInput();
  return { ...screen(input), input, screenedAt: new Date().toISOString() };
}

export async function screeningSummary() {
  const { summary, token } = await runScreening();
  return { summary, token };
}

/** confirm (or un-confirm) a PENDING_REVIEW item */
export async function review(itemId: string, approve: boolean) {
  const m = /^gs-(\d+)$/.exec(itemId);
  if (!m) throw new ScreeningError("ยืนยันได้เฉพาะรายการลงทะเบียนที่รอตรวจสอบ");
  const [row] = await db.select().from(groupSubjects).where(eq(groupSubjects.id, Number(m[1])));
  if (!row) throw new ScreeningError("ไม่พบรายการ");
  const value = approve ? "approved" : "";
  if (!/^\d+$/.test(row.groupCode)) {
    // special group code → the decision applies to the whole group
    await db.update(classGroups).set({ review: value }).where(eq(classGroups.code, row.groupCode));
    return { ok: true, scope: "group", groupCode: row.groupCode };
  }
  if (!row.dupRows) throw new ScreeningError("รายการนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ");
  await db.update(groupSubjects).set({ review: value }).where(eq(groupSubjects.id, row.id));
  return { ok: true, scope: "item" };
}

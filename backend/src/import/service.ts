import { desc, eq, sql } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { asJson, db, type DB } from "../db/client";
import {
  buildings, classGroups, groupSubjects, importLogs, rooms, sourceRows, subjects, teachers, teacherSubjects,
} from "../db/schema";
import { screeningSummary } from "../screening/service";
import { isBlankRow, text } from "./normalize";
import { detectFileType } from "./detect";
import { guessMajor } from "./groupCode";
import { parsers } from "./parsers";
import { FILE_TYPE_LABELS, type FileType, type ImportData, type ParseResult, type RowIssue, type Sheet } from "./types";
import { FormatError, formatOf, readInput } from "./workbook";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Exec = DB | Tx;

const CHUNK = 500;

// Unqualified column refs for ON DUPLICATE KEY UPDATE (works on MySQL 8 and MariaDB/XAMPP).
const q = (c: AnyMySqlColumn) => "`" + c.name + "`";
const vals = (c: AnyMySqlColumn) => sql.raw(`values(${q(c)})`);
const same = (c: AnyMySqlColumn) => sql.raw(q(c));
const keepIfNull = (c: AnyMySqlColumn) => sql.raw(`coalesce(values(${q(c)}), ${q(c)})`);

export class ImportError extends Error {}

export interface TableCount { inserted: number; updated: number; skipped: number }

export interface PreviewResult extends Omit<ParseResult, "data"> {
  fileName: string;
  type: FileType;
  typeLabel: string;
  counts: Record<string, number>;
  errorCount: number;
  warningCount: number;
}

async function parseFile(file: File): Promise<{ type: FileType; parsed: ParseResult; sheets: Sheet[] }> {
  if (!formatOf(file.name)) throw new ImportError("รองรับเฉพาะไฟล์ .xlsx, .csv และ .json");
  let sheets;
  try {
    sheets = readInput(file.name, new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    throw new ImportError(e instanceof FormatError ? e.message : "อ่านไฟล์ไม่ได้ — ตรวจว่าเป็นไฟล์ .xlsx / .csv / .json ที่ถูกต้อง");
  }
  const type = detectFileType(sheets);
  if (!type) {
    throw new ImportError(
      "ไม่รู้จักรูปแบบข้อมูล — หัวตารางต้องตรงกับแม่แบบ (กลุ่มเรียน / รหัสและชื่อวิชา / อาจารย์ / อาคารเรียน) ดาวน์โหลดแม่แบบได้ที่หน้านำเข้าไฟล์",
    );
  }
  return { type, parsed: parsers[type](sheets), sheets };
}

/** Checks that need the database (foreign keys, conflicting names). Mutates `data` to drop bad rows. */
async function checkAgainstDb(exec: Exec, data: ImportData): Promise<RowIssue[]> {
  const issues: RowIssue[] = [];
  if (data.type === "subjects") {
    const knownRows = await exec.select({ code: classGroups.code, major: classGroups.major }).from(classGroups);
    const known = new Set(knownRows.map((r) => r.code));
    const missing = new Map<string, number>();
    for (const g of data.groupSubjects) {
      if (!known.has(g.groupCode)) missing.set(g.groupCode, (missing.get(g.groupCode) ?? 0) + 1);
    }
    // Missing groups are created automatically (name = code, major guessed from the code);
    // importing the groups file later fills in the real name.
    data.newGroups = [...missing.keys()].map((code) => ({ code, major: guessMajor(code, knownRows) }));
    // placeholder groups from an earlier import (name = code, no major) also get a guessed major
    const realGroups = knownRows.filter((r) => r.major);
    const placeholderRows = await exec.select().from(classGroups);
    data.fillMajors = placeholderRows
      .filter((g) => g.name === g.code && !g.major)
      .map((g) => ({ code: g.code, major: guessMajor(g.code, realGroups) }))
      .filter((g) => g.major);
    for (const g of data.newGroups) {
      issues.push({
        sheet: "ฐานข้อมูล",
        row: 0,
        level: "warning",
        message: `กลุ่มเรียน ${g.code} ไม่อยู่ในทะเบียนกลุ่มเรียน (${missing.get(g.code)} แถว) — เก็บข้อมูลไว้ สถานะ "ไม่มีการลงทะเบียน" ไม่นำไปจัดตาราง`,
      });
    }
  }
  if (data.type === "teachers") {
    const existing = new Map(
      (await exec.select().from(subjects)).map((s) => [s.code, s.name] as const),
    );
    for (const s of data.subjects) {
      const cur = existing.get(s.code);
      if (cur && cur !== s.name) {
        issues.push({
          sheet: "ฐานข้อมูล",
          row: 0,
          level: "warning",
          message: `วิชา ${s.code}: ชื่อในไฟล์ "${s.name}" ไม่ตรงกับฐานข้อมูล "${cur}" (คงชื่อเดิมไว้)`,
        });
      }
    }
  }
  return issues;
}

function countsOf(data: ImportData): Record<string, number> {
  switch (data.type) {
    case "class_groups": return { กลุ่มเรียน: data.groups.length };
    case "subjects": return {
      รายวิชา: data.subjects.length,
      วิชาของกลุ่มเรียน: data.groupSubjects.length,
      ...(data.newGroups?.length ? { กลุ่มเรียนที่จะสร้างใหม่: data.newGroups.length } : {}),
    };
    case "teachers": return {
      อาจารย์: data.teachers.length, รายวิชา: data.subjects.length, รายวิชาที่สอน: data.assignments.length,
    };
    case "buildings": return { อาคารเรียน: data.buildings.length, ห้องเรียน: data.rooms.length };
  }
}

export async function preview(file: File): Promise<PreviewResult> {
  const { type, parsed } = await parseFile(file);
  const dbIssues = await checkAgainstDb(db, parsed.data);
  const issues = [...parsed.issues, ...dbIssues];
  return {
    fileName: file.name,
    type,
    typeLabel: FILE_TYPE_LABELS[type],
    preview: parsed.preview,
    issues,
    counts: countsOf(parsed.data),
    errorCount: issues.filter((i) => i.level === "error").length,
    warningCount: issues.filter((i) => i.level === "warning").length,
  };
}

// ---------- commit ----------

async function inChunks<T>(rows: T[], fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK));
}

function tally<T>(rows: T[], keyOf: (r: T) => string, existing: Set<string>): TableCount {
  let inserted = 0;
  let updated = 0;
  for (const r of rows) (existing.has(keyOf(r)) ? updated++ : inserted++);
  return { inserted, updated, skipped: 0 };
}

async function upsertSubjects(tx: Tx, list: { code: string; name: string }[], updateNames: boolean) {
  const existing = new Set((await tx.select({ c: subjects.code }).from(subjects)).map((r) => r.c));
  const count = tally(list, (s) => s.code, existing);
  if (!updateNames) {
    count.skipped = count.updated;
    count.updated = 0;
  }
  await inChunks(list, (c) =>
    tx.insert(subjects).values(c).onDuplicateKeyUpdate({
      set: updateNames ? { name: vals(subjects.name) } : { code: same(subjects.code) },
    }),
  );
  return count;
}

async function commitData(tx: Tx, data: ImportData, fileName: string): Promise<Record<string, TableCount>> {
  switch (data.type) {
    case "class_groups": {
      const existing = new Set((await tx.select({ c: classGroups.code }).from(classGroups)).map((r) => r.c));
      const count = tally(data.groups, (g) => g.code, existing);
      // the groups file IS the registry → every group in it is registered
      await inChunks(data.groups, (c) =>
        tx.insert(classGroups).values(c.map((g) => ({ ...g, registered: 1 }))).onDuplicateKeyUpdate({
          set: {
            name: vals(classGroups.name), major: vals(classGroups.major),
            students: keepIfNull(classGroups.students), registered: vals(classGroups.registered),
          },
        }),
      );
      return { class_groups: count };
    }

    case "subjects": {
      const newGroups = data.newGroups ?? [];
      await inChunks(newGroups, (c) =>
        tx.insert(classGroups)
          .values(c.map((g) => ({ code: g.code, name: g.code, major: g.major })))
          .onDuplicateKeyUpdate({ set: { code: same(classGroups.code) } }),
      );
      for (const g of data.fillMajors ?? []) {
        await tx.update(classGroups).set({ major: g.major }).where(eq(classGroups.code, g.code));
      }
      const subjectCount = await upsertSubjects(tx, data.subjects, true);
      const existing = new Set(
        (await tx.select({ g: groupSubjects.groupCode, s: groupSubjects.subjectCode }).from(groupSubjects))
          .map((r) => `${r.g}|${r.s}`),
      );
      const gsCount = tally(data.groupSubjects, (g) => `${g.groupCode}|${g.subjectCode}`, existing);
      await inChunks(data.groupSubjects, (c) =>
        tx.insert(groupSubjects).values(c.map((g) => ({
          groupCode: g.groupCode, subjectCode: g.subjectCode, subjectName: g.subjectName, periodsPerWeek: g.periodsPerWeek,
          sourceFile: fileName, sourceSheet: g.sourceSheet, sourceRow: g.sourceRow, dupRows: g.dupRows.join(","),
        }))).onDuplicateKeyUpdate({
          set: {
            periodsPerWeek: vals(groupSubjects.periodsPerWeek), subjectName: vals(groupSubjects.subjectName),
            sourceFile: vals(groupSubjects.sourceFile), sourceSheet: vals(groupSubjects.sourceSheet),
            sourceRow: vals(groupSubjects.sourceRow), dupRows: vals(groupSubjects.dupRows),
          },
        }),
      );
      return {
        ...(newGroups.length ? { class_groups: { inserted: newGroups.length, updated: 0, skipped: 0 } } : {}),
        subjects: subjectCount,
        group_subjects: gsCount,
      };
    }

    case "teachers": {
      const existingT = new Set((await tx.select({ n: teachers.name }).from(teachers)).map((r) => r.n));
      const tCount = tally(data.teachers, (t) => t.name, existingT);
      await inChunks(data.teachers, (c) =>
        tx.insert(teachers).values(c).onDuplicateKeyUpdate({
          set: {
            rank: keepIfNull(teachers.rank),
            department: keepIfNull(teachers.department),
          },
        }),
      );
      const subjectCount = await upsertSubjects(tx, data.subjects, false);

      const idByName = new Map(
        (await tx.select({ id: teachers.id, n: teachers.name }).from(teachers)).map((r) => [r.n, r.id]),
      );
      const rows = data.assignments.map((a) => ({
        teacherId: idByName.get(a.teacherName)!,
        subjectCode: a.subjectCode,
        subjectName: a.subjectName,
        role: a.role,
      }));
      const existingRows = await tx
        .select({ t: teacherSubjects.teacherId, s: teacherSubjects.subjectCode, n: teacherSubjects.subjectName })
        .from(teacherSubjects);
      // rows from an older import have no subject name — treat them as the same row (it gets replaced below)
      const existingA = new Set(existingRows.flatMap((r) => [`${r.t}|${r.s}|${r.n}`, ...(r.n === "" ? [`${r.t}|${r.s}|*`] : [])]));
      let aInserted = 0, aUpdated = 0;
      for (const r of rows) {
        if (existingA.has(`${r.teacherId}|${r.subjectCode}|${r.subjectName}`) || existingA.has(`${r.teacherId}|${r.subjectCode}|*`)) aUpdated++;
        else aInserted++;
      }
      const aCount = { inserted: aInserted, updated: aUpdated, skipped: 0 };
      await inChunks(rows, (c) =>
        tx.insert(teacherSubjects).values(c).onDuplicateKeyUpdate({
          set: { role: vals(teacherSubjects.role) },
        }),
      );
      // drop legacy name-less rows that now have a named row for the same teacher + code
      await tx.execute(sql.raw(
        "DELETE a FROM teacher_subjects a JOIN teacher_subjects b " +
        "ON a.teacher_id = b.teacher_id AND a.subject_code = b.subject_code AND b.subject_name <> '' " +
        "WHERE a.subject_name = ''",
      ));
      return { teachers: tCount, subjects: subjectCount, teacher_subjects: aCount };
    }

    case "buildings": {
      const existingB = new Set((await tx.select({ n: buildings.name }).from(buildings)).map((r) => r.n));
      const bCount = tally(data.buildings, (b) => b.name, existingB);
      await inChunks(data.buildings, (c) =>
        tx.insert(buildings).values(c).onDuplicateKeyUpdate({ set: { name: same(buildings.name) } }),
      );
      const idByName = new Map(
        (await tx.select({ id: buildings.id, n: buildings.name }).from(buildings)).map((r) => [r.n, r.id]),
      );
      const roomRows = data.rooms.map((r) => ({
        buildingId: idByName.get(r.buildingName)!, roomCode: r.roomCode, capacity: r.capacity, roomType: r.roomType,
      }));
      const existingR = new Set(
        (await tx.select({ b: rooms.buildingId, r: rooms.roomCode }).from(rooms)).map((r) => `${r.b}|${r.r}`),
      );
      const rCount = tally(roomRows, (r) => `${r.buildingId}|${r.roomCode}`, existingR);
      await inChunks(roomRows, (c) =>
        tx.insert(rooms).values(c).onDuplicateKeyUpdate({
          set: { capacity: keepIfNull(rooms.capacity), roomType: keepIfNull(rooms.roomType) },
        }),
      );
      return { buildings: bCount, rooms: rCount };
    }
  }
}

/** Keep every original row (never deleted). Rows of older imports of the same file type become inactive. */
async function saveSourceRows(tx: Tx, importId: number | null, type: FileType, fileName: string, sheets: Sheet[], issues: RowIssue[]) {
  const errorAt = new Map<string, string[]>();
  for (const i of issues) {
    if (i.level !== "error" || i.row < 2) continue;
    const k = `${i.sheet}|${i.row}`;
    (errorAt.get(k) ?? errorAt.set(k, []).get(k)!).push(i.message);
  }
  await tx.update(sourceRows).set({ active: 0 }).where(eq(sourceRows.fileType, type));
  const rows: (typeof sourceRows.$inferInsert)[] = [];
  for (const s of sheets) {
    const header = (s.rows[0] ?? []).map((h, i) => text(h) || `คอลัมน์ ${i + 1}`);
    s.rows.slice(1).forEach((r, i) => {
      if (isBlankRow(r)) return;
      const rowNo = i + 2;
      const data = Object.fromEntries(header.map((h, c) => [h, r[c] ?? null]));
      rows.push({
        importId, fileType: type, fileName, sheet: s.name, rowNo, data,
        parseError: errorAt.get(`${s.name}|${rowNo}`)?.join(" · ") ?? null, active: 1,
      });
    });
  }
  await inChunks(rows, (c) => tx.insert(sourceRows).values(c));
  return rows.length;
}

export async function commit(file: File) {
  const { type, parsed, sheets } = await parseFile(file);
  const issues = [...parsed.issues];
  const rowErrors = issues.filter((i) => i.level === "error").length;

  const details = await db.transaction(async (tx) => {
    issues.push(...(await checkAgainstDb(tx, parsed.data)));
    return commitData(tx, parsed.data, file.name);
  });

  const dbSkipped = issues
    .filter((i) => i.sheet === "ฐานข้อมูล" && i.level === "error")
    .reduce((n, i) => n + Number(/\((\d+) แถว/.exec(i.message)?.[1] ?? 0), 0);

  const totals = Object.values(details).reduce(
    (a, c) => ({ inserted: a.inserted + c.inserted, updated: a.updated + c.updated }),
    { inserted: 0, updated: 0 },
  );
  const skipped = rowErrors + dbSkipped;

  const [res] = await db.insert(importLogs).values({
    fileName: file.name,
    fileType: type,
    inserted: totals.inserted,
    updated: totals.updated,
    skipped,
    details,
    errors: issues,
  }).$returningId();
  const sourceCount = await db.transaction((tx) => saveSourceRows(tx, res?.id ?? null, type, file.name, sheets, issues));

  // A. automatic screening right after the import is confirmed
  const screening = await screeningSummary();

  return {
    id: res?.id, fileName: file.name, type, typeLabel: FILE_TYPE_LABELS[type], ...totals, skipped, details, issues,
    sourceRows: sourceCount, screening,
  };
}

const parseLog = (r: typeof importLogs.$inferSelect) => ({
  ...r, details: asJson(r.details), errors: asJson(r.errors) ?? [],
});

export async function listImports(limit = 50) {
  const rows = await db.select().from(importLogs).orderBy(desc(importLogs.id)).limit(limit);
  return rows.map(parseLog);
}

export async function getImport(id: number) {
  const [row] = await db.select().from(importLogs).where(eq(importLogs.id, id));
  return row ? parseLog(row) : null;
}

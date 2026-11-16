import {
  mysqlTable, varchar, int, mysqlEnum, json, timestamp, uniqueIndex, index, primaryKey,
} from "drizzle-orm/mysql-core";

export const classGroups = mysqlTable("class_groups", {
  code: varchar("code", { length: 32 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  major: varchar("major", { length: 255 }),
  /** null → ใช้ 30 คน */
  students: int("students"),
});

export const teachers = mysqlTable("teachers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  rank: varchar("rank", { length: 100 }),
  department: varchar("department", { length: 255 }),
});

export const ROOM_TYPES = ["บรรยาย", "ปฏิบัติการ"] as const;

export const subjects = mysqlTable("subjects", {
  code: varchar("code", { length: 32 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  /** ประเภทห้องที่ต้องใช้ (null = ห้องใดก็ได้) */
  roomType: varchar("room_type", { length: 20 }),
});

export const groupSubjects = mysqlTable(
  "group_subjects",
  {
    id: int("id").autoincrement().primaryKey(),
    groupCode: varchar("group_code", { length: 32 }).notNull()
      .references(() => classGroups.code, { onDelete: "cascade", onUpdate: "cascade" }),
    subjectCode: varchar("subject_code", { length: 32 }).notNull()
      .references(() => subjects.code, { onDelete: "cascade", onUpdate: "cascade" }),
    periodsPerWeek: int("periods_per_week").notNull(),
    /** ชื่อวิชาตามที่กลุ่มนี้ลงทะเบียน (รหัสเดียวกันอาจชื่อต่างกันในแต่ละกลุ่ม) */
    subjectName: varchar("subject_name", { length: 255 }).notNull().default(""),
  },
  (t) => [uniqueIndex("uq_group_subject").on(t.groupCode, t.subjectCode)],
);

export const TEACHER_ROLES = ["ผู้สอนหลัก", "ผู้สอนร่วม"] as const;

export const teacherSubjects = mysqlTable(
  "teacher_subjects",
  {
    id: int("id").autoincrement().primaryKey(),
    teacherId: int("teacher_id").notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    subjectCode: varchar("subject_code", { length: 32 }).notNull()
      .references(() => subjects.code, { onDelete: "cascade", onUpdate: "cascade" }),
    role: mysqlEnum("role", TEACHER_ROLES).notNull(),
    /** ชื่อวิชาตามไฟล์อาจารย์ — ใช้จับคู่กับชื่อวิชาของกลุ่ม */
    subjectName: varchar("subject_name", { length: 255 }).notNull().default(""),
  },
  (t) => [uniqueIndex("uq_teacher_subject_name").on(t.teacherId, t.subjectCode, t.subjectName)],
);

export const buildings = mysqlTable("buildings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
});

export const rooms = mysqlTable(
  "rooms",
  {
    id: int("id").autoincrement().primaryKey(),
    buildingId: int("building_id").notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    roomCode: varchar("room_code", { length: 64 }).notNull(),
    capacity: int("capacity"),
    roomType: varchar("room_type", { length: 20 }),
  },
  (t) => [uniqueIndex("uq_building_room").on(t.buildingId, t.roomCode)],
);

export const importLogs = mysqlTable("import_logs", {
  id: int("id").autoincrement().primaryKey(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileType: varchar("file_type", { length: 32 }).notNull(),
  inserted: int("inserted").notNull().default(0),
  updated: int("updated").notNull().default(0),
  skipped: int("skipped").notNull().default(0),
  details: json("details"),
  errors: json("errors"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- timetable ----------

export const scheduleRuns = mysqlTable("schedule_runs", {
  id: int("id").autoincrement().primaryKey(),
  options: json("options"),
  /** { checks, totalViolations, balance, coverage, notes, unplaced, ms } */
  summary: json("summary"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const scheduleEntries = mysqlTable(
  "schedule_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    runId: int("run_id").notNull().references(() => scheduleRuns.id, { onDelete: "cascade" }),
    groupCode: varchar("group_code", { length: 32 }).notNull(),
    subjectCode: varchar("subject_code", { length: 32 }).notNull(),
    teacherId: int("teacher_id"),
    building: varchar("building", { length: 255 }).notNull(),
    day: int("day").notNull(),
    period: int("period").notNull(),
    blockId: int("block_id").notNull(),
    split: int("split").notNull().default(0),
    roomId: int("room_id"),
  },
  (t) => [
    uniqueIndex("uq_run_group_slot").on(t.runId, t.groupCode, t.day, t.period),
    uniqueIndex("uq_run_teacher_slot").on(t.runId, t.teacherId, t.day, t.period),
    uniqueIndex("uq_run_room_slot").on(t.runId, t.roomId, t.day, t.period),
    index("ix_run_building").on(t.runId, t.building),
  ],
);

export const teacherUnavailability = mysqlTable(
  "teacher_unavailability",
  {
    teacherId: int("teacher_id").notNull().references(() => teachers.id, { onDelete: "cascade" }),
    day: int("day").notNull(),
    period: int("period").notNull(),
  },
  (t) => [primaryKey({ columns: [t.teacherId, t.day, t.period] })],
);

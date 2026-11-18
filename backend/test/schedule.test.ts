import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { guessMajor } from "../src/import/groupCode";
import { parsers } from "../src/import/parsers";
import type { ImportData } from "../src/import/types";
import { readWorkbook } from "../src/import/workbook";
import { buildInput, type RawData } from "../src/schedule/input";
import { demandDepartment, departmentBuilding, groupBuilding, isGeneralSubject, specialRule } from "../src/schedule/rules";
import { blockPlan, holePenalty, solve } from "../src/schedule/solver";
import type { DemandIn, SolverInput } from "../src/schedule/types";
import { validate } from "../src/schedule/validate";

const ROOT = join(import.meta.dir, "..", "..");
const fixture = (prefix: string) =>
  readWorkbook(readFileSync(join(ROOT, readdirSync(ROOT).find((f) => f.startsWith(prefix) && f.endsWith(".xlsx"))!)));

function realData(): RawData {
  const G = parsers.class_groups(fixture("กลุ่มเรียน")).data as Extract<ImportData, { type: "class_groups" }>;
  const S = parsers.subjects(fixture("รหัสและชื่อวิชา")).data as Extract<ImportData, { type: "subjects" }>;
  const T = parsers.teachers(fixture("ชื่ออาจารย์")).data as Extract<ImportData, { type: "teachers" }>;
  const B = parsers.buildings(fixture("อาคารเรียน")).data as Extract<ImportData, { type: "buildings" }>;
  const known = new Set(G.groups.map((g) => g.code));
  const missing = [...new Set(S.groupSubjects.map((g) => g.groupCode))].filter((c) => !known.has(c));
  const teachers = T.teachers.map((t, i) => ({ id: i + 1, name: t.name, department: t.department }));
  const tid = new Map(teachers.map((t) => [t.name, t.id]));
  return {
    groups: [...G.groups, ...missing.map((code) => ({ code, name: code, major: guessMajor(code, G.groups) }))],
    subjects: S.subjects,
    groupSubjects: S.groupSubjects,
    teachers,
    teacherSubjects: T.assignments.map((a) => ({
      teacherId: tid.get(a.teacherName)!, subjectCode: a.subjectCode, subjectName: a.subjectName, role: a.role,
    })),
    buildings: B.buildings.map((b) => b.name),
  };
}

describe("rules", () => {
  test("general subjects", () => {
    expect(isGeneralSubject("20000-1101")).toBe(true);
    expect(isGeneralSubject("30000-1501")).toBe(true);
    expect(isGeneralSubject("20000-1301")).toBe(true);
    expect(isGeneralSubject("20000-1401")).toBe(true);
    expect(isGeneralSubject("20001-1002")).toBe(true);
    expect(isGeneralSubject(" 20000-1201 ")).toBe(true);
    expect(isGeneralSubject("20000-2006")).toBe(false);
    expect(isGeneralSubject("20101-2108")).toBe(false);
  });
  test("special subjects", () => {
    expect(specialRule("กิจกรรมองค์การวิชาชีพ 4")).toBe("org_activity_thu");
    expect(specialRule("กิจกรรมองค์การวิชาชีพ 1")).toBe("org_activity_thu");
    expect(specialRule("กิจกรรมองค์การวิชาชีพ 3")).toBe("org_activity_thu");
    expect(specialRule("กิจกรรมลูกเสือ")).toBeNull();
  });
  test("building from group code", () => {
    const b = ["อาคารเรียนรวม", "อาคารเทคโนโลยี", "อาคารบริหารธุรกิจ", "อาคารอุตสาหกรรม", "อาคารสามัญศึกษา"];
    expect(groupBuilding("662010101", null, b)).toBe("อาคารอุตสาหกรรม");
    expect(groupBuilding("662020101", null, b)).toBe("อาคารบริหารธุรกิจ");
    expect(groupBuilding("672190101", null, b)).toBe("อาคารเทคโนโลยี");
    expect(groupBuilding("662070101", null, b)).toBe("อาคารเรียนรวม");
  });
  test("department → building", () => {
    const b = ["อาคารเรียนรวม", "อาคารเทคโนโลยี", "อาคารบริหารธุรกิจ", "อาคารอุตสาหกรรม", "อาคารสามัญศึกษา"];
    expect(demandDepartment("662010101", null, "20101-2001")).toBe("อุตสาหกรรม");
    expect(demandDepartment("662010101", null, "20000-1101")).toBe("สามัญ");
    expect(demandDepartment("672190101", null, "30901-2001")).toBe("เทคโนโลยีสารสนเทศ");
    expect(departmentBuilding("สามัญ", b)).toEqual({ building: "อาคารสามัญศึกษา", own: true });
    expect(departmentBuilding("เทคโนโลยีสารสนเทศ", b)).toEqual({ building: "อาคารเทคโนโลยี", own: true });
    expect(departmentBuilding("ท่องเที่ยวและโรงแรม", b)).toEqual({ building: "อาคารเรียนรวม", own: false });
    expect(departmentBuilding("คหกรรม", [...b, "อาคารคหกรรม"])).toEqual({ building: "อาคารคหกรรม", own: true });
  });
  test("only usable data: unregistered subjects and their teachers are not processed", () => {
    const { input, summary } = buildInput({
      groups: [{ code: "662010101", name: "A", major: null }],
      subjects: [{ code: "20101-2001", name: "งานยนต์" }, { code: "20000*2006", name: "วิชาไม่ได้ลง" }],
      groupSubjects: [{ groupCode: "662010101", subjectCode: "20101-2001", periodsPerWeek: 4 }],
      teachers: [{ id: 1, name: "T1", department: null }, { id: 2, name: "T2", department: null }],
      teacherSubjects: [
        { teacherId: 1, subjectCode: "20101-2001", role: "ผู้สอนหลัก" },
        { teacherId: 2, subjectCode: "20000*2006", role: "ผู้สอนหลัก" },
      ],
      buildings: ["อาคารอุตสาหกรรม"],
    });
    expect(input.demands.map((d) => d.subjectCode)).toEqual(["20101-2001"]);
    expect(input.teachers.map((t) => t.id)).toEqual([1]);
    expect(summary.skipped.unregisteredSubjects).toBe(1);
    expect(summary.skipped.assignmentsOfUnregistered).toBe(1);
    expect(summary.skipped.teachersWithoutRegisteredSubject).toBe(1);
    expect(summary.departments).toEqual([{ department: "อุตสาหกรรม", building: "อาคารอุตสาหกรรม", ownBuilding: true, registrations: 1, hours: 4 }]);
  });
  test("teacher must match the group's registered subject code AND name", () => {
    // 30202-8001 means "ฝึกงาน" for group A but "ภาษาอังกฤษ…" for group B
    const { input, summary } = buildInput({
      groups: [{ code: "662020101", name: "A", major: null }, { code: "662020102", name: "B", major: null }],
      subjects: [{ code: "30202-8001", name: "ฝึกงาน" }],
      groupSubjects: [
        { groupCode: "662020101", subjectCode: "30202-8001", subjectName: "ฝึกงาน", periodsPerWeek: 4 },
        { groupCode: "662020102", subjectCode: "30202-8001", subjectName: "ภาษาอังกฤษเตรียมความพร้อม", periodsPerWeek: 2 },
      ],
      teachers: [{ id: 1, name: "ครูฝึกงาน", department: null }, { id: 2, name: "ครูอังกฤษ", department: null }, { id: 3, name: "ครูเคมี", department: null }],
      teacherSubjects: [
        { teacherId: 1, subjectCode: "30202-8001", subjectName: "ฝึกงาน", role: "ผู้สอนหลัก" },
        { teacherId: 2, subjectCode: "30202-8001", subjectName: "ภาษาอังกฤษเตรียมความพร้อม", role: "ผู้สอนหลัก" },
        { teacherId: 3, subjectCode: "30202-8001", subjectName: "เคมี", role: "ผู้สอนหลัก" },
      ],
      buildings: ["อาคารบริหารธุรกิจ"],
    });
    const byGroup = Object.fromEntries(input.demands.map((d) => [d.groupCode, d]));
    expect(byGroup["662020101"]!.mainTeachers).toEqual([1]);
    expect(byGroup["662020102"]!.mainTeachers).toEqual([2]);
    expect(byGroup["662020102"]!.subjectName).toBe("ภาษาอังกฤษเตรียมความพร้อม");
    expect(summary.skipped.assignmentsNameMismatch).toBe(1); // ครูเคมี matches no group
    expect(input.teachers.map((t) => t.id).sort()).toEqual([1, 2]);
    const r = solve(input);
    expect(r.entries.filter((e) => e.groupCode === "662020101").every((e) => e.teacherId === 1 || e.teacherId === null)).toBe(true);
    expect(r.entries.filter((e) => e.groupCode === "662020102").every((e) => e.teacherId === 2 || e.teacherId === null)).toBe(true);
    expect(validate(input, r.entries).totalViolations).toBe(0);
  });
  test("guess major from code", () => {
    const known = [{ code: "662010101", major: "ช่างยนต์" }, { code: "662020201", major: "การตลาด" }];
    expect(guessMajor("672010102", known)).toBe("ช่างยนต์");
    expect(guessMajor("663020201", known)).toBe("การตลาด");
    expect(guessMajor("กรณีพิเศษ", known)).toBeNull();
  });
  test("block plan and hole penalty", () => {
    expect(blockPlan(3)).toEqual([3]);
    expect(blockPlan(8)).toEqual([4, 4]);
    expect(blockPlan(5)).toEqual([3, 2]);
    const row = (s: string) => [...s].map((c) => c === "x");
    expect(holePenalty(row("xxxx.xx...."))).toBe(0); // break after 4 is required
    expect(holePenalty(row("xx..xx...."))).toBe(1); // one of the two gaps is needed (2+2+1 > 4)
    expect(holePenalty(row("x...x....."))).toBe(3); // none needed
  });
});

describe("solver on small cases", () => {
  const demand = (o: Partial<DemandIn>): DemandIn => ({
    groupCode: "G1", subjectCode: "S1", subjectName: "วิชา", hours: 2, building: "A",
    special: null, isProject: false, students: 30, roomType: null, roomRequired: false, rooms: [],
    mainTeachers: [1], coTeachers: [], ...o,
  });

  test("two groups sharing one teacher never clash; teacher limits hold", () => {
    const input: SolverInput = {
      groups: [{ code: "G1", name: "G1", major: null, building: "A", students: 30 }, { code: "G2", name: "G2", major: null, building: "A", students: 30 }],
      teachers: [{ id: 1, name: "T1", department: null }],
      demands: [
        demand({ hours: 4 }), demand({ subjectCode: "S2", hours: 4 }), demand({ subjectCode: "S3", hours: 4 }),
        demand({ groupCode: "G2", hours: 4 }), demand({ groupCode: "G2", subjectCode: "S2", hours: 4 }),
      ],
    };
    const r = solve(input);
    expect(validate(input, r.entries).totalViolations).toBe(0);
    expect(r.entries.length).toBe(20);
  });

  test("กิจกรรมองค์การวิชาชีพ 4 lands on Thursday ending at period 10", () => {
    const input: SolverInput = {
      groups: [{ code: "G1", name: "G1", major: null, building: "A", students: 30 }],
      teachers: [{ id: 1, name: "T1", department: null }],
      demands: [demand({ hours: 3, special: "org_activity_thu", subjectName: "กิจกรรมองค์การวิชาชีพ 4" }), demand({ subjectCode: "S2", hours: 8 })],
    };
    const r = solve(input);
    const act = r.entries.filter((e) => e.subjectCode === "S1");
    expect(act.every((e) => e.day === 3)).toBe(true);
    expect(act.map((e) => e.period).sort()).toEqual([7, 8, 9]);
    const days = new Set(r.entries.filter((e) => e.subjectCode === "S2").map((e) => e.day));
    expect(days.size).toBe(2); // 8 h → 4 + 4 on different days
    expect(validate(input, r.entries).totalViolations).toBe(0);
  });

  test("unavailable teacher slots are respected", () => {
    const unavailable = { 1: Array.from({ length: 10 }, (_, p) => `0:${p}`) }; // Monday off
    const input: SolverInput = {
      groups: [{ code: "G1", name: "G1", major: null, building: "A", students: 30 }],
      teachers: [{ id: 1, name: "T1", department: null }],
      demands: [demand({ hours: 4 }), demand({ subjectCode: "S2", hours: 4 })],
      unavailable,
    };
    const r = solve(input);
    expect(r.entries.filter((e) => e.teacherId === 1 && e.day === 0)).toEqual([]);
    expect(validate(input, r.entries).totalViolations).toBe(0);
  });
});

describe("rooms", () => {
  const base = (rooms: RawData["rooms"], students = 30): RawData => ({
    groups: [
      { code: "662010101", name: "A1", major: "ช่างยนต์", students },
      { code: "662010102", name: "A2", major: "ช่างยนต์", students },
    ],
    subjects: [{ code: "20101-2001", name: "งานยนต์", roomType: "ปฏิบัติการ" }, { code: "20101-2002", name: "ทฤษฎียนต์", roomType: null }],
    groupSubjects: [
      { groupCode: "662010101", subjectCode: "20101-2001", periodsPerWeek: 4 },
      { groupCode: "662010102", subjectCode: "20101-2001", periodsPerWeek: 4 },
      { groupCode: "662010101", subjectCode: "20101-2002", periodsPerWeek: 2 },
      { groupCode: "662010102", subjectCode: "20101-2002", periodsPerWeek: 2 },
    ],
    teachers: [{ id: 1, name: "T1", department: null }],
    teacherSubjects: [{ teacherId: 1, subjectCode: "20101-2001", role: "ผู้สอนหลัก" }, { teacherId: 1, subjectCode: "20101-2002", role: "ผู้สอนหลัก" }],
    buildings: ["อาคารอุตสาหกรรม", "อาคารสามัญศึกษา"],
    rooms,
  });

  test("one lab room is shared by two groups without clashing; type and capacity respected", () => {
    const { input } = buildInput(base([
      { id: 1, building: "อาคารอุตสาหกรรม", roomCode: "LAB1", capacity: 35, roomType: "ปฏิบัติการ" },
      { id: 2, building: "อาคารอุตสาหกรรม", roomCode: "101", capacity: 40, roomType: "บรรยาย" },
    ]));
    const r = solve(input);
    expect(r.unplaced).toEqual([]);
    expect(validate(input, r.entries).totalViolations).toBe(0);
    expect(r.entries.filter((e) => e.subjectCode === "20101-2001").every((e) => e.roomId === 1)).toBe(true);
    expect(r.entries.filter((e) => e.subjectCode === "20101-2002").every((e) => e.roomId === 2)).toBe(true);
  });

  test("room too small → reported as unplaced with a reason, never double-booked", () => {
    const { input, notes } = buildInput(base([
      { id: 1, building: "อาคารอุตสาหกรรม", roomCode: "LAB1", capacity: 20, roomType: "ปฏิบัติการ" },
      { id: 2, building: "อาคารอุตสาหกรรม", roomCode: "101", capacity: 40, roomType: "บรรยาย" },
    ], 30));
    const r = solve(input);
    expect(notes.some((n) => n.includes("ไม่มีห้องที่ตรงประเภท"))).toBe(true);
    expect(r.unplaced.map((u) => u.subjectCode)).toEqual(["20101-2001", "20101-2001"]);
    expect(r.unplaced[0]!.reason).toContain("ไม่มีห้อง");
    const v = validate(input, r.entries);
    expect(v.checks.find((c) => c.key === "room_clash")!.violations).toBe(0);
  });

  test("teacher unavailability from input is respected", () => {
    const all = Array.from({ length: 10 }, (_, p) => [`0:${p}`, `1:${p}`]).flat();
    const { input } = buildInput({ ...base([]), unavailable: { 1: all } });
    const r = solve(input);
    expect(r.entries.some((e) => e.teacherId === 1 && e.day <= 1)).toBe(false);
    expect(validate(input, r.entries).totalViolations).toBe(0);
  });
});

describe("real data", () => {
  for (const mode of ["period10", "groupLast"] as const) {
    test(`full timetable is 100% conflict-free (${mode})`, () => {
      const { input } = buildInput(realData(), { activityMode: mode });
      const r = solve(input);
      const v = validate(input, r.entries);
      const failed = v.checks.filter((c) => c.violations > 0).map((c) => `${c.label}: ${c.examples.join("; ")}`);
      expect(failed).toEqual([]);
      expect(r.unplaced).toEqual([]);
      expect(r.entries.length).toBe(input.demands.reduce((n, d) => n + d.hours, 0));
    });
  }
});

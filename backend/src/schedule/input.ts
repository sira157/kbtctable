import { demandDepartment, departmentBuilding, isProject, specialRule } from "./rules";
import { LIMITS, type DemandIn, type SolverInput } from "./types";

export interface RawRoom { id: number; building: string; roomCode: string; capacity: number | null; roomType: string | null }

export interface RawData {
  groups: { code: string; name: string; major: string | null; students?: number | null }[];
  subjects: { code: string; name: string; roomType?: string | null }[];
  /** subjectName = name as registered by this group ("" / missing → subjects.name) */
  groupSubjects: { groupCode: string; subjectCode: string; subjectName?: string; periodsPerWeek: number }[];
  teachers: { id: number; name: string; department: string | null }[];
  /** subjectName = name as written in the teacher file ("" / missing → match on code only) */
  teacherSubjects: { teacherId: number; subjectCode: string; subjectName?: string; role: string }[];
  buildings: string[];
  rooms?: RawRoom[];
  /** teacherId → ["day:period", ...] (0-based) */
  unavailable?: Record<number, string[]>;
}

/** Short, structured description of what data was used / skipped (shown at the top of the result). */
export interface DataSummary {
  used: { registrations: number; groups: number; subjects: number; hours: number; teachers: number; assignments: number };
  skipped: {
    unregisteredSubjects: number;
    unregisteredExamples: string[];
    assignmentsOfUnregistered: number;
    /** teaching rows whose code is registered but whose subject name matches no group's registration */
    assignmentsNameMismatch: number;
    nameMismatchExamples: string[];
    teachersWithoutRegisteredSubject: number;
    groupsWithoutRegistration: number;
    /** registrations with no teacher teaching that code + name */
    registrationsWithoutTeacher: number;
    withoutTeacherExamples: string[];
  };
  departments: { department: string; building: string; ownBuilding: boolean; registrations: number; hours: number }[];
  rooms: { buildingsWithRooms: string[]; noSuitableRoom: number };
  checkList: string[];
}

const labLast = (subjectType: string | null, r: RawRoom) =>
  subjectType !== "ปฏิบัติการ" && r.roomType === "ปฏิบัติการ" ? 1 : 0;

const norm = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();
/** names match when equal, or when either side has no name recorded (manual entry / old import) */
const sameName = (a: string, b: string) => !a || !b || a === b;

/**
 * Builds solver input from DB rows using ONLY usable data:
 *  - the registrations in the subject file (กลุ่มเรียน × รหัสวิชา/ชื่อวิชา × คาบ) are the core
 *  - a teacher is eligible for a registration only when they teach that subject code AND the
 *    subject name matches the name that group registered (one code can mean different subjects per group)
 *  - subjects nobody registered, and teaching rows that match no registration, are not processed (only counted)
 */
export function buildInput(raw: RawData, options: SolverInput["options"] = {}) {
  const subjName = new Map(raw.subjects.map((s) => [s.code, s.name]));
  const subjRoomType = new Map(raw.subjects.map((s) => [s.code, s.roomType ?? null]));
  const groupMap = new Map(raw.groups.map((g) => [g.code, g]));

  const regs = raw.groupSubjects
    .filter((gs) => groupMap.has(gs.groupCode) && gs.periodsPerWeek > 0)
    .map((gs) => ({ ...gs, name: norm(gs.subjectName) || norm(subjName.get(gs.subjectCode)) || gs.subjectCode }));
  const registered = new Set(regs.map((r) => r.subjectCode));

  const tsByCode = new Map<string, (RawData["teacherSubjects"][number] & { n: string })[]>();
  for (const ts of raw.teacherSubjects) {
    (tsByCode.get(ts.subjectCode) ?? tsByCode.set(ts.subjectCode, []).get(ts.subjectCode)!).push({ ...ts, n: norm(ts.subjectName) });
  }
  const usedTS = new Set<RawData["teacherSubjects"][number]>();

  const rooms = raw.rooms ?? [];
  const roomsByBuilding = new Map<string, RawRoom[]>();
  for (const r of rooms) (roomsByBuilding.get(r.building) ?? roomsByBuilding.set(r.building, []).get(r.building)!).push(r);

  const deptStats = new Map<string, DataSummary["departments"][number]>();
  const withoutTeacher: string[] = [];

  const demands: DemandIn[] = regs.map((gs) => {
    const g = groupMap.get(gs.groupCode)!;
    const dept = demandDepartment(g.code, g.major, gs.subjectCode);
    const { building, own } = departmentBuilding(dept, raw.buildings);
    const deptKey = dept ?? "ไม่ทราบแผนก";
    const ds = deptStats.get(deptKey) ?? deptStats.set(deptKey, { department: deptKey, building, ownBuilding: own, registrations: 0, hours: 0 }).get(deptKey)!;
    ds.registrations++;
    ds.hours += gs.periodsPerWeek;

    // teachers for exactly this group's subject (code + registered name)
    const eligible = (tsByCode.get(gs.subjectCode) ?? []).filter((ts) => sameName(ts.n, gs.name));
    eligible.forEach((ts) => usedTS.add(ts));
    const mainIds = [...new Set(eligible.filter((t) => t.role === "ผู้สอนหลัก").map((t) => t.teacherId))];
    const coIds = [...new Set(eligible.filter((t) => t.role !== "ผู้สอนหลัก").map((t) => t.teacherId))].filter((id) => !mainIds.includes(id));
    if (!eligible.length) withoutTeacher.push(`${gs.groupCode} ${gs.subjectCode} ${gs.name}`);

    const students = g.students ?? LIMITS.defaultStudents;
    const roomType = subjRoomType.get(gs.subjectCode) ?? null;
    const special = specialRule(gs.name);
    const inBuilding = roomsByBuilding.get(building) ?? [];
    const suitable = inBuilding
      .filter((r) => !roomType || !r.roomType || r.roomType === roomType)
      .filter((r) => r.capacity == null || r.capacity >= students)
      .sort((a, b) => labLast(roomType, a) - labLast(roomType, b) || (a.capacity ?? 9999) - (b.capacity ?? 9999));
    return {
      groupCode: gs.groupCode,
      subjectCode: gs.subjectCode,
      subjectName: gs.name,
      hours: gs.periodsPerWeek,
      building,
      students,
      roomType,
      // กิจกรรมองค์การวิชาชีพ: every group meets at the same time → building-level
      roomRequired: inBuilding.length > 0 && !special,
      rooms: special ? [] : suitable.map((r) => r.id),
      special,
      isProject: isProject(gs.name),
      mainTeachers: mainIds,
      coTeachers: coIds,
    };
  });

  // ---- summary ----
  const usedTeacherIds = new Set([...usedTS].map((t) => t.teacherId));
  const unregistered = raw.subjects.filter((s) => !registered.has(s.code));
  const ofUnregistered = raw.teacherSubjects.filter((ts) => !registered.has(ts.subjectCode));
  const nameMismatch = raw.teacherSubjects.filter((ts) => registered.has(ts.subjectCode) && !usedTS.has(ts));
  const usedGroups = new Set(regs.map((r) => r.groupCode));
  const noMain = demands.filter((d) => !d.mainTeachers.length && d.coTeachers.length).length;
  const noSuitableRoom = demands.filter((d) => d.roomRequired && d.rooms.length === 0).length;
  const placeholderGroups = raw.groups.filter((g) => usedGroups.has(g.code) && g.name === g.code).length;
  const nonNumeric = raw.groups.filter((g) => usedGroups.has(g.code) && !/^\d+$/.test(g.code)).map((g) => g.code);
  const noNames = raw.groupSubjects.length > 0 && raw.groupSubjects.every((g) => !norm(g.subjectName));

  const checkList: string[] = [];
  if (noNames) checkList.push("ยังไม่มีชื่อวิชารายกลุ่ม (นำเข้าก่อนอัปเดต) — จับคู่ผู้สอนด้วยรหัสวิชาอย่างเดียว: นำเข้าไฟล์รหัสและชื่อวิชา + ไฟล์อาจารย์ใหม่");
  if (noMain) checkList.push(`มีแต่ผู้สอนร่วม ไม่มีผู้สอนหลัก ${noMain} รายการ`);
  if (placeholderGroups) checkList.push(`กลุ่มเรียนที่ไม่มีในรายชื่อกลุ่ม ${placeholderGroups} กลุ่ม (ใช้รหัสเป็นชื่อ)`);
  if (nonNumeric.length) checkList.push(`รหัสกลุ่มไม่ใช่ตัวเลข: ${nonNumeric.join(", ")}`);
  if (noSuitableRoom) checkList.push(`ไม่มีห้องที่ตรงประเภท/จุได้ ${noSuitableRoom} รายการ`);
  const unknownDept = deptStats.get("ไม่ทราบแผนก");
  if (unknownDept) checkList.push(`ระบุแผนกไม่ได้ ${unknownDept.registrations} รายการ (ใช้ ${unknownDept.building})`);
  const unavailSlots = Object.values(raw.unavailable ?? {}).reduce((n, s) => n + s.length, 0);
  if (unavailSlots) checkList.push(`ใช้เวลาไม่ว่างของอาจารย์ ${Object.keys(raw.unavailable!).length} คน (${unavailSlots} คาบ)`);

  const summary: DataSummary = {
    used: {
      registrations: regs.length,
      groups: usedGroups.size,
      subjects: registered.size,
      hours: regs.reduce((n, r) => n + r.periodsPerWeek, 0),
      teachers: usedTeacherIds.size,
      assignments: usedTS.size,
    },
    skipped: {
      unregisteredSubjects: unregistered.length,
      unregisteredExamples: unregistered.slice(0, 5).map((s) => `${s.code} ${s.name}`),
      assignmentsOfUnregistered: ofUnregistered.length,
      assignmentsNameMismatch: nameMismatch.length,
      nameMismatchExamples: nameMismatch.slice(0, 5).map((ts) => {
        const t = raw.teachers.find((x) => x.id === ts.teacherId)?.name ?? `#${ts.teacherId}`;
        return `${t}: ${ts.subjectCode} ${norm(ts.subjectName)}`;
      }),
      teachersWithoutRegisteredSubject: raw.teachers.filter((t) => !usedTeacherIds.has(t.id)).length,
      groupsWithoutRegistration: raw.groups.filter((g) => !usedGroups.has(g.code)).length,
      registrationsWithoutTeacher: withoutTeacher.length,
      withoutTeacherExamples: withoutTeacher.slice(0, 5),
    },
    departments: [...deptStats.values()].sort((a, b) => b.hours - a.hours),
    rooms: { buildingsWithRooms: [...roomsByBuilding.keys()], noSuitableRoom },
    checkList,
  };

  const input: SolverInput = {
    groups: raw.groups
      .filter((g) => usedGroups.has(g.code))
      .map((g) => ({
        code: g.code, name: g.name, major: g.major,
        students: g.students ?? LIMITS.defaultStudents,
        building: departmentBuilding(demandDepartment(g.code, g.major, ""), raw.buildings).building,
      })),
    // only teachers who teach at least one registration
    teachers: raw.teachers.filter((t) => usedTeacherIds.has(t.id)),
    demands,
    rooms: rooms.map((r) => ({ id: r.id, code: r.roomCode, building: r.building, capacity: r.capacity, roomType: r.roomType })),
    unavailable: raw.unavailable ?? {},
    options,
  };
  return { input, summary, notes: checkList };
}

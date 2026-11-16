import { holePenalty } from "./solver";
import { LIMITS, PERIODS, THURSDAY, type Entry, type SolverInput } from "./types";

export interface Check { key: string; label: string; violations: number; note?: string; examples: string[] }

const NDAYS = 5;
const DAY = ["จ.", "อ.", "พ.", "พฤ.", "ศ."];
const slot = (d: number, p: number) => `${DAY[d]} คาบ ${p + 1}`;

export function validate(input: SolverInput, entries: Entry[]) {
  const mode = input.options?.activityMode ?? "period10";
  const demandKey = (g: string, s: string) => `${g}|${s}`;
  const demands = new Map(input.demands.map((d) => [demandKey(d.groupCode, d.subjectCode), d]));
  const tName = new Map(input.teachers.map((t) => [t.id, t.name]));
  const checks: Check[] = [];
  const add = (key: string, label: string, ex: string[], note?: string) =>
    checks.push({ key, label, violations: ex.length, note, examples: ex.slice(0, 10) });

  // index
  const byGroupSlot = new Map<string, Entry[]>();
  const byTeacherSlot = new Map<string, Entry[]>();
  for (const e of entries) {
    const gk = `${e.groupCode}|${e.day}|${e.period}`;
    (byGroupSlot.get(gk) ?? byGroupSlot.set(gk, []).get(gk)!).push(e);
    if (e.teacherId !== null) {
      const tk = `${e.teacherId}|${e.day}|${e.period}`;
      (byTeacherSlot.get(tk) ?? byTeacherSlot.set(tk, []).get(tk)!).push(e);
    }
  }
  const grid = new Map<string, (Entry | null)[][]>(); // group → day → period
  for (const e of entries) {
    const g = grid.get(e.groupCode) ?? grid.set(e.groupCode, Array.from({ length: NDAYS }, () => Array(PERIODS).fill(null))).get(e.groupCode)!;
    g[e.day]![e.period] = e;
  }

  // 1 group clash
  add("group_clash", "1. กลุ่มเรียนชนคาบ",
    [...byGroupSlot].filter(([, v]) => v.length > 1).map(([k, v]) => { const [g, d, p] = k.split("|"); return `${g} ${slot(+d!, +p!)} (${v.length} วิชา)`; }));

  // 2 teacher clash + unavailable
  const unavail = new Map(Object.entries(input.unavailable ?? {}).map(([id, s]) => [Number(id), new Set(s)]));
  add("teacher_clash", "2. อาจารย์ชนคาบ / สอนในช่วงไม่ว่าง", [
    ...[...byTeacherSlot].filter(([, v]) => v.length > 1).map(([k, v]) => { const [t, d, p] = k.split("|"); return `${tName.get(+t!)} ${slot(+d!, +p!)} (${v.length} กลุ่ม)`; }),
    ...entries.filter((e) => e.teacherId !== null && unavail.get(e.teacherId)?.has(`${e.day}:${e.period}`))
      .map((e) => `${tName.get(e.teacherId!)} ไม่ว่าง ${slot(e.day, e.period)}`),
  ]);

  // 3 room clash — rooms take one group at a time; building-level (no rooms registered) accepts many
  const roomInfo = new Map((input.rooms ?? []).map((r) => [r.id, r]));
  const byRoomSlot = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.roomId === null) continue;
    const k = `${e.roomId}|${e.day}|${e.period}`;
    (byRoomSlot.get(k) ?? byRoomSlot.set(k, []).get(k)!).push(e);
  }
  const roomNeeded = entries.filter((e) => e.roomId === null && demands.get(demandKey(e.groupCode, e.subjectCode))!.roomRequired);
  add("room_clash", "3. ห้องชน / ไม่ได้จองห้อง", [
    ...[...byRoomSlot].filter(([, v]) => v.length > 1).map(([k, v]) => { const [r, d, p] = k.split("|"); return `ห้อง ${roomInfo.get(+r!)?.code} ${slot(+d!, +p!)} (${v.length} กลุ่ม)`; }),
    ...roomNeeded.map((e) => `${e.groupCode} ${e.subjectCode} ${slot(e.day, e.period)} ไม่มีห้อง`),
  ], (input.rooms ?? []).length
    ? `ใช้ ${new Set(entries.filter((e) => e.roomId !== null).map((e) => e.roomId)).size} ห้อง · อาคารที่ไม่มีรายการห้องจัดระดับอาคาร`
    : "ไม่มีรายการห้อง: จัดระดับอาคาร (รองรับหลายกลุ่มพร้อมกัน)");

  // 4 main teacher exists for every subject; assigned teacher must be eligible
  // every assigned teacher must teach this group's registered subject (code + name);
  // registrations the data gives no main teacher are reported as missing data, not as a clash
  const noMainInData = input.demands.filter((d) => d.mainTeachers.length === 0).length;
  add("main_teacher", "4. ผู้สอนตรงรหัสวิชาและชื่อวิชาที่กลุ่มลงทะเบียน",
    entries.filter((e) => {
      if (e.teacherId === null) return false;
      const d = demands.get(demandKey(e.groupCode, e.subjectCode))!;
      return !d.mainTeachers.includes(e.teacherId) && !d.coTeachers.includes(e.teacherId);
    }).map((e) => `${tName.get(e.teacherId!)} ไม่ได้สอน ${e.subjectCode} ของกลุ่ม ${e.groupCode}`),
    noMainInData ? `ข้อมูลไม่มีผู้สอนหลัก ${noMainInData} รายการ → แสดง "รอจัดสรรอาจารย์"` : "ทุกรายการลงทะเบียนมีผู้สอนหลักในข้อมูล");

  // 5 hours complete
  const placed = new Map<string, number>();
  for (const e of entries) placed.set(demandKey(e.groupCode, e.subjectCode), (placed.get(demandKey(e.groupCode, e.subjectCode)) ?? 0) + 1);
  add("hours", "5. จัดชั่วโมงครบตามหลักสูตร",
    input.demands.filter((d) => (placed.get(demandKey(d.groupCode, d.subjectCode)) ?? 0) !== d.hours)
      .map((d) => `${d.groupCode} ${d.subjectCode}: ${placed.get(demandKey(d.groupCode, d.subjectCode)) ?? 0}/${d.hours} ชม.`));

  // 6, 7 teacher per-day load and break window
  const tDay = new Map<string, number[]>();
  for (const e of entries) {
    if (e.teacherId === null) continue;
    const k = `${e.teacherId}|${e.day}`;
    (tDay.get(k) ?? tDay.set(k, []).get(k)!).push(e.period);
  }
  add("teacher_7h", `6. อาจารย์สอนไม่เกิน ${LIMITS.teacherMaxPerDay} ชม./วัน`,
    [...tDay].filter(([, ps]) => new Set(ps).size > LIMITS.teacherMaxPerDay).map(([k, ps]) => { const [t, d] = k.split("|"); return `${tName.get(+t!)} ${DAY[+d!]} ${ps.length} ชม.`; }));
  add("teacher_break", "7. อาจารย์มีพัก ≥1 ชม. ในคาบ 4–6",
    [...tDay].filter(([, ps]) => LIMITS.teacherBreakWindow.every((p) => ps.includes(p))).map(([k]) => { const [t, d] = k.split("|"); return `${tName.get(+t!)} ${DAY[+d!]}`; }));

  // 8, 9, 10 runs and same-day per group
  const subjRun: string[] = [], stuRun: string[] = [], sameDay: string[] = [];
  let sameDaySplit = 0;
  for (const [g, days] of grid) {
    days.forEach((cells, d) => {
      let run = 0, sRun = 0;
      for (let p = 0; p < PERIODS; p++) {
        const c = cells[p];
        run = c ? run + 1 : 0;
        if (run === LIMITS.maxStudentRun + 1) stuRun.push(`${g} ${DAY[d]} ถึงคาบ ${p + 1}`);
        sRun = c && cells[p - 1]?.subjectCode === c.subjectCode ? sRun + 1 : c ? 1 : 0;
        if (sRun === LIMITS.maxSameSubjectRun + 1) subjRun.push(`${g} ${c!.subjectCode} ${DAY[d]}`);
      }
      const blocks = new Map<string, Set<number>>();
      const splitFlag = new Map<string, boolean>();
      for (const c of cells) {
        if (!c) continue;
        (blocks.get(c.subjectCode) ?? blocks.set(c.subjectCode, new Set()).get(c.subjectCode)!).add(c.blockId);
        if (c.split) splitFlag.set(c.subjectCode, true);
      }
      for (const [s, ids] of blocks) {
        if (ids.size < 2) continue;
        if (splitFlag.get(s)) sameDaySplit++;
        else sameDay.push(`${g} ${s} ${DAY[d]}`);
      }
    });
  }
  add("subject_run", "8. วิชาเดียวกันเรียนติดกันไม่เกิน 4 ชม.", subjRun);
  add("student_run", "9. นักศึกษาเรียนติดกันไม่เกิน 4 ชม.", stuRun);
  add("same_day", "10. วิชาเดียวกันไม่ซ้ำวัน", sameDay,
    sameDaySplit ? `ยกเว้น ${sameDaySplit} กรณีที่แตกคาบเพราะจำเป็น` : undefined);

  // 11 building matches type
  const roomIssues: string[] = [];
  for (const e of entries) {
    const d = demands.get(demandKey(e.groupCode, e.subjectCode))!;
    if (e.building !== d.building) roomIssues.push(`${e.groupCode} ${e.subjectCode} ${slot(e.day, e.period)}: อาคารไม่ตรง`);
    if (e.roomId === null) continue;
    const r = roomInfo.get(e.roomId);
    if (!r) { roomIssues.push(`${e.groupCode}: ไม่พบห้อง #${e.roomId}`); continue; }
    if (r.building !== d.building) roomIssues.push(`${e.groupCode} ห้อง ${r.code}: อยู่คนละอาคาร`);
    if (d.roomType && r.roomType && r.roomType !== d.roomType) roomIssues.push(`${e.groupCode} ${e.subjectCode} ห้อง ${r.code}: ต้องการ${d.roomType} แต่เป็น${r.roomType}`);
    if (r.capacity != null && r.capacity < d.students) roomIssues.push(`${e.groupCode} ห้อง ${r.code}: จุ ${r.capacity} < ${d.students} คน`);
  }
  add("building", "11. ห้อง/อาคารตรงประเภทและจุนักศึกษาได้", roomIssues,
    `กลุ่มที่ไม่ระบุจำนวนนักศึกษาใช้ ${LIMITS.defaultStudents} คน`);

  // special subjects
  const special: string[] = [];
  for (const e of entries) {
    const d = demands.get(demandKey(e.groupCode, e.subjectCode))!;
    if (!d.special) continue;
    if (d.special === "org_activity_thu" && e.day !== THURSDAY) special.push(`${e.groupCode} ${d.subjectName} ไม่ใช่วันพฤหัสบดี`);
    const cells = grid.get(e.groupCode)![e.day]!;
    const after = cells.slice(e.period + 1);
    // period10: the block runs to คาบ 10; groupLast: nothing else after it that day
    const ok = mode === "period10"
      ? after.every((c) => c?.subjectCode === e.subjectCode)
      : after.every((c) => !c || c.subjectCode === e.subjectCode);
    if (!ok) special.push(`${e.groupCode} ${d.subjectName} ${slot(e.day, e.period)} ไม่ใช่คาบสุดท้าย`);
  }
  add("special", "พิเศษ: กิจกรรมองค์การวิชาชีพ คาบสุดท้ายของวันพฤหัสบดี", special);

  return { checks, totalViolations: checks.reduce((n, c) => n + c.violations, 0) };
}

export function balanceReport(input: SolverInput, entries: Entry[]) {
  const groups = new Map<string, number[][]>();
  for (const e of entries) {
    const g = groups.get(e.groupCode) ?? groups.set(e.groupCode, Array.from({ length: NDAYS }, () => [])).get(e.groupCode)!;
    g[e.day]!.push(e.period);
  }
  const perGroup = [...groups].map(([code, days]) => {
    const hours = days.map((ps) => ps.length);
    const holes = days.reduce((n, ps) => {
      const row = Array(PERIODS).fill(false); ps.forEach((p) => (row[p] = true));
      return n + holePenalty(row);
    }, 0);
    return { code, hours, diff: Math.max(...hours) - Math.min(...hours), holes };
  });
  const tLoad = new Map(input.teachers.map((t) => [t.id, 0]));
  for (const e of entries) if (e.teacherId !== null) tLoad.set(e.teacherId, (tLoad.get(e.teacherId) ?? 0) + 1);
  const loads = [...tLoad.values()];
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return {
    groups: {
      count: perGroup.length,
      totalHoles: perGroup.reduce((n, g) => n + g.holes, 0),
      groupsWithHoles: perGroup.filter((g) => g.holes > 0).length,
      avgDayDiff: +mean(perGroup.map((g) => g.diff)).toFixed(2),
      maxDayDiff: Math.max(0, ...perGroup.map((g) => g.diff)),
      eveningPeriods: entries.filter((e) => e.period >= 7).length,
      worst: [...perGroup].sort((a, b) => b.holes - a.holes || b.diff - a.diff).slice(0, 10),
    },
    teachers: {
      min: Math.min(...loads), max: Math.max(...loads), avg: +mean(loads).toFixed(1),
      loads: input.teachers.map((t) => ({ id: t.id, name: t.name, hours: tLoad.get(t.id) ?? 0 })).sort((a, b) => b.hours - a.hours),
    },
  };
}

export function coverageReport(input: SolverInput, entries: Entry[]) {
  const assigned = entries.filter((e) => e.teacherId !== null).length;
  const pending = entries.length - assigned;
  const subjName = new Map(input.demands.map((d) => [d.subjectCode, d.subjectName]));
  const bySubject = new Map<string, number>();
  for (const e of entries) if (e.teacherId === null) bySubject.set(e.subjectCode, (bySubject.get(e.subjectCode) ?? 0) + 1);
  const capacity = input.teachers.length * LIMITS.teacherMaxPerDay * NDAYS;
  return {
    totalPeriods: entries.length,
    assigned,
    pending,
    assignedPct: entries.length ? +((assigned / entries.length) * 100).toFixed(1) : 0,
    teacherCount: input.teachers.length,
    teacherCapacity: capacity,
    extraTeachersNeeded: Math.ceil(pending / (LIMITS.teacherMaxPerDay * NDAYS)),
    topPendingSubjects: [...bySubject].sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([code, hours]) => ({ code, name: subjName.get(code) ?? code, hours })),
  };
}

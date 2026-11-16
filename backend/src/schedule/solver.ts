import { LIMITS, PERIODS, THURSDAY, type DemandIn, type Entry, type SolverInput, type SolverResult, type Unplaced } from "./types";

const NDAYS = 5;
type Cell = { demand: number; blockId: number; teacherId: number | null; roomId: number | null; split: boolean } | null;

/** Size plan for a subject's weekly hours: ≤4 → one block; ≥5 → blocks of ≤4 (on different days). */
export function blockPlan(hours: number): number[] {
  if (hours <= LIMITS.maxSameSubjectRun) return [hours];
  const n = Math.ceil(hours / LIMITS.maxSameSubjectRun);
  const base = Math.floor(hours / n);
  return Array.from({ length: n }, (_, i) => base + (i < hours % n ? 1 : 0));
}

/**
 * Empty periods inside a day that are not justified breaks.
 * A single free period is justified when filling it would create a run > maxStudentRun.
 */
export function holePenalty(row: boolean[]): number {
  let first = row.indexOf(true);
  if (first < 0) return 0;
  const last = row.lastIndexOf(true);
  let pen = 0;
  let p = first;
  while (p <= last) {
    if (row[p]) { p++; continue; }
    let g = 0;
    while (p + g <= last && !row[p + g]) g++;
    let prev = 0; for (let i = p - 1; i >= 0 && row[i]; i--) prev++;
    let next = 0; for (let i = p + g; i < row.length && row[i]; i++) next++;
    pen += g - (prev + 1 + next > LIMITS.maxStudentRun ? 1 : 0);
    p += g;
  }
  return pen;
}

function runAround(row: boolean[], start: number, len: number): number {
  let a = start, b = start + len - 1;
  while (a - 1 >= 0 && row[a - 1]) a--;
  while (b + 1 < row.length && row[b + 1]) b++;
  return b - a + 1;
}

export function solve(input: SolverInput): SolverResult {
  const t0 = performance.now();
  const mode = input.options?.activityMode ?? "period10";
  const D = input.demands;

  const groupIdx = new Map(input.groups.map((g, i) => [g.code, i]));
  const gGrid: Cell[][][] = input.groups.map(() => Array.from({ length: NDAYS }, () => Array<Cell>(PERIODS).fill(null)));
  const gTotal = new Array(input.groups.length).fill(0);
  const gDay = input.groups.map(() => new Array(NDAYS).fill(0));
  /** groupLast mode: earliest start of an org activity per group/day */
  const gActStart = input.groups.map(() => new Array<number>(NDAYS).fill(PERIODS));
  for (const d of D) gTotal[groupIdx.get(d.groupCode)!] += d.hours;

  const tIds = input.teachers.map((t) => t.id);
  const tBusy = new Map<number, boolean[][]>(tIds.map((id) => [id, Array.from({ length: NDAYS }, () => Array(PERIODS).fill(false))]));
  const tDay = new Map<number, number[]>(tIds.map((id) => [id, new Array(NDAYS).fill(0)]));
  const tWeek = new Map<number, number>(tIds.map((id) => [id, 0]));
  const unavail = new Map<number, Set<string>>();
  for (const [id, slots] of Object.entries(input.unavailable ?? {})) unavail.set(Number(id), new Set(slots));
  const rBusy = new Map<number, boolean[][]>((input.rooms ?? []).map((r) => [r.id, Array.from({ length: NDAYS }, () => Array(PERIODS).fill(false))]));

  /** room for a block: null = not needed (building-level), undefined = needed but none free */
  function pickRoom(di: number, day: number, start: number, len: number): number | null | undefined {
    const d = D[di]!;
    if (!d.roomRequired) return null;
    for (const id of d.rooms) {
      const busy = rBusy.get(id);
      if (!busy) continue;
      let free = true;
      for (let p = start; p < start + len; p++) if (busy[day]![p]) { free = false; break; }
      if (free) return id;
    }
    return undefined;
  }

  const demandDays = D.map(() => new Set<number>());
  const demandTeacher: (number | null)[] = D.map(() => null);
  const placedHours = new Array(D.length).fill(0);
  const unplaced: Unplaced[] = [];
  let blockSeq = 0;

  const occRow = (gi: number, day: number) => gGrid[gi]![day]!.map((c) => c !== null);

  function teacherFits(id: number, day: number, start: number, len: number): boolean {
    const busy = tBusy.get(id);
    if (!busy) return false;
    if (tDay.get(id)![day]! + len > LIMITS.teacherMaxPerDay) return false;
    const u = unavail.get(id);
    for (let p = start; p < start + len; p++) {
      if (busy[day]![p] || u?.has(`${day}:${p}`)) return false;
    }
    // keep ≥1 free period in คาบ 4–6
    return LIMITS.teacherBreakWindow.some((p) => !(busy[day]![p] || (p >= start && p < start + len)));
  }

  function pickTeacher(di: number, day: number, start: number, len: number): number | null {
    const d = D[di]!;
    const byLoad = (a: number, b: number) => tWeek.get(a)! - tWeek.get(b)! || tDay.get(a)![day]! - tDay.get(b)![day]!;
    const order = [
      ...(demandTeacher[di] != null ? [demandTeacher[di]!] : []),
      ...[...d.mainTeachers].sort(byLoad),
      ...[...d.coTeachers].sort(byLoad),
    ];
    for (const id of order) if (teacherFits(id, day, start, len)) return id;
    return null;
  }

  function evaluate(di: number, len: number, allowSameDay: boolean) {
    const d = D[di]!;
    const gi = groupIdx.get(d.groupCode)!;
    const avg = gTotal[gi] / NDAYS;
    let best: { day: number; start: number; teacher: number | null; room: number | null; score: number } | null = null;

    for (let day = 0; day < NDAYS; day++) {
      if (d.special === "org_activity_thu" && day !== THURSDAY) continue;
      const sameDay = demandDays[di]!.has(day);
      if (sameDay && !allowSameDay) continue;
      const row = occRow(gi, day);

      for (let start = 0; start + len <= PERIODS; start++) {
        const end = start + len - 1;
        if (d.special && mode === "period10" && end !== PERIODS - 1) continue;
        if (row.slice(start, end + 1).some(Boolean)) continue;
        if (d.special && mode === "groupLast" && row.slice(end + 1).some(Boolean)) continue;
        if (!d.special && end >= gActStart[gi]![day]!) continue;
        if (sameDay) {
          // same subject on same day: must not touch the other block (gap ≥ 1)
          const cells = gGrid[gi]![day]!;
          if (cells[start - 1]?.demand === di || cells[end + 1]?.demand === di) continue;
        }
        if (runAround(row, start, len) > LIMITS.maxStudentRun) continue;
        const room = pickRoom(di, day, start, len);
        if (room === undefined) continue; // ห้องเต็ม / ไม่มีห้องที่เหมาะ

        const after = [...row];
        for (let p = start; p <= end; p++) after[p] = true;
        const load = gDay[gi]![day]!;
        let score = 3 * ((load + len - avg) ** 2 - (load - avg) ** 2);
        score += 8 * (holePenalty(after) - holePenalty(row));
        for (let p = start; p <= end; p++) if (p >= 7) score += 4 * (p - 6); // เลี่ยงคาบเย็น
        score += 0.3 * start;
        if (sameDay) score += 25;

        const teacher = pickTeacher(di, day, start, len);
        if (teacher === null && (d.mainTeachers.length || d.coTeachers.length)) score += 40;
        if (!best || score < best.score) best = { day, start, teacher, room, score };
      }
    }
    return best;
  }

  function apply(di: number, len: number, pos: { day: number; start: number; teacher: number | null; room: number | null }, split: boolean) {
    const d = D[di]!;
    const gi = groupIdx.get(d.groupCode)!;
    const blockId = ++blockSeq;
    for (let p = pos.start; p < pos.start + len; p++) {
      gGrid[gi]![pos.day]![p] = { demand: di, blockId, teacherId: pos.teacher, roomId: pos.room, split };
      if (pos.teacher !== null) tBusy.get(pos.teacher)![pos.day]![p] = true;
      if (pos.room !== null) rBusy.get(pos.room)![pos.day]![p] = true;
    }
    gDay[gi]![pos.day] += len;
    if (d.special && mode === "groupLast") gActStart[gi]![pos.day] = Math.min(gActStart[gi]![pos.day]!, pos.start);
    if (pos.teacher !== null) {
      tDay.get(pos.teacher)![pos.day] += len;
      tWeek.set(pos.teacher, tWeek.get(pos.teacher)! + len);
      demandTeacher[di] ??= pos.teacher;
    }
    demandDays[di]!.add(pos.day);
    placedHours[di] += len;
  }

  /** Place a block; fall back to same-day (with gap) and then to splitting into smaller blocks. */
  function place(di: number, len: number, split: boolean): boolean {
    let pos = evaluate(di, len, false);
    if (!pos) {
      // no other day possible → same day (with a gap) is a necessary split (rule 10 exception)
      pos = evaluate(di, len, true);
      if (pos) split = true;
    }
    if (pos) { apply(di, len, pos, split); return true; }
    if (len === 1 || D[di]!.special) return false;
    const a = Math.ceil(len / 2);
    const okA = place(di, a, true);
    const okB = place(di, len - a, true);
    return okA && okB;
  }

  // ---- ordering: special-time subjects first, then projects, then larger blocks; interleave groups ----
  type Job = { di: number; len: number; tier: number; ord: number; gi: number; nT: number };
  const jobs: Job[] = [];
  D.forEach((d, di) => {
    const gi = groupIdx.get(d.groupCode)!;
    blockPlan(d.hours).forEach((len, k) => {
      const tier = d.special === "org_activity_thu" ? 0 : d.special ? 1 : d.isProject ? 2 : 3;
      jobs.push({ di, len, tier, ord: k, gi, nT: d.mainTeachers.length + d.coTeachers.length });
    });
  });
  const perGroupCounter = new Map<string, number>();
  const ordered = jobs
    .sort((a, b) => a.tier - b.tier || b.len - a.len || a.nT - b.nT || a.gi - b.gi || a.ord - b.ord)
    .map((j) => {
      const key = `${j.tier}|${j.len}|${j.gi}`;
      const n = perGroupCounter.get(key) ?? 0;
      perGroupCounter.set(key, n + 1);
      return { ...j, round: n };
    })
    .sort((a, b) => a.tier - b.tier || b.len - a.len || a.round - b.round || a.nT - b.nT || a.gi - b.gi);

  for (const j of ordered) place(j.di, j.len, false);

  // ---- improvement pass: move blocks without a teacher to better days (balance / gaps / late periods) ----
  function groupObjective(gi: number): number {
    const avg = gTotal[gi] / NDAYS;
    let s = 0;
    for (let day = 0; day < NDAYS; day++) {
      const row = occRow(gi, day);
      s += 3 * (gDay[gi]![day]! - avg) ** 2 + 8 * holePenalty(row);
      row.forEach((o, p) => { if (o) s += (p >= 7 ? 4 * (p - 6) : 0) + 0.3 * p / 4; });
    }
    return s;
  }
  function removeBlock(gi: number, day: number, blockId: number) {
    const cells = gGrid[gi]![day]!;
    const ps = cells.map((c, p) => (c?.blockId === blockId ? p : -1)).filter((p) => p >= 0);
    const c = cells[ps[0]!]!;
    for (const p of ps) {
      cells[p] = null;
      if (c.roomId !== null) rBusy.get(c.roomId)![day]![p] = false;
    }
    gDay[gi]![day] -= ps.length;
    if (!cells.some((x) => x?.demand === c.demand)) demandDays[c.demand]!.delete(day);
    placedHours[c.demand] -= ps.length;
    return { di: c.demand, start: ps[0]!, len: ps.length, split: c.split, room: c.roomId };
  }
  for (let pass = 0; pass < 3; pass++) {
    let moved = 0;
    for (let gi = 0; gi < gGrid.length; gi++) {
      const blocks: { day: number; blockId: number }[] = [];
      gGrid[gi]!.forEach((cells, day) => {
        const seen = new Set<number>();
        for (const c of cells) {
          if (!c || seen.has(c.blockId) || c.teacherId !== null || D[c.demand]!.special) continue;
          seen.add(c.blockId);
          blocks.push({ day, blockId: c.blockId });
        }
      });
      for (const b of blocks) {
        const before = groupObjective(gi);
        const old = removeBlock(gi, b.day, b.blockId);
        let pos = evaluate(old.di, old.len, false);
        if (!pos && old.split) pos = evaluate(old.di, old.len, true);
        if (pos) {
          apply(old.di, old.len, pos, old.split);
          // accept if the group's timetable got better, or the block now has a teacher
          if (groupObjective(gi) < before - 1e-9 || pos.teacher !== null) { moved++; continue; }
          removeBlock(gi, pos.day, blockSeq); // undo (apply() just used id = blockSeq)
        }
        apply(old.di, old.len, { day: b.day, start: old.start, teacher: null, room: old.room }, old.split);
      }
    }
    if (!moved) break;
  }

  D.forEach((d, di) => {
    const missing = d.hours - placedHours[di];
    if (missing > 0) {
      unplaced.push({
        groupCode: d.groupCode,
        subjectCode: d.subjectCode,
        hours: missing,
        reason: d.roomRequired && d.rooms.length === 0
          ? `ไม่มีห้องใน${d.building}ที่ตรงประเภท${d.roomType ? ` (${d.roomType})` : ""}และจุ ${d.students} คนได้`
          : d.special
            ? `คาบสุดท้ายวันพฤหัสบดีไม่ว่าง${d.roomRequired ? " หรือห้องเต็ม" : ""}`
            : `ไม่มีช่วงเวลาว่างที่ผ่านเงื่อนไข${d.roomRequired ? " (หรือห้องเต็ม)" : " (เรียนติดกันเกิน 4 ชม./วิชาซ้ำวัน)"}`,
      });
    }
  });

  // ---- teacher top-up pass: give a teacher to blocks still without one, if someone is free now ----
  for (let gi = 0; gi < gGrid.length; gi++) {
    for (let day = 0; day < NDAYS; day++) {
      const cells = gGrid[gi]![day]!;
      const seen = new Set<number>();
      for (const c of cells) {
        if (!c || c.teacherId !== null || seen.has(c.blockId)) continue;
        seen.add(c.blockId);
        const ps = cells.map((x, p) => (x?.blockId === c.blockId ? p : -1)).filter((p) => p >= 0);
        const t = pickTeacher(c.demand, day, ps[0]!, ps.length);
        if (t === null) continue;
        for (const p of ps) { cells[p] = { ...cells[p]!, teacherId: t }; tBusy.get(t)![day]![p] = true; }
        tDay.get(t)![day] += ps.length;
        tWeek.set(t, tWeek.get(t)! + ps.length);
        demandTeacher[c.demand] ??= t;
      }
    }
  }

  const entries: Entry[] = [];
  gGrid.forEach((days) =>
    days.forEach((cells, day) =>
      cells.forEach((c, period) => {
        if (!c) return;
        const d = D[c.demand]!;
        entries.push({
          groupCode: d.groupCode, subjectCode: d.subjectCode, teacherId: c.teacherId,
          building: d.building, day, period, roomId: c.roomId, blockId: c.blockId, split: c.split,
        });
      }),
    ),
  );
  return { entries, unplaced, ms: Math.round(performance.now() - t0) };
}

export type { DemandIn };

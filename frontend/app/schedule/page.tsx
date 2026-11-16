"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TimetableGrid } from "@/components/TimetableGrid";
import { Card, DataTable, ErrorBox, Stat } from "@/components/ui";
import {
  API_URL, api, type DataSummary, type GridEntry, type RunListItem, type ScheduleRun, type ViewBy, type ViewKey,
} from "@/lib/api";

const VIEWS: { by: ViewBy; label: string }[] = [
  { by: "group", label: "รายกลุ่มเรียน" },
  { by: "teacher", label: "รายอาจารย์" },
  { by: "building", label: "รายอาคาร" },
  { by: "room", label: "รายห้อง" },
];
const MODES = [
  { value: "period10", label: "กิจกรรมฯ วันพฤหัสบดี จบคาบ 10" },
  { value: "groupLast", label: "กิจกรรมฯ วันพฤหัสบดี เป็นคาบสุดท้ายของกลุ่ม" },
];

export default function SchedulePage() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [run, setRun] = useState<ScheduleRun | null>(null);
  const [mode, setMode] = useState("period10");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [by, setBy] = useState<ViewBy>("group");
  const [keys, setKeys] = useState<ViewKey[]>([]);
  const [keysBy, setKeysBy] = useState<ViewBy | null>(null);
  const [key, setKey] = useState("");
  const [filter, setFilter] = useState("");
  const [grid, setGrid] = useState<GridEntry[]>([]);

  const loadRun = useCallback(async (id: number | "latest") => {
    try {
      const r = await api<ScheduleRun>(`/schedule/runs/${id}`);
      setRun(r);
      setErr("");
    } catch (e) {
      setRun(null);
      if (id !== "latest") setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    api<RunListItem[]>("/schedule/runs").then(setRuns).catch((e) => setErr(e.message));
    loadRun("latest");
  }, [loadRun]);

  // keys for the selected view
  useEffect(() => {
    if (!run) return;
    let cancelled = false;
    api<ViewKey[]>(`/schedule/runs/${run.id}/keys?by=${by}`)
      .then((k) => {
        if (cancelled) return;
        setKeys(k);
        setKeysBy(by);
        setKey((cur) => (k.some((x) => x.key === cur) ? cur : k[0]?.key ?? ""));
      })
      .catch((e) => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, [run, by]);

  useEffect(() => {
    // only fetch once the key list belongs to the current view (avoids "group code as teacher id")
    if (!run || keysBy !== by || !keys.some((k) => k.key === key)) { setGrid([]); return; }
    let cancelled = false;
    api<GridEntry[]>(`/schedule/runs/${run.id}/grid?by=${by}&key=${encodeURIComponent(key)}`)
      .then((g) => { if (!cancelled) setGrid(g); })
      .catch((e) => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, [run, by, key, keys, keysBy]);

  async function generate() {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ id: number }>("/schedule/generate", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ activityMode: mode }),
      });
      await loadRun(r.id);
      setRuns(await api<RunListItem[]>("/schedule/runs"));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const shownKeys = useMemo(
    () => keys.filter((k) => !filter || k.label.toLowerCase().includes(filter.toLowerCase()) || k.key.includes(filter)),
    [keys, filter],
  );
  const s = run?.summary;
  const current = keys.find((k) => k.key === key);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">จัดตารางสอนอัตโนมัติ</h1>
          <p className="text-sm text-slate-500">จันทร์–ศุกร์ วันละ 10 คาบ · ยึดรายวิชาของกลุ่มเรียนเป็นหลัก แล้วเติมอาจารย์และอาคาร</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button onClick={generate} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? "กำลังจัดตาราง…" : "⚙️ จัดตารางอัตโนมัติ"}
          </button>
        </div>
      </div>

      {err && <ErrorBox message={err} />}

      {runs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
          <span className="text-slate-500">ผลการจัด:</span>
          <select value={run?.id ?? ""} onChange={(e) => loadRun(Number(e.target.value))} className="rounded-md border border-slate-300 bg-white px-2 py-1">
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} · {new Date(r.createdAt).toLocaleString("th-TH")} · ผิด {r.totalViolations} · มีอาจารย์ {r.assignedPct}%
              </option>
            ))}
          </select>
          {run && (
            <>
              <a href={`${API_URL}/schedule/runs/${run.id}/export.csv`} className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50">⬇ CSV (Excel)</a>
              <button onClick={() => window.print()} className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50">🖨 พิมพ์</button>
            </>
          )}
        </div>
      )}

      {!run && !busy && !err && (
        <Card><p className="text-slate-500">ยังไม่มีตารางสอน — กด “จัดตารางอัตโนมัติ” เพื่อเริ่ม (ต้องนำเข้าข้อมูลก่อน)</p></Card>
      )}

      {s && run && (
        <>
          {/* result banner */}
          <Card className={`print:hidden ${s.conflictFree ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-3xl">{s.conflictFree ? "✅" : "❌"}</span>
              <div>
                <div className={`text-lg font-semibold ${s.conflictFree ? "text-emerald-700" : "text-red-700"}`}>
                  {s.conflictFree ? "ไม่ชนคาบ / ไม่ชนห้อง (100% Conflict-free)" : `พบการผิดเงื่อนไขบังคับ ${s.totalViolations} รายการ`}
                </div>
                <div className="text-sm text-slate-600">
                  จัดแล้ว {s.coverage.totalPeriods.toLocaleString()} คาบ · จัดไม่ได้ {s.unplaced.reduce((n, u) => n + u.hours, 0)} คาบ · ใช้เวลา {s.ms} ms
                </div>
              </div>
            </div>
          </Card>

          {s.data ? <DataCard d={s.data} /> : (
            <Card className="print:hidden"><p className="text-sm text-slate-500">ผลนี้จัดด้วยระบบรุ่นก่อน — กด “จัดตารางอัตโนมัติ” ใหม่เพื่อดูสรุปข้อมูลที่ใช้</p></Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2 print:hidden">
            <Card>
              <h2 className="mb-3 font-medium">ตรวจเงื่อนไขบังคับ (ต้องเป็น 0)</h2>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {s.checks.map((c) => (
                    <tr key={c.key}>
                      <td className="py-1.5 pr-2">
                        {c.label}
                        {c.note && <div className="text-xs text-slate-400">{c.note}</div>}
                        {c.examples.length > 0 && <div className="text-xs text-red-600">{c.examples.slice(0, 3).join(" · ")}</div>}
                      </td>
                      <td className={`py-1.5 text-right font-semibold tabular-nums ${c.violations ? "text-red-600" : "text-emerald-600"}`}>
                        {c.violations === 0 ? "0 ✓" : c.violations}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <div className="space-y-4">
              <Card>
                <h2 className="mb-3 font-medium">การจัดสรรอาจารย์</h2>
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="มีอาจารย์" value={s.coverage.assigned} tone="green" />
                  <Stat label="รอจัดสรรอาจารย์" value={s.coverage.pending} tone={s.coverage.pending ? "amber" : "slate"} />
                  <Stat label="ศักยภาพอาจารย์ (คาบ)" value={s.coverage.teacherCapacity} tone="blue" />
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-200">
                  <div className="h-full bg-emerald-500" style={{ width: `${s.coverage.assignedPct}%` }} />
                </div>
                <div className="mt-1 text-xs text-slate-500">มีผู้สอน {s.coverage.assignedPct}% ของคาบทั้งหมด</div>
                {s.suggestions.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-800">
                    {s.suggestions.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                )}
              </Card>

              <Card>
                <h2 className="mb-3 font-medium">ความสมดุล</h2>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat label="คาบว่างแหว่ง (รวม)" value={s.balance.groups.totalHoles} tone={s.balance.groups.totalHoles ? "amber" : "green"} />
                  <Stat label="ต่างระหว่างวัน (สูงสุด ชม.)" value={s.balance.groups.maxDayDiff} />
                  <Stat label="คาบเย็น (8–10)" value={s.balance.groups.eveningPeriods} />
                  <Stat label="ภาระสอน ต่ำ–สูง" value={s.balance.teachers.max - s.balance.teachers.min} />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  ความต่างของชั่วโมงเรียนระหว่างวันเฉลี่ย {s.balance.groups.avgDayDiff} ชม./กลุ่ม ·
                  อาจารย์สอน {s.balance.teachers.min}–{s.balance.teachers.max} คาบ/สัปดาห์ (เฉลี่ย {s.balance.teachers.avg})
                </p>
              </Card>
            </div>
          </div>

          {s.unplaced.length > 0 && (
            <Card className="print:hidden border-red-200">
              <h2 className="mb-2 font-medium text-red-700">จัดไม่ครบ {s.unplaced.length} รายการ</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-red-600">
                {s.unplaced.slice(0, 20).map((u) => <li key={u.groupCode + u.subjectCode}>{u.groupCode} {u.subjectCode} ({u.hours} ชม.) — {u.reason}</li>)}
              </ul>
            </Card>
          )}

          {/* timetable views */}
          <Card className="space-y-4 print:border-0 print:p-0 print:shadow-none">
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              {VIEWS.map((v) => (
                <button key={v.by} onClick={() => setBy(v.by)}
                  className={`rounded-md px-3 py-1.5 text-sm ${by === v.by ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {v.label}
                </button>
              ))}
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ค้นหา…"
                className="ml-auto w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <select value={key} onChange={(e) => setKey(e.target.value)} className="max-w-xs rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
                {shownKeys.map((k) => <option key={k.key} value={k.key}>{k.label} ({k.hours} คาบ)</option>)}
              </select>
            </div>
            <h2 className="text-lg font-semibold">
              ตาราง{VIEWS.find((v) => v.by === by)?.label.replace("ราย", "")}: {current?.label}
              <span className="ml-2 text-sm font-normal text-slate-500">{current?.hours} คาบ/สัปดาห์</span>
            </h2>
            {by === "room" && keys.length === 0 && (
              <p className="text-sm text-slate-500">
                ยังไม่มีการจัดระดับห้อง — เพิ่มห้อง (ความจุ/ประเภท) ที่ <a href="/manage/rooms" className="text-indigo-600 underline">จัดการข้อมูล › ห้องเรียน</a> แล้วจัดตารางใหม่
              </p>
            )}
            {by === "teacher" && key === "pending" && grid.length > 0 && (
              <p className="text-sm text-amber-700">คาบที่ยังไม่มีผู้สอน แสดงเป็นจำนวนกลุ่มต่อคาบ</p>
            )}
            <TimetableGrid entries={grid} by={by === "teacher" && key === "pending" ? "building" : by} />
            <div className="flex flex-wrap gap-4 text-xs text-slate-500 print:hidden">
              <span><span className="mr-1 inline-block h-3 w-3 rounded bg-indigo-200" />มีอาจารย์</span>
              <span><span className="mr-1 inline-block h-3 w-3 rounded bg-amber-200" />รอจัดสรรอาจารย์</span>
              <span><span className="mr-1 inline-block h-3 w-3 rounded bg-violet-200" />กิจกรรมองค์การวิชาชีพ</span>
              <span><span className="mr-1 inline-block h-3 w-3 rounded bg-sky-100" />หลายกลุ่มในอาคารเดียวกัน</span>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2 print:hidden">
            <Card>
              <h2 className="mb-3 font-medium">วิชาที่รอจัดสรรอาจารย์มากที่สุด</h2>
              <DataTable
                columns={[{ key: "code", label: "รหัสวิชา" }, { key: "name", label: "ชื่อวิชา" }, { key: "hours", label: "คาบ/สัปดาห์" }]}
                rows={s.coverage.topPendingSubjects as unknown as Record<string, unknown>[]}
              />
            </Card>
            <Card>
              <h2 className="mb-3 font-medium">ภาระสอนของอาจารย์ (คาบ/สัปดาห์)</h2>
              <div className="space-y-1">
                {s.balance.teachers.loads.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="w-48 truncate">{t.name}</span>
                    <div className="h-2 flex-1 rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(t.hours / 35) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right tabular-nums">{t.hours}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/** สรุปสั้น: ใช้ข้อมูลอะไร ไม่ได้ใช้อะไร แผนกไหนเรียนอาคารไหน */
function DataCard({ d }: { d: DataSummary }) {
  const sk = d.skipped;
  const skipped = [
    sk.unregisteredSubjects > 0 && `วิชาที่ไม่ได้ลงทะเบียน ${sk.unregisteredSubjects} วิชา (ไม่นำมาจัด${sk.assignmentsOfUnregistered ? ` · ตัดรายการสอนออก ${sk.assignmentsOfUnregistered} รายการ` : ""})`,
    sk.teachersWithoutRegisteredSubject > 0 && `อาจารย์ที่ไม่มีวิชาที่ลงทะเบียน ${sk.teachersWithoutRegisteredSubject} คน (ไม่นำมาจัด)`,
    sk.groupsWithoutRegistration > 0 && `กลุ่มเรียนที่ยังไม่ได้ลงวิชา ${sk.groupsWithoutRegistration} กลุ่ม`,
    sk.registeredWithoutTeacher > 0 && `วิชาที่ลงทะเบียนแต่ไม่มีผู้สอน ${sk.registeredWithoutTeacher} วิชา (จัดเวลา แสดง "รอจัดสรรอาจารย์")`,
  ].filter(Boolean) as string[];

  return (
    <Card className="space-y-4 print:hidden">
      <h2 className="font-medium">ข้อมูลที่ใช้จัดตาราง</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="กลุ่มเรียน" value={d.used.groups} tone="blue" />
        <Stat label="วิชาที่ลงทะเบียน" value={d.used.subjects} tone="blue" />
        <Stat label="รายการลงทะเบียน" value={d.used.registrations} tone="blue" />
        <Stat label="คาบ/สัปดาห์" value={d.used.hours} tone="blue" />
        <Stat label="อาจารย์ที่สอนวิชาเหล่านี้" value={d.used.teachers} tone="green" />
      </div>
      <p className="text-xs text-slate-500">
        ผู้สอนเลือกจากอาจารย์ที่สอน <b>รหัสวิชาเดียวกับที่กลุ่มลงทะเบียน</b> เท่านั้น ({d.used.assignments.toLocaleString()} รายการสอน)
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-700">แผนก → อาคาร</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr><th className="py-1">แผนก</th><th className="py-1">อาคาร</th><th className="py-1 text-right">คาบ/สัปดาห์</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {d.departments.map((x) => (
                <tr key={x.department}>
                  <td className="py-1">{x.department}</td>
                  <td className="py-1">
                    {x.building}
                    {!x.ownBuilding && <span className="ml-1 text-xs text-amber-600">(ไม่มีอาคารของแผนก)</span>}
                  </td>
                  <td className="py-1 text-right tabular-nums">{x.hours.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-400">วิชาสามัญ (20000/30000-1xxx) เรียนอาคารของแผนกสามัญ · วิชาอื่นเรียนอาคารแผนกของกลุ่ม (จากรหัสกลุ่มหลักที่ 4–5)</p>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="mb-1 text-sm font-medium text-slate-700">ไม่นำมาประมวล</h3>
            {skipped.length ? (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-600">{skipped.map((x) => <li key={x}>{x}</li>)}</ul>
            ) : <p className="text-sm text-emerald-600">ไม่มี — ใช้ข้อมูลครบทุกรายการ</p>}
            {sk.unregisteredExamples.length > 0 && (
              <p className="mt-1 text-xs text-slate-400">เช่น {sk.unregisteredExamples.join(", ")}</p>
            )}
          </div>
          {d.checkList.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-medium text-amber-700">ควรตรวจ</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-800">{d.checkList.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

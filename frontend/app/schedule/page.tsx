"use client";

import Link from "next/link";
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

export default function SchedulePage() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [run, setRun] = useState<ScheduleRun | null>(null);
  const [err, setErr] = useState("");
  const [by, setBy] = useState<ViewBy>("group");
  const [keys, setKeys] = useState<ViewKey[]>([]);
  const [keysBy, setKeysBy] = useState<ViewBy | null>(null);
  const [key, setKey] = useState("");
  const [filter, setFilter] = useState("");
  const [grid, setGrid] = useState<GridEntry[]>([]);
  const [tab, setTab] = useState<"checks" | "teachers" | "balance" | "data">("checks");

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

  const shownKeys = useMemo(
    () => keys.filter((k) => !filter || k.label.toLowerCase().includes(filter.toLowerCase()) || k.key.includes(filter)),
    [keys, filter],
  );
  const s = run?.summary;
  const current = keys.find((k) => k.key === key);
  const idx = shownKeys.findIndex((k) => k.key === key);
  const step = (d: number) => {
    const next = shownKeys[idx + d];
    if (next) setKey(next.key);
  };
  const unplacedHours = s ? s.unplaced.reduce((n, u) => n + u.hours, 0) : 0;
  const failedChecks = s ? s.checks.filter((c) => c.violations > 0).length : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold">ตารางสอน</h1>
          <p className="text-sm text-slate-500">จันทร์–ศุกร์ วันละ 10 คาบ</p>
        </div>
        {/* scheduling always goes through the pre-scheduling filter (gate) */}
        <Link href="/screening" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          ⚙️ จัดตารางใหม่ (คัดกรองข้อมูลก่อน)
        </Link>
      </div>

      {err && <ErrorBox message={err} />}

      {!run && !err && (
        <Card className="text-center">
          <div className="text-4xl">📅</div>
          <p className="mt-2 font-medium">ยังไม่มีตารางสอน</p>
          <p className="text-sm text-slate-500">นำเข้าไฟล์ → คัดกรองข้อมูล → กดยืนยันเพื่อเริ่มจัดตาราง</p>
          <Link href="/screening" className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">ไปหน้าคัดกรองข้อมูล</Link>
        </Card>
      )}

      {s && run && (
        <>
          {/* compact result bar */}
          <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-4 py-3 text-sm print:hidden ${s.conflictFree ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
            <span className={`font-semibold ${s.conflictFree ? "text-emerald-700" : "text-red-700"}`}>
              {s.conflictFree ? "✅ ไม่ชนคาบ / ไม่ชนห้อง" : `❌ ผิดเงื่อนไข ${s.totalViolations} รายการ`}
            </span>
            <span>📚 {s.coverage.totalPeriods.toLocaleString()} คาบ</span>
            <span className={s.coverage.pending ? "text-amber-700" : ""}>👤 มีอาจารย์ {s.coverage.assignedPct}%</span>
            {unplacedHours > 0 && <span className="text-red-700">⚠ จัดไม่ได้ {unplacedHours} คาบ</span>}
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {runs.length > 1 && (
                <select value={run.id} onChange={(e) => loadRun(Number(e.target.value))} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>ครั้งที่ {r.id} · {new Date(r.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</option>
                  ))}
                </select>
              )}
              <ExportMenu runId={run.id} by={by} viewKey={key} current={current?.label} />
              <button onClick={() => window.print()} className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50">🖨 พิมพ์</button>
            </span>
          </div>

          {/* timetable first */}
          <Card className="space-y-3 print:border-0 print:p-0 print:shadow-none">
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <div className="flex rounded-lg bg-slate-100 p-1">
                {VIEWS.map((v) => (
                  <button key={v.by} onClick={() => { setBy(v.by); setFilter(""); }}
                    className={`rounded-md px-3 py-1.5 text-sm ${by === v.by ? "bg-white font-medium text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => step(-1)} disabled={idx <= 0} title="ก่อนหน้า"
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm disabled:opacity-30">‹</button>
                <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="🔍 พิมพ์ค้นหา"
                  className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                <select value={key} onChange={(e) => setKey(e.target.value)} className="w-64 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
                  {shownKeys.map((k) => <option key={k.key} value={k.key}>{k.label} ({k.hours} คาบ)</option>)}
                </select>
                <button onClick={() => step(1)} disabled={idx < 0 || idx >= shownKeys.length - 1} title="ถัดไป"
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm disabled:opacity-30">›</button>
                <span className="ml-1 text-xs tabular-nums text-slate-400">{idx >= 0 ? `${idx + 1}/${shownKeys.length}` : ""}</span>
              </div>
            </div>
            <h2 className="text-lg font-semibold">
              {current?.label ?? "—"}
              <span className="ml-2 text-sm font-normal text-slate-500">{current?.hours} คาบ/สัปดาห์</span>
            </h2>
            {by === "room" && keys.length === 0 && (
              <p className="text-sm text-slate-500">
                ยังไม่มีการจัดระดับห้อง — เพิ่มห้องที่ <Link href="/manage/rooms" className="text-indigo-600 underline">จัดการข้อมูล › ห้องเรียน</Link> แล้วจัดตารางใหม่
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

          {/* reports in tabs */}
          <Card className="print:hidden">
            <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
              {([
                ["checks", `ตรวจเงื่อนไข ${failedChecks ? `(${failedChecks} ข้อผิด)` : "✓"}`],
                ["teachers", "อาจารย์"],
                ["balance", "ความสมดุล"],
                ["data", "ข้อมูลที่ใช้"],
              ] as const).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === "checks" && (
              <div className="space-y-3">
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
                {s.unplaced.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div className="mb-1 font-medium text-red-700">จัดไม่ครบ {s.unplaced.length} รายการ</div>
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-600">
                      {s.unplaced.slice(0, 20).map((u) => <li key={u.groupCode + u.subjectCode}>{u.groupCode} {u.subjectCode} ({u.hours} ชม.) — {u.reason}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {tab === "teachers" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <div className="grid grid-cols-3 gap-3">
                    <Stat label="มีอาจารย์ (คาบ)" value={s.coverage.assigned} tone="green" />
                    <Stat label="รอจัดสรร (คาบ)" value={s.coverage.pending} tone={s.coverage.pending ? "amber" : "slate"} />
                    <Stat label="อาจารย์สอนได้สูงสุด" value={s.coverage.teacherCapacity} tone="blue" />
                  </div>
                  {s.suggestions.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-800">{s.suggestions.map((x) => <li key={x}>{x}</li>)}</ul>
                  )}
                  <h3 className="mb-2 mt-4 text-sm font-medium">วิชาที่รอจัดสรรอาจารย์มากที่สุด</h3>
                  <DataTable
                    columns={[{ key: "code", label: "รหัสวิชา" }, { key: "name", label: "ชื่อวิชา" }, { key: "hours", label: "คาบ" }]}
                    rows={s.coverage.topPendingSubjects as unknown as Record<string, unknown>[]}
                  />
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium">ภาระสอน (คาบ/สัปดาห์ · สูงสุด 35)</h3>
                  <div className="space-y-1">
                    {s.balance.teachers.loads.map((t) => (
                      <button key={t.id} onClick={() => { setBy("teacher"); setFilter(""); setKey(String(t.id)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                        className="flex w-full items-center gap-2 rounded px-1 text-left text-sm hover:bg-slate-50" title="ดูตารางของอาจารย์">
                        <span className="w-48 truncate">{t.name}</span>
                        <div className="h-2 flex-1 rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(t.hours / 35) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right tabular-nums">{t.hours}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "balance" && (
              <div>
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
              </div>
            )}

            {tab === "data" && (s.data ? <DataCard d={s.data} /> : <p className="text-sm text-slate-500">ผลนี้จัดด้วยระบบรุ่นก่อน — จัดตารางใหม่เพื่อดูข้อมูลที่ใช้</p>)}
          </Card>
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
    sk.assignmentsNameMismatch > 0 && `รายการสอนที่ชื่อวิชาไม่ตรงกับกลุ่มใด ${sk.assignmentsNameMismatch} รายการ (ไม่นำมาใช้)`,
    sk.teachersWithoutRegisteredSubject > 0 && `อาจารย์ที่ไม่ได้สอนวิชาที่ลงทะเบียน ${sk.teachersWithoutRegisteredSubject} คน (ไม่นำมาจัด)`,
    sk.groupsWithoutRegistration > 0 && `กลุ่มเรียนที่ยังไม่ได้ลงวิชา ${sk.groupsWithoutRegistration} กลุ่ม`,
  ].filter(Boolean) as string[];
  const examples = [...sk.unregisteredExamples, ...sk.nameMismatchExamples];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="กลุ่มเรียน" value={d.used.groups} tone="blue" />
        <Stat label="วิชาที่ลงทะเบียน" value={d.used.subjects} tone="blue" />
        <Stat label="รายการลงทะเบียน" value={d.used.registrations} tone="blue" />
        <Stat label="คาบ/สัปดาห์" value={d.used.hours} tone="blue" />
        <Stat label="อาจารย์ที่สอนวิชาเหล่านี้" value={d.used.teachers} tone="green" />
      </div>
      <p className="text-xs text-slate-500">
        ผู้สอนเลือกจากอาจารย์ที่สอน <b>รหัสวิชา + ชื่อวิชาตรงกับที่กลุ่มลงทะเบียน</b> (ไฟล์รหัสและชื่อวิชา) เท่านั้น ·
        ใช้ {d.used.assignments.toLocaleString()} รายการสอน
      </p>
      {sk.registrationsWithoutTeacher > 0 && (
        <p className="text-sm text-amber-700">
          รายการลงทะเบียนที่ไม่มีผู้สอนตรงรหัส+ชื่อวิชา {sk.registrationsWithoutTeacher} รายการ → จัดเวลาไว้ แสดง “รอจัดสรรอาจารย์”
          <span className="block text-xs text-amber-600">เช่น {sk.withoutTeacherExamples.join(", ")}</span>
        </p>
      )}

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
            {examples.length > 0 && (
              <p className="mt-1 text-xs text-slate-400">เช่น {examples.join(", ")}</p>
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
    </div>
  );
}

const VIEW_NAME: Record<ViewBy, string> = { group: "กลุ่มเรียน", teacher: "อาจารย์", building: "อาคาร", room: "ห้อง" };

/** ส่งออก: PDF / Excel (this page or all pages of the current view) and CSV (full list) */
function ExportMenu({ runId, by, viewKey, current }: { runId: number; by: ViewBy; viewKey: string; current?: string }) {
  const base = `${API_URL}/schedule/runs/${runId}`;
  const one = viewKey ? `&key=${encodeURIComponent(viewKey)}` : "";
  const items: { group: string; icon: string; label: string; sub: string; href: string }[] = [
    ...(viewKey ? [{ group: "PDF", icon: "📄", label: "PDF หน้านี้", sub: current ?? "", href: `${base}/export.pdf?by=${by}${one}` }] : []),
    { group: "PDF", icon: "📄", label: `PDF ทุก${VIEW_NAME[by]}`, sub: "1 หน้าต่อ 1 ตาราง (A4 แนวนอน)", href: `${base}/export.pdf?by=${by}` },
    ...(viewKey ? [{ group: "Excel", icon: "📊", label: "Excel หน้านี้", sub: current ?? "", href: `${base}/export.xlsx?by=${by}${one}` }] : []),
    { group: "Excel", icon: "📊", label: `Excel ทุก${VIEW_NAME[by]}`, sub: "ชีตรายการทั้งหมด + 1 ชีตต่อตาราง", href: `${base}/export.xlsx?by=${by}` },
    { group: "CSV", icon: "🧾", label: "CSV รายการทั้งหมด", sub: "ทุกคาบ 1 แถว (เปิดใน Excel ได้)", href: `${base}/export.csv` },
  ];
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md bg-indigo-600 px-3 py-1 font-medium text-white hover:bg-indigo-700">⬇ ส่งออก ▾</summary>
      <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
        {items.map((it) => (
          <a key={it.href} href={it.href} className="flex items-start gap-2 rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50">
            <span>{it.icon}</span>
            <span className="min-w-0">
              <span className="block font-medium">{it.label}</span>
              {it.sub && <span className="block truncate text-xs text-slate-400">{it.sub}</span>}
            </span>
          </a>
        ))}
        <p className="px-3 pb-1 pt-2 text-[11px] text-slate-400">PDF ทุกกลุ่มอาจใช้เวลาหลายวินาที</p>
      </div>
    </details>
  );
}

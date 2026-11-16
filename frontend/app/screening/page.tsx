"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Card, ErrorBox } from "@/components/ui";
import { api } from "@/lib/api";
import { matches } from "@/lib/screeningFilter";

type Status = "READY_TO_SCHEDULE" | "NOT_REGISTERED" | "INVALID_DATA" | "PENDING_REVIEW";
interface Issue { type: string; blocking: boolean; cause: string; fix: string[] }
interface Item {
  id: string; status: Status; groupCode: string; groupName: string; registered: boolean;
  subjectCode: string; subjectName: string; periods: number | null; department: string | null; building: string | null;
  mainTeachers: string[]; coTeachers: string[];
  source: { file: string; sheet: string; row: number | null } | null;
  data: Record<string, unknown>; issues: Issue[]; reviewable: boolean; approved: boolean;
}
interface Summary {
  total: number; ready: number; notRegistered: number; invalid: number; pending: number;
  readyHours: number; notRegisteredHours: number; invalidHours: number; pendingHours: number;
  registeredGroups: number; byIssue: Record<string, number>;
}
interface Result {
  items: Item[]; summary: Summary; token: string; screenedAt: string;
  statusLabels: Record<Status, string>; issueLabels: Record<string, string>;
}

const STATUS_STYLE: Record<Status, { chip: string; dot: string }> = {
  READY_TO_SCHEDULE: { chip: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  NOT_REGISTERED: { chip: "bg-slate-200 text-slate-700", dot: "bg-slate-500" },
  INVALID_DATA: { chip: "bg-red-100 text-red-800", dot: "bg-red-500" },
  PENDING_REVIEW: { chip: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
};
const ORDER: Status[] = ["READY_TO_SCHEDULE", "NOT_REGISTERED", "INVALID_DATA", "PENDING_REVIEW"];
const PAGE = 200;

export default function ScreeningPage() {
  const router = useRouter();
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  // filters (C) — applied instantly, no search button
  const [fCode, setFCode] = useState("");
  const [fName, setFName] = useState("");
  const [fTeacher, setFTeacher] = useState("");
  const [fGroup, setFGroup] = useState("");
  const [fStatus, setFStatus] = useState<Set<Status>>(new Set());
  const [fIssue, setFIssue] = useState("");
  const [fDept, setFDept] = useState("");
  const [fPeriods, setFPeriods] = useState("");
  // gate (F)
  const [confirmed, setConfirmed] = useState(false);
  const [mode, setMode] = useState("period10");
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      setRes(await api<Result>("/screening"));
      setConfirmed(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const items = res?.items ?? [];
  const departments = useMemo(() => [...new Set(items.map((i) => i.department ?? "ไม่ทราบแผนก"))].sort(), [items]);
  const periodsOptions = useMemo(() => [...new Set(items.map((i) => i.periods).filter((p): p is number => p != null))].sort((a, b) => a - b), [items]);

  const filtered = useMemo(() => {
    const f = { code: fCode, name: fName, teacher: fTeacher, group: fGroup, statuses: fStatus as Set<string>, issue: fIssue, department: fDept, periods: fPeriods };
    return items.filter((i) => matches(i, f));
  }, [items, fCode, fName, fTeacher, fGroup, fStatus, fIssue, fDept, fPeriods]);
  useEffect(() => setShown(PAGE), [filtered]);

  const anyFilter = fCode || fName || fTeacher || fGroup || fStatus.size || fIssue || fDept || fPeriods;
  function clearFilters() {
    setFCode(""); setFName(""); setFTeacher(""); setFGroup(""); setFStatus(new Set()); setFIssue(""); setFDept(""); setFPeriods("");
  }
  function toggleStatus(s: Status) {
    setFStatus((cur) => { const n = new Set(cur); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }

  async function review(item: Item, approve: boolean) {
    try {
      await api("/screening/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id, approve }) });
      await load();
    } catch (e) { setErr((e as Error).message); }
  }

  async function startScheduling() {
    if (!res) return;
    setRunning(true);
    setErr("");
    try {
      await api("/schedule/generate", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ activityMode: mode, screeningToken: res.token }),
      });
      router.push("/schedule");
    } catch (e) {
      setErr((e as Error).message);
      await load(); // data may have changed → show the fresh screening result
    } finally {
      setRunning(false);
    }
  }

  const s = res?.summary;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">คัดกรองข้อมูลก่อนจัดตาราง</h1>
          <p className="text-sm text-slate-500">
            ตรวจความสัมพันธ์ของกลุ่มเรียน · รายวิชา · คาบ · อาจารย์ (ผู้สอนหลัก/ร่วม) · อาคาร · ห้อง — ส่งเข้าจัดตารางเฉพาะ “พร้อมจัดตาราง”
          </p>
        </div>
        <button onClick={load} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50">
          {loading ? "กำลังคัดกรอง…" : "↻ คัดกรองใหม่"}
        </button>
      </div>

      {err && <ErrorBox message={err} />}

      {/* D. Pre-Scheduling Report */}
      {s && res && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">สรุปผลคัดกรอง</h2>
            <span className="text-xs text-slate-400">
              คัดกรองเมื่อ {new Date(res.screenedAt).toLocaleString("th-TH")} · ทะเบียนกลุ่มเรียน {s.registeredGroups} กลุ่ม
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Tile label="รายการทั้งหมด" value={s.total} />
            {ORDER.map((st) => {
              const v = st === "READY_TO_SCHEDULE" ? s.ready : st === "NOT_REGISTERED" ? s.notRegistered : st === "INVALID_DATA" ? s.invalid : s.pending;
              const h = st === "READY_TO_SCHEDULE" ? s.readyHours : st === "NOT_REGISTERED" ? s.notRegisteredHours : st === "INVALID_DATA" ? s.invalidHours : s.pendingHours;
              return (
                <button key={st} onClick={() => setFStatus(new Set([st]))} className="text-left">
                  <Tile label={res.statusLabels[st]} value={v} sub={`${h.toLocaleString()} คาบ`} dot={STATUS_STYLE[st].dot} active={fStatus.size === 1 && fStatus.has(st)} />
                </button>
              );
            })}
          </div>
          <p className="text-sm text-slate-600">
            พร้อมจัดตาราง <b>{s.readyHours.toLocaleString()}</b> คาบ/สัปดาห์ · ยกเว้นเพราะไม่มีการลงทะเบียน <b>{s.notRegisteredHours.toLocaleString()}</b> คาบ
            {s.invalidHours + s.pendingHours > 0 && <> · ยังไม่ส่ง (ผิดพลาด/รอตรวจ) <b>{(s.invalidHours + s.pendingHours).toLocaleString()}</b> คาบ</>}
          </p>
        </Card>
      )}

      {/* F. Scheduling Gate */}
      {s && res && (
        <Card className={s.ready ? "border-indigo-200 bg-indigo-50/40" : "border-red-200 bg-red-50"}>
          <h2 className="mb-2 font-medium">ยืนยันผลคัดกรองและเริ่มจัดตาราง</h2>
          {s.ready === 0 ? (
            <p className="text-sm text-red-700">ไม่มีรายการที่พร้อมจัดตาราง — แก้ข้อมูลตามรายละเอียดด้านล่างก่อน</p>
          ) : (
            <div className="space-y-3 text-sm">
              <ul className="list-disc space-y-0.5 pl-5 text-slate-700">
                <li>ส่งเข้าจัดตาราง: <b>{s.ready.toLocaleString()}</b> รายการ ({s.readyHours.toLocaleString()} คาบ)</li>
                <li>ไม่ส่ง: ไม่มีการลงทะเบียน {s.notRegistered} · ข้อมูลผิดพลาด {s.invalid} · รอตรวจสอบ {s.pending} รายการ (เก็บข้อมูลไว้ครบ)</li>
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  ฉันตรวจผลคัดกรองแล้ว และยืนยันให้จัดตารางเฉพาะรายการที่พร้อมจัดตาราง
                </label>
                <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5">
                  <option value="period10">กิจกรรมฯ วันพฤหัสบดี จบคาบ 10</option>
                  <option value="groupLast">กิจกรรมฯ วันพฤหัสบดี เป็นคาบสุดท้ายของกลุ่ม</option>
                </select>
                <button onClick={startScheduling} disabled={!confirmed || running}
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
                  {running ? "กำลังจัดตาราง…" : "⚙️ เริ่มจัดตาราง"}
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* C. Smart Auto Filter */}
      {res && (
        <Card className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <Input value={fCode} onChange={setFCode} placeholder="รหัสวิชา" />
            <Input value={fName} onChange={setFName} placeholder="ชื่อวิชา" />
            <Input value={fTeacher} onChange={setFTeacher} placeholder="อาจารย์" />
            <Input value={fGroup} onChange={setFGroup} placeholder="กลุ่มเรียน (รหัส/ชื่อ)" />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {ORDER.map((st) => (
              <button key={st} onClick={() => toggleStatus(st)}
                className={`rounded-full px-3 py-1 ${fStatus.has(st) ? STATUS_STYLE[st].chip + " ring-2 ring-offset-1 ring-slate-400" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {res.statusLabels[st]}
              </button>
            ))}
            <select value={fIssue} onChange={(e) => setFIssue(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1">
              <option value="">ทุกประเภทปัญหา</option>
              {Object.entries(res.issueLabels).map(([k, v]) => (
                <option key={k} value={k}>{v} ({res.summary.byIssue[k] ?? 0})</option>
              ))}
            </select>
            <select value={fDept} onChange={(e) => setFDept(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1">
              <option value="">ทุกแผนก</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={fPeriods} onChange={(e) => setFPeriods(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1">
              <option value="">ทุกจำนวนคาบ</option>
              {periodsOptions.map((p) => <option key={p} value={p}>{p} คาบ</option>)}
            </select>
            {anyFilter ? <button onClick={clearFilters} className="text-indigo-600 hover:underline">ล้างตัวกรอง</button> : null}
            <span className="ml-auto text-slate-500">แสดง {filtered.length.toLocaleString()} / {items.length.toLocaleString()} รายการ</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">สถานะ</th>
                  <th className="px-3 py-2 font-medium">กลุ่มเรียน</th>
                  <th className="px-3 py-2 font-medium">รหัสวิชา</th>
                  <th className="px-3 py-2 font-medium">ชื่อวิชา</th>
                  <th className="px-3 py-2 font-medium">คาบ</th>
                  <th className="px-3 py-2 font-medium">แผนก / อาคาร</th>
                  <th className="px-3 py-2 font-medium">ผู้สอนหลัก / ร่วม</th>
                  <th className="px-3 py-2 font-medium">ปัญหา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">ไม่พบรายการตามเงื่อนไข</td></tr>
                )}
                {filtered.slice(0, shown).map((i) => (
                  <Fragment key={i.id}>
                    <tr onClick={() => setOpen(open === i.id ? null : i.id)} className={`cursor-pointer hover:bg-slate-50 ${open === i.id ? "bg-slate-50" : ""}`}>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[i.status].chip}`}>{res!.statusLabels[i.status]}</span>
                        {i.approved && <span className="ml-1 text-xs text-emerald-600" title="ผู้ใช้ยืนยันแล้ว">✓ยืนยัน</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <div>{i.groupCode || <span className="text-red-500">ว่าง</span>}</div>
                        {i.groupName && i.groupName !== i.groupCode && <div className="text-xs text-slate-500">{i.groupName}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">{i.subjectCode || <span className="text-red-500">ว่าง</span>}</td>
                      <td className="px-3 py-1.5">{i.subjectName}</td>
                      <td className="px-3 py-1.5 tabular-nums">{i.periods ?? <span className="text-red-500">—</span>}</td>
                      <td className="px-3 py-1.5 text-xs">{i.department ?? "—"}<div className="text-slate-400">{i.building}</div></td>
                      <td className="px-3 py-1.5 text-xs">
                        {i.mainTeachers.length ? i.mainTeachers.join(", ") : <span className="text-red-500">ไม่มีผู้สอนหลัก</span>}
                        {i.coTeachers.length > 0 && <div className="text-slate-400">ร่วม: {i.coTeachers.join(", ")}</div>}
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {i.issues.map((x) => (
                          <span key={x.type} className={`mr-1 inline-block rounded px-1.5 py-0.5 ${x.blocking ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                            {res!.issueLabels[x.type]}
                          </span>
                        ))}
                      </td>
                    </tr>
                    {open === i.id && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50 px-4 py-3">
                          <Guidance item={i} labels={res!.issueLabels} onReview={review} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > shown && (
            <button onClick={() => setShown((n) => n + PAGE)} className="w-full rounded-md border border-slate-300 bg-white py-2 text-sm hover:bg-slate-50">
              แสดงเพิ่ม ({(filtered.length - shown).toLocaleString()} รายการ)
            </button>
          )}
        </Card>
      )}
    </div>
  );
}

/** E. Error Guidance */
function Guidance({ item, labels, onReview }: { item: Item; labels: Record<string, string>; onReview: (i: Item, approve: boolean) => void }) {
  const editHref = item.id.startsWith("gs-")
    ? `/manage/group_subjects?q=${encodeURIComponent(`${item.subjectCode}`)}`
    : null;
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-xs font-medium text-slate-500">ข้อมูลต้นฉบับ</div>
          <div className="text-slate-700">
            {item.source
              ? <>ไฟล์ <b>{item.source.file}</b> · Worksheet <b>{item.source.sheet}</b> · แถว <b>{item.source.row ?? "—"}</b></>
              : "ไม่มีตำแหน่งในไฟล์ (เพิ่ม/แก้ในระบบ หรือนำเข้าก่อนเปิดใช้การคัดกรอง — นำเข้าไฟล์ใหม่เพื่อดูหมายเลขแถว)"}
          </div>
          <table className="mt-1 text-xs">
            <tbody>
              {Object.entries(item.data).map(([k, v]) => (
                <tr key={k}><td className="pr-3 text-slate-500">{k}</td><td className="text-slate-800">{v == null || v === "" ? <i className="text-red-500">ว่าง</i> : String(v)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          {item.reviewable && (
            item.approved
              ? <button onClick={() => onReview(item, false)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100">ยกเลิกการยืนยัน</button>
              : <button onClick={() => onReview(item, true)} className="rounded-md bg-amber-500 px-3 py-1.5 font-medium text-white hover:bg-amber-600">ยืนยันให้จัดตาราง</button>
          )}
          {editHref && <Link href={editHref} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100">แก้ไขข้อมูลในระบบ</Link>}
        </div>
      </div>
      {item.issues.length === 0 && <p className="text-emerald-700">ผ่านการตรวจสอบทุกข้อ — พร้อมจัดตาราง</p>}
      {item.issues.map((x) => (
        <div key={x.type} className={`rounded-lg border p-3 ${x.blocking ? "border-red-200 bg-white" : "border-slate-200 bg-white"}`}>
          <div className={`font-medium ${x.blocking ? "text-red-700" : "text-slate-600"}`}>
            {labels[x.type]}{!x.blocking && <span className="ml-2 text-xs font-normal text-slate-400">(คำเตือน ไม่บล็อกการจัดตาราง)</span>}
          </div>
          <div className="mt-1 text-slate-700"><span className="text-slate-500">สาเหตุ: </span>{x.cause}</div>
          <div className="mt-1 text-slate-500">วิธีแก้ไข:</div>
          <ol className="list-decimal space-y-0.5 pl-6 text-slate-700">{x.fix.map((f) => <li key={f}>{f}</li>)}</ol>
        </div>
      ))}
    </div>
  );
}

function Tile({ label, value, sub, dot, active }: { label: string; value: number; sub?: string; dot?: string; active?: boolean }) {
  return (
    <div className={`rounded-lg px-4 py-3 ${active ? "bg-indigo-100 ring-2 ring-indigo-400" : "bg-slate-50 hover:bg-slate-100"}`}>
      <div className="flex items-center gap-1.5 text-xs text-slate-500">{dot && <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />}{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={`🔍 ${placeholder}`}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500" />
  );
}

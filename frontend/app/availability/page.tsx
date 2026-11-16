"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Card, ErrorBox } from "@/components/ui";
import { api, DAYS, type Option } from "@/lib/api";

const PERIODS = 10;
const key = (d: number, p: number) => `${d}:${p}`;

export default function AvailabilityPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">กำลังโหลด…</p>}>
      <Availability />
    </Suspense>
  );
}

function Availability() {
  const params = useSearchParams();
  const [teachers, setTeachers] = useState<Option[]>([]);
  const [teacher, setTeacher] = useState(params.get("teacher") ?? "");
  const [slots, setSlots] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<null | boolean>(null); // paint mode while mouse is down

  useEffect(() => {
    api<Option[]>("/manage/teachers/options")
      .then((t) => { setTeachers(t); setTeacher((cur) => cur || t[0]?.value || ""); })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!teacher) return;
    setMsg("");
    api<string[]>(`/manage/teachers/${teacher}/unavailable`)
      .then((s) => { setSlots(new Set(s)); setSaved(new Set(s)); setErr(""); })
      .catch((e) => setErr(e.message));
  }, [teacher]);

  useEffect(() => {
    const up = () => setDrag(null);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const dirty = useMemo(() => slots.size !== saved.size || [...slots].some((s) => !saved.has(s)), [slots, saved]);

  function set(keys: string[], on: boolean) {
    setSlots((cur) => {
      const n = new Set(cur);
      for (const k of keys) (on ? n.add(k) : n.delete(k));
      return n;
    });
  }
  const dayKeys = (d: number) => Array.from({ length: PERIODS }, (_, p) => key(d, p));
  const periodKeys = (p: number) => DAYS.map((_, d) => key(d, p));
  const allOn = (keys: string[]) => keys.every((k) => slots.has(k));

  async function save() {
    setSaving(true);
    setErr("");
    try {
      await api(`/manage/teachers/${teacher}/unavailable`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ slots: [...slots] }),
      });
      setSaved(new Set(slots));
      setMsg(`บันทึกแล้ว (${slots.size} คาบไม่ว่าง) — กด “จัดตารางอัตโนมัติ” ใหม่เพื่อใช้ข้อมูลนี้`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">เวลาไม่ว่างของอาจารย์</h1>
        <p className="text-sm text-slate-500">คลิกหรือลากเพื่อเลือกคาบที่อาจารย์ <b>ไม่ว่าง</b> — ระบบจะไม่จัดสอนในคาบเหล่านี้ (เงื่อนไขบังคับข้อ 2)</p>
      </div>

      {err && <ErrorBox message={err} />}
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{msg}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <select value={teacher} onChange={(e) => { if (!dirty || confirm("ยังไม่ได้บันทึก — เปลี่ยนอาจารย์?")) setTeacher(e.target.value); }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {teachers.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <span className="text-sm text-slate-500">ไม่ว่าง {slots.size} คาบ / 50</span>
        <button onClick={() => setSlots(new Set())} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">ล้างทั้งหมด</button>
        <button onClick={save} disabled={!dirty || saving || !teacher}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}
        </button>
        <Link href="/manage/teachers" className="ml-auto text-sm text-slate-500 hover:text-indigo-600">← จัดการรายชื่ออาจารย์</Link>
      </div>

      {teachers.length === 0 && !err && <Card><p className="text-slate-500">ยังไม่มีอาจารย์ — เพิ่มที่หน้าจัดการข้อมูลก่อน</p></Card>}

      {teacher && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white select-none">
          <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600">
                <th className="w-24 border border-slate-200 px-2 py-2 text-left font-medium">วัน / คาบ</th>
                {Array.from({ length: PERIODS }, (_, p) => (
                  <th key={p} className="border border-slate-200 p-0 font-medium">
                    <button title="สลับทั้งคาบ" onClick={() => set(periodKeys(p), !allOn(periodKeys(p)))} className="w-full px-1 py-2 hover:bg-slate-200">
                      {p + 1}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, d) => (
                <tr key={d}>
                  <th className="border border-slate-200 bg-slate-50 p-0 text-left font-medium text-slate-700">
                    <button title="สลับทั้งวัน" onClick={() => set(dayKeys(d), !allOn(dayKeys(d)))} className="w-full px-2 py-3 text-left hover:bg-slate-200">{day}</button>
                  </th>
                  {Array.from({ length: PERIODS }, (_, p) => {
                    const k = key(d, p);
                    const off = slots.has(k);
                    return (
                      <td key={p}
                        onMouseDown={() => { setDrag(!off); set([k], !off); }}
                        onMouseEnter={() => { if (drag !== null) set([k], drag); }}
                        className={`cursor-pointer border border-slate-200 text-center text-xs transition ${off ? "bg-red-400 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                        <div className="py-3">{off ? "ไม่ว่าง" : "ว่าง"}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">เคล็ดลับ: คลิกชื่อวันหรือเลขคาบเพื่อสลับทั้งแถว/คอลัมน์ · อาจารย์ยังต้องมีพักในคาบ 4–6 และสอนไม่เกิน 7 ชม./วันเสมอ</p>
    </div>
  );
}

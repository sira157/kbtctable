"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Card, ErrorBox } from "@/components/ui";
import { ApiError, api, MANAGE_ORDER, type EntityDef, type FieldDef, type Meta, type Option } from "@/lib/api";

const LIMIT = 50;

/** columns shown in the list (from the backend's list SELECT) */
const COLUMNS: Record<string, { key: string; label: string }[]> = {
  class_groups: [
    { key: "code", label: "รหัสกลุ่ม" }, { key: "name", label: "ชื่อกลุ่มเรียน" }, { key: "major", label: "สาขาวิชา" },
    { key: "students", label: "นักศึกษา" }, { key: "registered_label", label: "ทะเบียน" },
    { key: "subject_count", label: "จำนวนวิชา" }, { key: "hours", label: "คาบ/สัปดาห์" },
  ],
  subjects: [
    { key: "code", label: "รหัสวิชา" }, { key: "name", label: "ชื่อวิชา" }, { key: "room_type", label: "ประเภทห้อง" },
    { key: "group_count", label: "กลุ่มที่ลง" }, { key: "teacher_count", label: "ผู้สอน" },
  ],
  group_subjects: [
    { key: "group_code", label: "รหัสกลุ่ม" }, { key: "group_name", label: "ชื่อกลุ่ม" },
    { key: "subject_code", label: "รหัสวิชา" }, { key: "subject_display", label: "ชื่อวิชา (ของกลุ่ม)" }, { key: "periods_per_week", label: "คาบ/สัปดาห์" },
  ],
  teachers: [
    { key: "name", label: "ชื่ออาจารย์" }, { key: "rank", label: "ตำแหน่ง" }, { key: "department", label: "แผนก" },
    { key: "subject_count", label: "วิชาที่สอน" }, { key: "unavailable_count", label: "คาบไม่ว่าง" },
  ],
  teacher_subjects: [
    { key: "teacher_name", label: "อาจารย์" }, { key: "subject_code", label: "รหัสวิชา" },
    { key: "subject_display", label: "ชื่อวิชา" }, { key: "role", label: "หน้าที่" },
  ],
  buildings: [{ key: "name", label: "ชื่ออาคาร" }, { key: "room_count", label: "จำนวนห้อง" }],
  rooms: [
    { key: "building_name", label: "อาคาร" }, { key: "room_code", label: "ห้อง" },
    { key: "capacity", label: "ความจุ" }, { key: "room_type", label: "ประเภท" },
  ],
};

type Row = Record<string, unknown>;

export default function ManagePage() {
  const { entity } = useParams<{ entity: string }>();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [editing, setEditing] = useState<{ id: string | null; values: Record<string, string> } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => { api<Meta>("/manage/meta").then(setMeta).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { const id = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(id); }, [search]);
  useEffect(() => {
    // ?q= pre-fills the search (used by "แก้ไขข้อมูลในระบบ" on the screening page)
    const initial = new URLSearchParams(window.location.search).get("q") ?? "";
    setEditing(null); setSearch(initial); setQ(initial); setPage(1);
  }, [entity]);

  useEffect(() => {
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT), search: q });
    api<{ rows: Row[]; total: number }>(`/manage/${entity}?${p}`)
      .then((d) => { setRows(d.rows); setTotal(d.total); setErr(""); })
      .catch((e) => setErr(e.message));
  }, [entity, page, q, reload]);

  const def = meta?.[entity];
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  function startEdit(row: Row | null) {
    if (!def) return;
    const values: Record<string, string> = {};
    for (const f of def.fields) {
      values[f.key] = row?.[f.key] == null ? (f.kind === "bool" && !row ? "1" : "") : String(row[f.key]);
    }
    setEditing({ id: row ? String(row[def.pk]) : null, values });
    setFlash("");
  }

  async function remove(row: Row) {
    if (!def) return;
    const id = String(row[def.pk]);
    const name = String(row.name ?? row.code ?? row.room_code ?? row.subject_code ?? id);
    if (!confirm(`ลบ "${name}" ?${def.cascade ? `\n\nจะลบ${def.cascade}ด้วย` : ""}`)) return;
    try {
      await api(`/manage/${entity}/${encodeURIComponent(id)}`, { method: "DELETE" });
      setFlash(`ลบ "${name}" แล้ว`);
      setReload((n) => n + 1);
    } catch (e) { setErr((e as Error).message); }
  }

  const columns = COLUMNS[entity] ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">จัดการข้อมูล</h1>
          <p className="text-sm text-slate-500">เพิ่ม/แก้ไข/ลบข้อมูลเอง — ระบบตรวจข้อมูลแบบเดียวกับตอนนำเข้า แล้วกด “จัดตารางอัตโนมัติ” ใหม่เพื่อใช้ข้อมูลล่าสุด</p>
        </div>
        <Link href="/availability" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">🕑 เวลาไม่ว่างของอาจารย์</Link>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {MANAGE_ORDER.map((k) => (
          <Link key={k} href={`/manage/${k}`}
            className={`rounded-md px-3 py-1.5 text-sm ${k === entity ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
            {meta?.[k]?.label ?? k}
          </Link>
        ))}
      </div>

      {err && <ErrorBox message={err} />}
      {flash && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{flash}</div>}

      {def && editing && (
        <EditForm
          entity={entity} def={def} editing={editing}
          onCancel={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setFlash(msg); setReload((n) => n + 1); }}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา…"
          className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500" />
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">ทั้งหมด {total.toLocaleString()} รายการ</span>
          <button onClick={() => startEdit(null)} disabled={!def}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            + เพิ่ม{def?.label ?? ""}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-slate-600">
            <tr>
              {columns.map((c) => <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">{c.label}</th>)}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-6 text-center text-slate-400">ไม่มีข้อมูล</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-1.5">
                    {r[c.key] == null || r[c.key] === "" ? <span className="text-slate-300">—</span> : String(r[c.key])}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-1.5 text-right">
                  {entity === "teachers" && (
                    <Link href={`/availability?teacher=${r.id}`} className="mr-3 text-slate-500 hover:text-indigo-600">เวลาไม่ว่าง</Link>
                  )}
                  <button onClick={() => startEdit(r)} className="mr-3 text-indigo-600 hover:underline">แก้ไข</button>
                  <button onClick={() => remove(r)} className="text-red-600 hover:underline">ลบ</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40">← ก่อนหน้า</button>
          <span className="tabular-nums">หน้า {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40">ถัดไป →</button>
        </div>
      )}
    </div>
  );
}

function EditForm({ entity, def, editing, onCancel, onSaved }: {
  entity: string; def: EntityDef; editing: { id: string | null; values: Record<string, string> };
  onCancel: () => void; onSaved: (msg: string) => void;
}) {
  const [values, setValues] = useState(editing.values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [options, setOptions] = useState<Record<string, Option[]>>({});

  useEffect(() => { setValues(editing.values); setErrors({}); setMessage(""); }, [editing]);

  const loadOptions = useCallback(async () => {
    const refs = [...new Set(def.fields.filter((f) => f.kind === "ref").map((f) => f.ref!))];
    const out: Record<string, Option[]> = {};
    for (const r of refs) out[r] = await api<Option[]>(`/manage/${r}/options`);
    setOptions(out);
  }, [def]);
  useEffect(() => { loadOptions().catch(() => {}); }, [loadOptions]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage("");
    try {
      const path = editing.id === null ? `/manage/${entity}` : `/manage/${entity}/${encodeURIComponent(editing.id)}`;
      await api(path, {
        method: editing.id === null ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      onSaved(editing.id === null ? `เพิ่ม${def.label}แล้ว` : `บันทึกการแก้ไขแล้ว`);
    } catch (err) {
      setMessage((err as Error).message);
      if (err instanceof ApiError) setErrors(err.fieldErrors);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-indigo-200">
      <form onSubmit={save} className="space-y-4">
        <h2 className="font-medium">{editing.id === null ? `เพิ่ม${def.label}` : `แก้ไข${def.label}`}</h2>
        {message && <ErrorBox message={message} />}
        <div className="grid gap-4 md:grid-cols-2">
          {def.fields.map((f) => (
            <FieldInput key={f.key} f={f} value={values[f.key] ?? ""} error={errors[f.key]}
              options={f.ref ? options[f.ref] ?? [] : []} refAutoId={f.ref === "teachers" || f.ref === "buildings"}
              onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
          ))}
        </div>
        <div className="flex gap-3">
          <button disabled={saving} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก…" : "บันทึก"}
          </button>
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm hover:bg-slate-50">ยกเลิก</button>
        </div>
      </form>
    </Card>
  );
}

function FieldInput({ f, value, error, options, refAutoId, onChange }: {
  f: FieldDef; value: string; error?: string; options: Option[]; refAutoId: boolean; onChange: (v: string) => void;
}) {
  const cls = `w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 ${error ? "border-red-400" : "border-slate-300"}`;
  const listId = `dl-${f.key}`;
  let input: React.ReactNode;
  if (f.kind === "bool") {
    return (
      <label className="flex items-start gap-2 text-sm md:col-span-2">
        <input type="checkbox" checked={value === "1"} onChange={(e) => onChange(e.target.checked ? "1" : "0")} className="mt-1" />
        <span>
          <span className="font-medium text-slate-700">{f.label}</span>
          {f.help && <span className="block text-xs text-slate-400">{f.help}</span>}
          {error && <span className="block text-xs text-red-600">{error}</span>}
        </span>
      </label>
    );
  }
  if (f.kind === "enum") {
    input = (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        {!f.required && <option value="">— ไม่ระบุ —</option>}
        {f.required && !value && <option value="">— เลือก —</option>}
        {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (f.kind === "ref" && refAutoId) {
    input = (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">— เลือก —</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else if (f.kind === "ref") {
    const match = options.find((o) => o.value === value);
    input = (
      <>
        <input value={value} onChange={(e) => onChange(e.target.value)} list={listId} placeholder="พิมพ์รหัสหรือชื่อเพื่อค้นหา" className={cls} />
        <datalist id={listId}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</datalist>
        {match && <div className="mt-1 text-xs text-slate-500">{match.label}</div>}
      </>
    );
  } else {
    input = (
      <input value={value} onChange={(e) => onChange(e.target.value)} className={cls}
        type={f.kind === "int" ? "number" : "text"} min={f.min} max={f.max} />
    );
  }
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">
        {f.label}{f.required && <span className="text-red-500"> *</span>}
      </span>
      {input}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span>
        : f.help && <span className="mt-1 block text-xs text-slate-400">{f.help}</span>}
    </label>
  );
}


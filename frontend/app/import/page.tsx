"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Card, DataTable, ErrorBox, IssueList } from "@/components/ui";
import { type CommitResult, FILE_TYPE_LABELS, type PreviewResult, TABLE_LABELS, uploadFile } from "@/lib/api";

/** import order matters: groups (registry) → registrations → teachers → buildings */
const ORDER = ["class_groups", "subjects", "teachers", "buildings"];

type Phase = "checking" | "ready" | "bad" | "importing" | "done" | "failed";
interface Job {
  id: number;
  file: File;
  phase: Phase;
  preview?: PreviewResult;
  result?: CommitResult;
  error?: string;
}

let seq = 0;

export default function ImportPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = (id: number, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));

  async function addFiles(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list)) {
      const job: Job = { id: ++seq, file, phase: "checking" };
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        setJobs((js) => [...js, { ...job, phase: "bad", error: "รองรับเฉพาะไฟล์ .xlsx" }]);
        continue;
      }
      setJobs((js) => [...js, job]);
      try {
        const preview = await uploadFile<PreviewResult>("/import/preview", file);
        // a newer file of the same type replaces the older one
        setJobs((js) => js
          .filter((j) => j.id === job.id || j.preview?.type !== preview.type || j.phase === "done")
          .map((j) => (j.id === job.id ? { ...j, phase: "ready", preview } : j)));
      } catch (e) {
        patch(job.id, { phase: "bad", error: (e as Error).message });
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const sorted = [...jobs].sort((a, b) => rank(a) - rank(b));
  const ready = sorted.filter((j) => j.phase === "ready");
  const lastDone = [...sorted].reverse().find((j) => j.phase === "done");
  const allDone = jobs.length > 0 && jobs.every((j) => j.phase === "done" || j.phase === "bad");

  async function importAll() {
    setRunning(true);
    for (const j of ready) {
      patch(j.id, { phase: "importing" });
      try {
        const result = await uploadFile<CommitResult>("/import/commit", j.file);
        patch(j.id, { phase: "done", result });
      } catch (e) {
        patch(j.id, { phase: "failed", error: (e as Error).message });
        break; // keep order: later files may depend on this one
      }
    }
    setRunning(false);
  }

  const missing = ORDER.filter((t) => !jobs.some((j) => j.preview?.type === t));
  const screening = lastDone?.result?.screening?.summary;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">นำเข้าไฟล์ Excel</h1>
        <p className="text-sm text-slate-500">เลือกได้หลายไฟล์พร้อมกัน ระบบรู้ประเภทไฟล์เองและนำเข้าตามลำดับที่ถูกต้อง</p>
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${drag ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-400"}`}
      >
        <input ref={inputRef} type="file" accept=".xlsx" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <div className="text-4xl">📂</div>
        <div className="mt-2 font-medium">ลากไฟล์ .xlsx มาวาง (ได้หลายไฟล์) หรือคลิกเพื่อเลือก</div>
        <div className="mt-1 text-xs text-slate-500">กลุ่มเรียน · รหัสและชื่อวิชา · อาจารย์ผู้สอน · อาคารเรียน</div>
      </label>

      {jobs.length > 0 && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">ไฟล์ที่เลือก ({jobs.length})</h2>
            {missing.length > 0 && !allDone && (
              <span className="text-xs text-slate-500">ยังไม่ได้เลือก: {missing.map((t) => FILE_TYPE_LABELS[t]).join(", ")}</span>
            )}
          </div>

          <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {sorted.map((j, i) => (
              <li key={j.id}>
                <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-600">{i + 1}</span>
                  <PhaseIcon phase={j.phase} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{j.file.name}</div>
                    <div className="text-xs text-slate-500">
                      {j.preview ? <span className="mr-2 rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">{j.preview.typeLabel}</span> : null}
                      <JobLine job={j} />
                    </div>
                  </div>
                  {j.preview && (
                    <button onClick={() => setOpen(open === j.id ? null : j.id)} className="text-xs text-indigo-600 hover:underline">
                      {open === j.id ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
                    </button>
                  )}
                  {(j.phase === "ready" || j.phase === "bad") && !running && (
                    <button onClick={() => setJobs((js) => js.filter((x) => x.id !== j.id))} className="text-slate-400 hover:text-red-600" title="เอาออก">✕</button>
                  )}
                </div>
                {open === j.id && j.preview && <PreviewDetails p={j.preview} result={j.result} />}
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-3">
            {ready.length > 0 && (
              <button onClick={importAll} disabled={running}
                className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {running ? "กำลังนำเข้า…" : `นำเข้า ${ready.length} ไฟล์`}
              </button>
            )}
            {!running && (
              <button onClick={() => setJobs([])} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">ล้างรายการ</button>
            )}
          </div>
        </Card>
      )}

      {screening && !running && (
        <Card className="border-indigo-200 bg-indigo-50">
          <div className="font-medium text-indigo-800">✅ นำเข้าเสร็จ — คัดกรองข้อมูลอัตโนมัติแล้ว</div>
          <div className="mt-1 text-sm text-slate-700">
            พร้อมจัดตาราง <b className="text-emerald-700">{screening.ready.toLocaleString()}</b> รายการ ({screening.readyHours.toLocaleString()} คาบ) ·
            ไม่มีการลงทะเบียน {screening.notRegistered.toLocaleString()} ·
            ผิดพลาด <b className="text-red-700">{screening.invalid}</b> ·
            รอตรวจสอบ <b className="text-amber-700">{screening.pending}</b>
          </div>
          <Link href="/screening" className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            ขั้นตอนถัดไป: ตรวจผลคัดกรอง →
          </Link>
        </Card>
      )}
    </div>
  );
}

function rank(j: Job) {
  const t = j.preview?.type;
  return t ? ORDER.indexOf(t) : 99;
}

function PhaseIcon({ phase }: { phase: Phase }) {
  const map: Record<Phase, [string, string]> = {
    checking: ["⏳", "กำลังตรวจ"],
    ready: ["📄", "พร้อมนำเข้า"],
    bad: ["⚠️", "ใช้ไม่ได้"],
    importing: ["⏳", "กำลังนำเข้า"],
    done: ["✅", "นำเข้าแล้ว"],
    failed: ["❌", "ล้มเหลว"],
  };
  return <span title={map[phase][1]} className="text-lg">{map[phase][0]}</span>;
}

function JobLine({ job }: { job: Job }) {
  if (job.phase === "checking") return <span>กำลังตรวจไฟล์…</span>;
  if (job.phase === "importing") return <span>กำลังนำเข้า…</span>;
  if (job.error) return <span className="text-red-600">{job.error}</span>;
  if (job.phase === "done" && job.result) {
    return <span className="text-emerald-700">เพิ่ม {job.result.inserted} · อัปเดต {job.result.updated}{job.result.skipped ? ` · ข้าม ${job.result.skipped}` : ""}</span>;
  }
  const p = job.preview;
  if (!p) return null;
  return (
    <span>
      {Object.entries(p.counts).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(" · ")}
      {p.errorCount > 0 && <span className="ml-2 text-red-600">ผิดพลาด {p.errorCount}</span>}
      {p.warningCount > 0 && <span className="ml-2 text-amber-600">คำเตือน {p.warningCount}</span>}
    </span>
  );
}

function PreviewDetails({ p, result }: { p: PreviewResult; result?: CommitResult }) {
  const [tab, setTab] = useState(Object.keys(p.preview)[0] ?? "");
  const section = p.preview[tab];
  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50 px-3 py-3">
      {result && (
        <DataTable
          columns={[{ key: "table", label: "ตาราง" }, { key: "inserted", label: "เพิ่มใหม่" }, { key: "updated", label: "อัปเดต" }, { key: "skipped", label: "ข้าม" }]}
          rows={Object.entries(result.details).map(([t, c]) => ({ table: TABLE_LABELS[t] ?? t, ...c }))}
        />
      )}
      {p.issues.length > 0 && <IssueList issues={p.issues} max={100} />}
      <div className="flex flex-wrap gap-2">
        {Object.entries(p.preview).map(([name, s]) => (
          <button key={name} onClick={() => setTab(name)}
            className={`rounded-md px-3 py-1 text-xs ${tab === name ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>
            {name} ({s.total.toLocaleString()})
          </button>
        ))}
      </div>
      {section && (
        <>
          <DataTable columns={section.columns.map((c) => ({ key: c, label: c }))} rows={section.rows} />
          {section.total > section.rows.length && <p className="text-xs text-slate-500">แสดง {section.rows.length} จาก {section.total.toLocaleString()} แถว</p>}
        </>
      )}
      {p.issues.some((i) => i.level === "error") && <ErrorBox message="แถวที่ผิดพลาดจะไม่ถูกนำไปจัดตาราง แต่ข้อมูลต้นฉบับจะเก็บไว้ และแสดงในหน้าคัดกรองพร้อมวิธีแก้" />}
    </div>
  );
}

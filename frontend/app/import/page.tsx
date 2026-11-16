"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Card, DataTable, ErrorBox, IssueList, Stat } from "@/components/ui";
import { type CommitResult, type PreviewResult, TABLE_LABELS, uploadFile } from "@/lib/api";

type Step = "pick" | "preview" | "done";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [tab, setTab] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function choose(f: File | undefined) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setErr("รองรับเฉพาะไฟล์ .xlsx");
      return;
    }
    setFile(f);
    setErr("");
    setResult(null);
    setLoading(true);
    try {
      const p = await uploadFile<PreviewResult>("/import/preview", f);
      setPreview(p);
      setTab(Object.keys(p.preview)[0] ?? "");
      setStep("preview");
    } catch (e) {
      setErr((e as Error).message);
      setStep("pick");
    } finally {
      setLoading(false);
    }
  }

  async function doImport() {
    if (!file) return;
    setLoading(true);
    setErr("");
    try {
      setResult(await uploadFile<CommitResult>("/import/commit", file));
      setStep("done");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setStep("pick");
    setErr("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const section = preview?.preview[tab];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">นำเข้าไฟล์ Excel</h1>
        <p className="text-sm text-slate-500">อัปโหลด → ตรวจสอบข้อมูล → ยืนยันนำเข้า</p>
      </div>

      <Steps step={step} />

      {err && <ErrorBox message={err} />}

      {step === "pick" && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files[0]); }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 text-center transition ${drag ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:border-indigo-400"}`}
        >
          <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
          <div className="text-4xl">📄</div>
          <div className="mt-3 font-medium">{loading ? "กำลังอ่านไฟล์…" : "ลากไฟล์ .xlsx มาวาง หรือคลิกเพื่อเลือกไฟล์"}</div>
          <div className="mt-1 text-xs text-slate-500">ระบบจะตรวจหาประเภทไฟล์จากหัวตารางอัตโนมัติ</div>
        </label>
      )}

      {step === "preview" && preview && (
        <>
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{preview.fileName}</span>
              <span className="rounded-full bg-indigo-100 px-3 py-0.5 text-xs font-medium text-indigo-700">{preview.typeLabel}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {Object.entries(preview.counts).map(([k, v]) => <Stat key={k} label={k} value={v} tone="blue" />)}
              <Stat label="ข้อผิดพลาด" value={preview.errorCount} tone={preview.errorCount ? "red" : "slate"} />
              <Stat label="คำเตือน" value={preview.warningCount} tone={preview.warningCount ? "amber" : "slate"} />
            </div>
            {preview.errorCount > 0 && (
              <p className="text-sm text-red-600">แถวที่มีข้อผิดพลาดจะถูกข้าม ข้อมูลที่ถูกต้องจะถูกนำเข้าตามปกติ</p>
            )}
          </Card>

          {preview.issues.length > 0 && (
            <Card>
              <h2 className="mb-3 font-medium">ปัญหาที่พบ</h2>
              <IssueList issues={preview.issues} />
            </Card>
          )}

          <Card>
            <div className="mb-3 flex flex-wrap gap-2">
              {Object.entries(preview.preview).map(([name, s]) => (
                <button
                  key={name}
                  onClick={() => setTab(name)}
                  className={`rounded-md px-3 py-1.5 text-sm ${tab === name ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {name} ({s.total.toLocaleString()})
                </button>
              ))}
            </div>
            {section && (
              <>
                <DataTable columns={section.columns.map((c) => ({ key: c, label: c }))} rows={section.rows} />
                {section.total > section.rows.length && (
                  <p className="mt-2 text-xs text-slate-500">แสดง {section.rows.length} จาก {section.total.toLocaleString()} แถว</p>
                )}
              </>
            )}
          </Card>

          <div className="flex gap-3">
            <button
              onClick={doImport}
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "กำลังนำเข้า…" : "นำเข้า"}
            </button>
            <button onClick={reset} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-5 py-2 text-slate-700 hover:bg-slate-50">
              ยกเลิก
            </button>
          </div>
        </>
      )}

      {step === "done" && result && (
        <Card className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-700">
            <span className="text-2xl">✅</span>
            <span className="font-medium">นำเข้า {result.fileName} ({result.typeLabel}) สำเร็จ</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="เพิ่มใหม่" value={result.inserted} tone="green" />
            <Stat label="อัปเดต" value={result.updated} tone="blue" />
            <Stat label="ข้าม" value={result.skipped} tone={result.skipped ? "amber" : "slate"} />
          </div>
          <DataTable
            columns={[
              { key: "table", label: "ตาราง" }, { key: "inserted", label: "เพิ่มใหม่" },
              { key: "updated", label: "อัปเดต" }, { key: "skipped", label: "ข้าม" },
            ]}
            rows={Object.entries(result.details).map(([t, c]) => ({ table: TABLE_LABELS[t] ?? t, ...c }))}
          />
          <div className="flex flex-wrap gap-3">
            <button onClick={reset} className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white hover:bg-indigo-700">
              นำเข้าไฟล์อื่น
            </button>
            {Object.keys(result.details).map((t) => (
              <Link key={t} href={`/data/${t}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-50">
                ดู{TABLE_LABELS[t] ?? t} →
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const steps: [Step, string][] = [["pick", "1. เลือกไฟล์"], ["preview", "2. ตรวจสอบ"], ["done", "3. เสร็จสิ้น"]];
  const idx = steps.findIndex(([s]) => s === step);
  return (
    <div className="flex gap-2 text-sm">
      {steps.map(([s, label], i) => (
        <div key={s} className={`rounded-full px-3 py-1 ${i <= idx ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"}`}>
          {label}
        </div>
      ))}
    </div>
  );
}

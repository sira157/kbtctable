"use client";

import { useEffect, useState } from "react";
import { Card, ErrorBox, IssueList } from "@/components/ui";
import { api, FILE_TYPE_LABELS, type ImportLog, TABLE_LABELS } from "@/lib/api";

export default function HistoryPage() {
  const [logs, setLogs] = useState<ImportLog[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    api<ImportLog[]>("/imports").then(setLogs).catch((e) => setErr(e.message));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">ประวัติการนำเข้า</h1>
      {err && <ErrorBox message={err} />}
      {logs && logs.length === 0 && <p className="text-slate-500">ยังไม่มีการนำเข้า</p>}

      <div className="space-y-3">
        {logs?.map((l) => {
          const issues = l.errors ?? [];
          const isOpen = open === l.id;
          return (
            <Card key={l.id} className="!p-0">
              <button
                onClick={() => setOpen(isOpen ? null : l.id)}
                className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-left"
              >
                <span className="text-xs text-slate-400 tabular-nums">#{l.id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.fileName}</span>
                  <span className="text-xs text-slate-500">
                    {FILE_TYPE_LABELS[l.fileType] ?? l.fileType} · {new Date(l.createdAt).toLocaleString("th-TH")}
                  </span>
                </span>
                <span className="text-sm tabular-nums text-emerald-600">+{l.inserted}</span>
                <span className="text-sm tabular-nums text-indigo-600">↻{l.updated}</span>
                <span className="text-sm tabular-nums text-amber-600">⤼{l.skipped}</span>
                <span className="text-xs text-slate-400">{issues.length} ปัญหา {isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <div className="space-y-3 border-t border-slate-100 px-5 py-4">
                  {l.details && (
                    <div className="flex flex-wrap gap-4 text-sm">
                      {Object.entries(l.details).map(([t, c]) => (
                        <span key={t} className="rounded bg-slate-100 px-2 py-1">
                          {TABLE_LABELS[t] ?? t}: เพิ่ม {c.inserted} · อัปเดต {c.updated}
                          {c.skipped ? ` · ข้าม ${c.skipped}` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  {issues.length ? <IssueList issues={issues} /> : <p className="text-sm text-slate-500">ไม่มีปัญหา</p>}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

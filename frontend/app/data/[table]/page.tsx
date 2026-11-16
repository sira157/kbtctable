"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DataTable, ErrorBox } from "@/components/ui";
import { api, TABLE_LABELS, type TableData } from "@/lib/api";

const LIMIT = 50;

export default function DataPage() {
  const { table } = useParams<{ table: string }>();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TableData | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // debounce search input
  useEffect(() => {
    const id = setTimeout(() => { setQ(search); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT), search: q });
    api<TableData>(`/data/${table}?${params}`)
      .then((d) => { if (!cancelled) { setData(d); setErr(""); } })
      .catch((e) => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [table, page, q]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">ข้อมูลในฐานข้อมูล</h1>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {Object.entries(TABLE_LABELS).map(([key, label]) => (
          <Link
            key={key}
            href={`/data/${key}`}
            className={`rounded-md px-3 py-1.5 text-sm ${key === table ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหา…"
          className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <span className="text-sm text-slate-500">
          {loading ? "กำลังโหลด…" : data ? `ทั้งหมด ${data.total.toLocaleString()} แถว` : ""}
        </span>
      </div>

      {err && <ErrorBox message={err} />}
      {data && <DataTable columns={data.columns} rows={data.rows} />}

      {data && pages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40">
            ← ก่อนหน้า
          </button>
          <span className="tabular-nums">หน้า {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40">
            ถัดไป →
          </button>
        </div>
      )}
    </div>
  );
}

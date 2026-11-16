import type { RowIssue } from "@/lib/api";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

export function Stat({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "green" | "blue" | "amber" | "red" }) {
  const tones = {
    slate: "text-slate-800",
    green: "text-emerald-600",
    blue: "text-indigo-600",
    amber: "text-amber-600",
    red: "text-red-600",
  };
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value.toLocaleString()}</div>
    </div>
  );
}

export function DataTable({ columns, rows }: { columns: { key: string; label: string }[]; rows: Record<string, unknown>[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100 text-left text-slate-600">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-400">ไม่มีข้อมูล</td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-1.5">{r[c.key] == null ? <span className="text-slate-300">—</span> : String(r[c.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IssueList({ issues, max = 200 }: { issues: RowIssue[]; max?: number }) {
  if (!issues.length) return null;
  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-slate-100 text-left text-slate-600">
          <tr>
            <th className="px-3 py-2 font-medium">ระดับ</th>
            <th className="px-3 py-2 font-medium">ชีต</th>
            <th className="px-3 py-2 font-medium">แถว</th>
            <th className="px-3 py-2 font-medium">รายละเอียด</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {issues.slice(0, max).map((i, idx) => (
            <tr key={idx} className={i.level === "error" ? "bg-red-50/60" : "bg-amber-50/60"}>
              <td className="px-3 py-1.5">
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${i.level === "error" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {i.level === "error" ? "ผิดพลาด" : "คำเตือน"}
                </span>
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap">{i.sheet}</td>
              <td className="px-3 py-1.5 tabular-nums">{i.row || "—"}</td>
              <td className="px-3 py-1.5">{i.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {issues.length > max && (
        <div className="px-3 py-2 text-xs text-slate-500">…และอีก {issues.length - max} รายการ</div>
      )}
    </div>
  );
}

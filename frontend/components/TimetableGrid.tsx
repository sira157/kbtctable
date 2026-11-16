import { DAYS, type GridEntry, type ViewBy } from "@/lib/api";

const PERIODS = 10;

export function TimetableGrid({ entries, by }: { entries: GridEntry[]; by: ViewBy }) {
  const cell = new Map<string, GridEntry[]>();
  for (const e of entries) {
    const k = `${e.day}|${e.period}`;
    (cell.get(k) ?? cell.set(k, []).get(k)!).push(e);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white print:overflow-visible">
      <table className="w-full min-w-[960px] table-fixed border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100 text-slate-600">
            <th className="w-20 border border-slate-200 px-2 py-2 text-left font-medium">วัน / คาบ</th>
            {Array.from({ length: PERIODS }, (_, p) => (
              <th key={p} className="border border-slate-200 px-1 py-2 font-medium">
                {p + 1}
                {p >= 3 && p <= 5 && <span className="block text-[10px] font-normal text-slate-400">ช่วงพัก</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, d) => {
            const row: React.ReactNode[] = [];
            for (let p = 0; p < PERIODS; p++) {
              const items = cell.get(`${d}|${p}`) ?? [];
              if (by !== "building" && items.length === 1) {
                // merge consecutive periods of the same block into one cell
                const e = items[0]!;
                let span = 1;
                while (p + span < PERIODS) {
                  const n = cell.get(`${d}|${p + span}`);
                  if (n?.length === 1 && n[0]!.subjectCode === e.subjectCode && n[0]!.groupCode === e.groupCode && n[0]!.teacherName === e.teacherName && n[0]!.roomCode === e.roomCode) span++;
                  else break;
                }
                row.push(<SlotCell key={p} span={span} e={e} by={by} />);
                p += span - 1;
              } else if (items.length) {
                row.push(<MultiCell key={p} items={items} by={by} />);
              } else {
                row.push(<td key={p} className="border border-slate-200 bg-slate-50/50" />);
              }
            }
            return (
              <tr key={d}>
                <th className="border border-slate-200 bg-slate-50 px-2 py-2 text-left font-medium text-slate-700">{day}</th>
                {row}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SlotCell({ e, span, by }: { e: GridEntry; span: number; by: ViewBy }) {
  const pending = e.teacherId === null;
  const activity = (e.subjectName ?? "").startsWith("กิจกรรมองค์การวิชาชีพ");
  const tone = activity
    ? "bg-violet-50 border-l-violet-400"
    : pending ? "bg-amber-50 border-l-amber-400" : "bg-indigo-50 border-l-indigo-400";
  return (
    <td colSpan={span} className="border border-slate-200 p-0.5 align-top">
      <div className={`h-full rounded border-l-4 px-1.5 py-1 ${tone}`} title={`${e.subjectCode} ${e.subjectName ?? ""}\n${e.teacherName}\n${e.groupCode} ${e.groupName ?? ""}\n${e.building}`}>
        <div className="font-semibold text-slate-800">{e.subjectCode}</div>
        <div className="line-clamp-2 text-slate-600">{e.subjectName}</div>
        {by !== "group" && <div className="mt-0.5 truncate text-slate-500">👥 {e.groupName && e.groupName !== e.groupCode ? e.groupName : e.groupCode}</div>}
        {by !== "teacher" && (
          <div className={`mt-0.5 truncate ${pending ? "font-medium text-amber-700" : "text-slate-500"}`}>👤 {e.teacherName}</div>
        )}
        <div className="truncate text-slate-400">🏢 {e.building}{e.roomCode ? ` · ห้อง ${e.roomCode}` : ""}</div>
      </div>
    </td>
  );
}

function MultiCell({ items, by }: { items: GridEntry[]; by: ViewBy }) {
  const clash = by !== "building" && items.length > 1;
  return (
    <td className={`border border-slate-200 p-1 align-top ${clash ? "bg-red-100" : "bg-sky-50"}`}>
      <div className="font-semibold text-slate-700">{items.length} กลุ่ม</div>
      <div className="max-h-24 overflow-y-auto text-[10px] leading-tight text-slate-500" title={items.map((i) => `${i.groupCode} ${i.subjectCode}`).join("\n")}>
        {items.slice(0, 6).map((i) => <div key={i.groupCode + i.subjectCode} className="truncate">{i.groupCode} · {i.subjectCode}</div>)}
        {items.length > 6 && <div>+{items.length - 6}</div>}
      </div>
    </td>
  );
}

import Link from "next/link";
import { ErrorBox } from "@/components/ui";
import { api, FILE_TYPE_LABELS, type ImportLog, type RunListItem } from "@/lib/api";

export const dynamic = "force-dynamic";

interface ScreeningSummary {
  summary: { total: number; ready: number; notRegistered: number; invalid: number; pending: number; readyHours: number; registeredGroups: number };
}

const FILE_ORDER = ["class_groups", "subjects", "teachers", "buildings"];

export default async function Home() {
  let err = "";
  let logs: ImportLog[] = [];
  let screening: ScreeningSummary | null = null;
  let runs: RunListItem[] = [];
  try {
    [logs, screening, runs] = await Promise.all([
      api<ImportLog[]>("/imports"),
      api<ScreeningSummary>("/screening/summary"),
      api<RunListItem[]>("/schedule/runs"),
    ]);
  } catch (e) {
    err = (e as Error).message;
  }

  const lastImport = new Map<string, ImportLog>();
  for (const l of logs) if (!lastImport.has(l.fileType)) lastImport.set(l.fileType, l);
  const importedCount = FILE_ORDER.filter((t) => lastImport.has(t)).length;
  const s = screening?.summary;
  const needsFix = s ? s.invalid + s.pending : 0;
  const latestRun = runs[0];

  // what should the user do next?
  const next =
    importedCount < 4 ? 1
    : !latestRun || needsFix > 0 ? 2
    : 3;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">ระบบจัดตารางสอนอัตโนมัติ</h1>
        <p className="text-sm text-slate-500">ทำตาม 3 ขั้นตอน: นำเข้าไฟล์ Excel → คัดกรองข้อมูล → ดูตารางสอน</p>
      </div>

      {err && <ErrorBox message={err} />}

      <div className="grid gap-4 md:grid-cols-3">
        <StepCard n={1} title="นำเข้าไฟล์" current={next === 1} done={importedCount === 4}
          href="/import" action={importedCount === 4 ? "นำเข้าใหม่ / อัปเดต" : "นำเข้าไฟล์"}>
          <ul className="space-y-1 text-sm">
            {FILE_ORDER.map((t) => {
              const l = lastImport.get(t);
              return (
                <li key={t} className="flex items-center gap-2">
                  <span className={l ? "text-emerald-600" : "text-slate-300"}>{l ? "✔" : "○"}</span>
                  <span className={l ? "" : "text-slate-400"}>{FILE_TYPE_LABELS[t]}</span>
                  {l && <span className="ml-auto text-xs text-slate-400">{new Date(l.createdAt).toLocaleDateString("th-TH")}</span>}
                </li>
              );
            })}
          </ul>
        </StepCard>

        <StepCard n={2} title="คัดกรองข้อมูล" current={next === 2} done={!!s && needsFix === 0 && s.ready > 0}
          href="/screening" action={latestRun ? "คัดกรอง + จัดตารางใหม่" : "ตรวจผล + เริ่มจัดตาราง"}>
          {s ? (
            <div className="space-y-1 text-sm">
              <Row dot="bg-emerald-500" label="พร้อมจัดตาราง" value={s.ready} extra={`${s.readyHours.toLocaleString()} คาบ`} />
              <Row dot="bg-slate-400" label="ไม่มีการลงทะเบียน" value={s.notRegistered} />
              <Row dot="bg-red-500" label="ข้อมูลผิดพลาด" value={s.invalid} warn={s.invalid > 0} />
              <Row dot="bg-amber-500" label="รอตรวจสอบ" value={s.pending} warn={s.pending > 0} />
              {needsFix > 0 && <p className="pt-1 text-xs text-amber-700">มี {needsFix} รายการที่ควรแก้หรือยืนยันก่อน</p>}
            </div>
          ) : <p className="text-sm text-slate-400">ยังไม่มีข้อมูล</p>}
        </StepCard>

        <StepCard n={3} title="ตารางสอน" current={next === 3} done={!!latestRun && latestRun.totalViolations === 0}
          href="/schedule" action="ดูตารางสอน">
          {latestRun ? (
            <div className="space-y-1 text-sm">
              <div>จัดล่าสุด {new Date(latestRun.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</div>
              <div className={latestRun.totalViolations === 0 ? "text-emerald-700" : "text-red-700"}>
                {latestRun.totalViolations === 0 ? "✅ ไม่ชนคาบ / ไม่ชนห้อง" : `❌ ผิดเงื่อนไข ${latestRun.totalViolations}`}
              </div>
              <div className="text-slate-500">{latestRun.totalPeriods?.toLocaleString()} คาบ · มีอาจารย์ {latestRun.assignedPct}%</div>
            </div>
          ) : <p className="text-sm text-slate-400">ยังไม่ได้จัดตาราง</p>}
        </StepCard>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/manage/class_groups" className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50">✏️ แก้ไข/เพิ่มข้อมูลเอง</Link>
        <Link href="/availability" className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50">🕑 ตั้งเวลาไม่ว่างของอาจารย์</Link>
        <Link href="/history" className="rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50">🗂 ประวัติการนำเข้า</Link>
      </div>
    </div>
  );
}

function StepCard({ n, title, current, done, href, action, children }: {
  n: number; title: string; current: boolean; done: boolean; href: string; action: string; children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col rounded-xl border bg-white p-5 shadow-sm ${current ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200"}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${done ? "bg-emerald-500 text-white" : current ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"}`}>
          {done ? "✓" : n}
        </span>
        <h2 className="font-semibold">{title}</h2>
        {current && <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">ขั้นตอนถัดไป</span>}
      </div>
      <div className="flex-1">{children}</div>
      <Link href={href}
        className={`mt-4 rounded-lg px-4 py-2 text-center text-sm font-medium ${current ? "bg-indigo-600 text-white hover:bg-indigo-700" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
        {action} →
      </Link>
    </div>
  );
}

function Row({ dot, label, value, extra, warn }: { dot: string; label: string; value: number; extra?: string; warn?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      <span>{label}</span>
      <span className={`ml-auto tabular-nums ${warn ? "font-semibold text-amber-700" : ""}`}>{value.toLocaleString()}</span>
      {extra && <span className="w-20 text-right text-xs text-slate-400">{extra}</span>}
    </div>
  );
}

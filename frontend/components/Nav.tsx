"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** main workflow, in order */
const STEPS = [
  { href: "/import", label: "นำเข้าไฟล์", n: 1 },
  { href: "/screening", label: "คัดกรองข้อมูล", n: 2 },
  { href: "/schedule", label: "ตารางสอน", n: 3 },
];
/** tools used occasionally */
const TOOLS = [
  { href: "/manage/class_groups", match: "/manage", label: "จัดการข้อมูล" },
  { href: "/availability", match: "/availability", label: "เวลาไม่ว่าง" },
  { href: "/history", match: "/history", label: "ประวัติ" },
];

export function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  const active = (p: string) => path === p || path.startsWith(p + "/");
  return (
    <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <Link href="/" className={`mr-2 font-semibold ${path === "/" ? "text-indigo-700" : "text-slate-800 hover:text-indigo-700"}`}>
        📅 ระบบจัดตารางสอน
      </Link>

      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {STEPS.map((s, i) => (
          <li key={s.href} className="flex items-center gap-1">
            <Link href={s.href}
              className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 transition ${active(s.href) ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${active(s.href) ? "bg-white text-indigo-700" : "bg-slate-200 text-slate-600"}`}>
                {s.n}
              </span>
              {s.label}
            </Link>
            {i < STEPS.length - 1 && <span className="text-slate-300">›</span>}
          </li>
        ))}
      </ol>

      <div className="ml-auto flex flex-wrap items-center gap-1 text-sm">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href}
            className={`rounded-md px-2.5 py-1.5 ${active(t.match) ? "bg-slate-200 font-medium text-slate-900" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>
            {t.label}
          </Link>
        ))}
        <a href="/auth/logout" className="rounded-md px-2.5 py-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="ออกจากระบบ">ออกจากระบบ</a>
      </div>
    </nav>
  );
}

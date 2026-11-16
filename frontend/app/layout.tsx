import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const thai = Noto_Sans_Thai({ subsets: ["thai", "latin"], variable: "--font-thai" });

export const metadata: Metadata = {
  title: "ระบบนำเข้าข้อมูลตารางเรียน",
  description: "นำเข้าไฟล์ Excel (.xlsx) เข้าสู่ฐานข้อมูล MySQL",
};

const nav = [
  { href: "/", label: "หน้าหลัก" },
  { href: "/import", label: "นำเข้าไฟล์" },
  { href: "/data/class_groups", label: "ข้อมูล" },
  { href: "/manage/class_groups", label: "จัดการข้อมูล" },
  { href: "/availability", label: "เวลาไม่ว่าง" },
  { href: "/schedule", label: "ตารางสอน" },
  { href: "/history", label: "ประวัติการนำเข้า" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={thai.variable}>
      <body className="min-h-screen font-sans">
        <header className="border-b border-slate-200 bg-white print:hidden">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-3">
            <span className="mr-4 font-semibold text-indigo-700">📅 Timetable Import</span>
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

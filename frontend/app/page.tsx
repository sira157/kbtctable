import Link from "next/link";
import { Card, ErrorBox } from "@/components/ui";
import { api, TABLE_LABELS } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Home() {
  let stats: Record<string, number> | null = null;
  let err = "";
  try {
    stats = await api<Record<string, number>>("/data/stats");
  } catch (e) {
    err = (e as Error).message;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">ภาพรวมข้อมูล</h1>
          <p className="text-sm text-slate-500">จำนวนข้อมูลในแต่ละตารางของฐานข้อมูล</p>
        </div>
        <Link href="/import" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          + นำเข้าไฟล์ Excel
        </Link>
      </div>

      {err && <ErrorBox message={err} />}

      {stats && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Object.entries(TABLE_LABELS).map(([key, label]) => (
            <Link key={key} href={`/data/${key}`}>
              <Card className="transition hover:border-indigo-300 hover:shadow">
                <div className="text-sm text-slate-500">{label}</div>
                <div className="mt-1 text-3xl font-semibold tabular-nums">{(stats[key] ?? 0).toLocaleString()}</div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <h2 className="mb-2 font-medium">ลำดับการนำเข้าที่แนะนำ</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>กลุ่มเรียนและชื่อกลุ่มเรียน</li>
          <li>รหัสและชื่อวิชาและจำนวนคาบเรียน (กลุ่มเรียนที่ยังไม่มีจะถูกสร้างให้อัตโนมัติ โดยใช้รหัสเป็นชื่อ)</li>
          <li>ชื่ออาจารย์ผู้สอน กับ รายวิชาที่เขาต้องสอน</li>
          <li>อาคารเรียน และ ห้องเรียน</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">นำเข้าไฟล์เดิมซ้ำได้ ระบบจะอัปเดตข้อมูลที่มีอยู่แล้ว (upsert) ไม่สร้างข้อมูลซ้ำ</p>
      </Card>
    </div>
  );
}

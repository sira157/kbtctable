import type { SpecialRule } from "./types";

/** วิชาสามัญ (หมวดสมรรถนะแกนกลาง): รหัส 20000-1xxx, 20001-1xxx, 30000-1xxx ฯลฯ → อาคารสามัญศึกษา
 *  (เลขท้าย 1xxx เท่านั้น; 2xxx เป็นกิจกรรม/ฝึกงาน ไม่นับ) */
export function isGeneralSubject(code: string): boolean {
  const m = /^([23]000\d)\s*[-*]\s*(\d{4})$/.exec(code.trim());
  return !!m && Number(m[2]) < 2000;
}

/** กิจกรรมองค์การวิชาชีพ (ทุกระดับ 1–4) → คาบสุดท้ายของวันพฤหัสบดี */
export function specialRule(name: string): SpecialRule {
  const n = name.replace(/\s+/g, " ").trim();
  return n.startsWith("กิจกรรมองค์การวิชาชีพ") ? "org_activity_thu" : null;
}

export function isProject(name: string): boolean {
  return /โครงงาน|โปรเจ|project/i.test(name);
}

// ---------- แผนก ↔ อาคาร ----------

export const GENERAL_DEPT = "สามัญ";
const FALLBACK_BUILDING = "อาคารเรียนรวม";

/** ประเภทวิชา = หลักที่ 4–5 ของรหัสกลุ่ม (ปี-ระดับ-ประเภทวิชา-สาขา-ห้อง) */
const TYPE_DEPT: Record<string, string> = {
  "01": "อุตสาหกรรม",
  "02": "บริหารธุรกิจ",
  "04": "คหกรรม",
  "07": "ท่องเที่ยวและโรงแรม",
  "09": "เทคโนโลยีสารสนเทศ",
  "15": "คหกรรม",
  "19": "เทคโนโลยีสารสนเทศ",
  "21": "เทคโนโลยีสารสนเทศ",
};
const MAJOR_DEPT: [RegExp, string][] = [
  [/ช่าง|อิเล็กทรอนิกส์|เทคนิค|ก่อสร้าง|ต่อเรือ|ยานยนต์/, "อุตสาหกรรม"],
  [/บัญชี|การตลาด|เลขานุการ|สำนักงาน|คอมพิวเตอร์ธุรกิจ/, "บริหารธุรกิจ"],
  [/เทคโนโลยีสารสนเทศ|ดิจิทัล/, "เทคโนโลยีสารสนเทศ"],
  [/อาหาร|โภชนาการ|ผ้า|คหกรรม/, "คหกรรม"],
  [/โรงแรม|ท่องเที่ยว/, "ท่องเที่ยวและโรงแรม"],
];

/** แผนกของกลุ่มเรียน จากรหัสกลุ่ม (หรือชื่อสาขาถ้ารหัสไม่ใช่ตัวเลข 9 หลัก) */
export function groupDepartment(groupCode: string, major: string | null): string | null {
  if (/^\d{9}$/.test(groupCode)) {
    const d = TYPE_DEPT[groupCode.slice(3, 5)];
    if (d) return d;
  }
  return (major && MAJOR_DEPT.find(([re]) => re.test(major))?.[1]) || null;
}

/** แผนกของ "กลุ่ม × วิชา": วิชาสามัญ → แผนกสามัญ, อื่น ๆ → แผนกของกลุ่ม */
export function demandDepartment(groupCode: string, major: string | null, subjectCode: string): string | null {
  return isGeneralSubject(subjectCode) ? GENERAL_DEPT : groupDepartment(groupCode, major);
}

const strip = (s: string) => s.replace(/^อาคาร\s*/, "").trim();

/** อาคารของแผนก: ชื่ออาคารที่ตรงกับแผนก เช่น อุตสาหกรรม → อาคารอุตสาหกรรม, เทคโนโลยีสารสนเทศ → อาคารเทคโนโลยี */
export function departmentBuilding(dept: string | null, buildings: string[]): { building: string; own: boolean } {
  if (dept) {
    const hit = buildings
      .map((b) => ({ b, s: strip(b) }))
      .filter(({ s }) => s && (s === dept || dept.startsWith(s) || s.startsWith(dept)))
      .sort((a, b) => b.s.length - a.s.length)[0];
    if (hit) return { building: hit.b, own: true };
  }
  return { building: pickBuilding(FALLBACK_BUILDING, buildings), own: false };
}

export function pickBuilding(want: string, buildings: string[]): string {
  if (!buildings.length) return want;
  if (buildings.includes(want)) return want;
  if (buildings.includes(FALLBACK_BUILDING)) return FALLBACK_BUILDING;
  return buildings[0]!;
}

/** kept for callers that only need the group's own building */
export function groupBuilding(groupCode: string, major: string | null, buildings: string[]): string {
  return departmentBuilding(groupDepartment(groupCode, major), buildings).building;
}

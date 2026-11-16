/**
 * Downloadable templates: the 4 import files with consistent sample data (or headers only).
 * Codes, subject names and teachers line up across the 4 files, so a set can be imported and scheduled as-is.
 */
import * as XLSX from "xlsx";

export const TEMPLATE_TYPES = ["class_groups", "subjects", "teachers", "buildings"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];
export const TEMPLATE_SIZES = ["blank", "small", "medium", "large"] as const;
export type TemplateSize = (typeof TEMPLATE_SIZES)[number];
export const TEMPLATE_FORMATS = ["xlsx", "csv", "json"] as const;
export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number];

export const TYPE_FILE_NAMES: Record<TemplateType, string> = {
  class_groups: "กลุ่มเรียน",
  subjects: "รหัสและชื่อวิชา",
  teachers: "อาจารย์ผู้สอน",
  buildings: "อาคารเรียน",
};
export const SIZE_LABELS: Record<TemplateSize, string> = { blank: "เปล่า", small: "เล็ก", medium: "กลาง", large: "ใหญ่" };
const GROUP_COUNT: Record<TemplateSize, number> = { blank: 0, small: 3, medium: 10, large: 45 };

const MAJORS = [
  { type: "01", major: "01", name: "ช่างยนต์", prefix: "20101", dept: "อุตสาหกรรม", subjects: ["งานเครื่องยนต์เล็ก", "งานส่งกำลังรถยนต์", "งานไฟฟ้ารถยนต์", "งานเครื่องยนต์ดีเซล"] },
  { type: "02", major: "01", name: "การบัญชี", prefix: "20201", dept: "บริหารธุรกิจ", subjects: ["การบัญชีเบื้องต้น", "การบัญชีห้างหุ้นส่วน", "โปรแกรมสำเร็จรูปทางการบัญชี", "การบัญชีต้นทุน"] },
  { type: "01", major: "04", name: "ช่างไฟฟ้ากำลัง", prefix: "20104", dept: "อุตสาหกรรม", subjects: ["เครื่องวัดไฟฟ้า", "การติดตั้งไฟฟ้าในอาคาร", "เครื่องกลไฟฟ้า", "ระบบควบคุมไฟฟ้า"] },
  { type: "19", major: "01", name: "เทคโนโลยีสารสนเทศ", prefix: "21901", dept: "เทคโนโลยีสารสนเทศ", subjects: ["การเขียนโปรแกรมเบื้องต้น", "ระบบฐานข้อมูล", "เครือข่ายคอมพิวเตอร์", "การออกแบบเว็บไซต์"] },
  { type: "07", major: "01", name: "การโรงแรม", prefix: "20701", dept: "ท่องเที่ยวและโรงแรม", subjects: ["งานบริการส่วนหน้า", "งานแม่บ้านโรงแรม", "งานบริการอาหารและเครื่องดื่ม", "ภาษาอังกฤษในงานโรงแรม"] },
];
const MAJOR_HOURS = [4, 4, 3, 3];
const GENERAL = [
  { code: "20000-1101", name: "ภาษาไทยพื้นฐาน", hours: 2 },
  { code: "20000-1201", name: "ภาษาอังกฤษในชีวิตจริง", hours: 2 },
  { code: "20000-1401", name: "คณิตศาสตร์พื้นฐานอาชีพ", hours: 2 },
  { code: "20000-1501", name: "หน้าที่พลเมืองและศีลธรรม", hours: 2 },
];
const ACTIVITY = { code: "20000-2001", name: "กิจกรรมองค์การวิชาชีพ 1", hours: 3 };
const FIRST = ["สมชาย", "สมหญิง", "วิชัย", "กมลวรรณ", "ณัฐพล", "ปรีชา", "สุนีย์", "อรทัย", "ธนพล", "จิราพร", "ประเสริฐ", "วราภรณ์", "อนุชา", "พิมพ์ชนก", "สุรเชษฐ์", "กัญญา", "ศักดิ์ชัย", "นภาพร", "ธีรวัฒน์", "รัตนา"];
const LAST = ["ใจดี", "แก้วใส", "พงษ์ศรี", "สุขใจ", "วัฒนะ", "มณีรัตน์", "ศรีสวัสดิ์", "ทองดี", "บุญมา", "แสงทอง"];
const BUILDINGS: Record<string, string> = {
  "อุตสาหกรรม": "อาคารอุตสาหกรรม", "บริหารธุรกิจ": "อาคารบริหารธุรกิจ", "เทคโนโลยีสารสนเทศ": "อาคารเทคโนโลยี",
  "ท่องเที่ยวและโรงแรม": "อาคารเรียนรวม", "สามัญ": "อาคารสามัญศึกษา",
};
const TEACHER_LOAD = 20; // periods per teacher per major subject pool (keeps teachers well under 35/week)
const GENERAL_LOAD = 12; // general subjects: every group takes them, so leave room for timeslot clashes

export interface TemplateData {
  groups: Record<string, unknown>[];
  subjects: Record<string, unknown>[];
  teacherList: Record<string, unknown>[];
  teaching: Record<string, unknown>[];
  buildings: Record<string, unknown>[];
}

export const HEADERS = {
  groups: ["รหัสกลุ่มเรียน", "ชื่อกลุ่มเรียน", "สาขาวิชา", "จำนวนนักศึกษา"],
  subjects: ["รหัสวิชาเรียน", "ชื่อวิชา", "รหัสกลุ่มเรียน", "คาบเรียนต่อสัปดาห์"],
  teacherList: ["teacher_name", "rank", "department"],
  teaching: ["รหัสวิชา", "ชื่อวิชา", "ชื่ออาจารย์", "หน้าที่"],
  teachersCombined: ["รหัสวิชา", "ชื่อวิชา", "ชื่ออาจารย์", "หน้าที่", "ตำแหน่ง", "แผนก"],
  buildings: ["building_name", "ห้องเรียน", "ความจุ", "ประเภทห้อง"],
};

export function sampleData(size: TemplateSize): TemplateData {
  const n = GROUP_COUNT[size];
  const groups: TemplateData["groups"] = [];
  const subjects: TemplateData["subjects"] = [];
  // spread groups over majors and years (66, 67, 68)
  const perMajor = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const mi = i % MAJORS.length;
    const k = perMajor.get(mi) ?? 0;
    perMajor.set(mi, k + 1);
    const m = MAJORS[mi]!;
    const year = 66 + (k % 3);
    const room = Math.floor(k / 3) + 1;
    const code = `${year}2${m.type}${m.major}${String(room).padStart(2, "0")}`;
    groups.push({ รหัสกลุ่มเรียน: code, ชื่อกลุ่มเรียน: `ปวช.${year} ${m.name} ${room}`, สาขาวิชา: m.name, จำนวนนักศึกษา: 30 + ((i * 7) % 11) });
    for (const g of GENERAL) subjects.push({ รหัสวิชาเรียน: g.code, ชื่อวิชา: g.name, รหัสกลุ่มเรียน: code, คาบเรียนต่อสัปดาห์: g.hours });
    m.subjects.forEach((s, j) => subjects.push({
      รหัสวิชาเรียน: `${m.prefix}-${2001 + j}`, ชื่อวิชา: s, รหัสกลุ่มเรียน: code, คาบเรียนต่อสัปดาห์: MAJOR_HOURS[j],
    }));
    subjects.push({ รหัสวิชาเรียน: ACTIVITY.code, ชื่อวิชา: ACTIVITY.name, รหัสกลุ่มเรียน: code, คาบเรียนต่อสัปดาห์: ACTIVITY.hours });
  }

  // teachers: enough per subject code so every registration has a main teacher with spare time
  const hoursByCode = new Map<string, { name: string; hours: number; dept: string }>();
  for (const s of subjects) {
    const c = String(s.รหัสวิชาเรียน);
    const dept = c.startsWith("20000-1") ? "สามัญ" : c === ACTIVITY.code ? "กิจกรรม" : MAJORS.find((m) => c.startsWith(m.prefix))!.dept;
    const cur = hoursByCode.get(c) ?? { name: String(s.ชื่อวิชา), hours: 0, dept };
    cur.hours += Number(s.คาบเรียนต่อสัปดาห์);
    hoursByCode.set(c, cur);
  }
  const teacherList: TemplateData["teacherList"] = [];
  const teaching: TemplateData["teaching"] = [];
  let t = 0;
  const newTeacher = (dept: string) => {
    const name = `อาจารย์${FIRST[t % FIRST.length]} ${LAST[Math.floor(t / FIRST.length) % LAST.length]}${t >= FIRST.length * LAST.length ? ` ${t}` : ""}`;
    teacherList.push({ teacher_name: name, rank: t % 4 === 0 ? "อาจารย์ชำนาญการ" : "อาจารย์", department: dept === "กิจกรรม" ? "สามัญ" : dept });
    t++;
    return name;
  };
  for (const [code, info] of hoursByCode) {
    if (code === ACTIVITY.code) continue; // advisors are assigned below
    // general subjects are taught to every group → more teachers so their timeslots don't collide
    const load = code.startsWith("20000-1") ? GENERAL_LOAD : TEACHER_LOAD;
    const need = Math.max(1, Math.ceil(info.hours / load));
    const names = Array.from({ length: need }, () => newTeacher(info.dept));
    for (const name of names) teaching.push({ รหัสวิชา: code, ชื่อวิชา: info.name, ชื่ออาจารย์: name, หน้าที่: "ผู้สอนหลัก" });
    // a co-teacher on major subjects (shows the ผู้สอนร่วม role)
    // (the teacher created just before this subject's own teachers)
    const co = teacherList[teacherList.length - names.length - 1]?.teacher_name as string | undefined;
    if (!code.startsWith("20000") && co) {
      teaching.push({ รหัสวิชา: code, ชื่อวิชา: info.name, ชื่ออาจารย์: co, หน้าที่: "ผู้สอนร่วม" });
    }
  }

  // กิจกรรมองค์การวิชาชีพ runs for every group at the same time (Thursday last periods)
  // → one advisor per group; reuse existing teachers first, add more if needed
  for (let i = 0; i < n; i++) {
    const name = (teacherList[i]?.teacher_name as string | undefined) ?? newTeacher("สามัญ");
    teaching.push({ รหัสวิชา: ACTIVITY.code, ชื่อวิชา: ACTIVITY.name, ชื่ออาจารย์: name, หน้าที่: "ผู้สอนหลัก" });
  }

  // buildings + rooms (enough lecture rooms for the busiest hour)
  const buildingHours = new Map<string, number>();
  for (const s of subjects) {
    const c = String(s.รหัสวิชาเรียน);
    if (c === ACTIVITY.code) continue; // activities are building-level
    const dept = c.startsWith("20000-1") ? "สามัญ" : MAJORS.find((m) => c.startsWith(m.prefix))!.dept;
    const b = BUILDINGS[dept]!;
    buildingHours.set(b, (buildingHours.get(b) ?? 0) + Number(s.คาบเรียนต่อสัปดาห์));
  }
  const buildings: TemplateData["buildings"] = [];
  for (const b of new Set(Object.values(BUILDINGS))) {
    const hours = buildingHours.get(b) ?? 0;
    if (!n) continue;
    const rooms = Math.max(1, Math.ceil(hours / 25) + 1);
    const floor = b === "อาคารสามัญศึกษา" ? 1 : b === "อาคารอุตสาหกรรม" ? 2 : b === "อาคารบริหารธุรกิจ" ? 3 : b === "อาคารเทคโนโลยี" ? 4 : 5;
    for (let r = 1; r <= rooms; r++) {
      buildings.push({ building_name: b, ห้องเรียน: `${floor}${String(r).padStart(2, "0")}`, ความจุ: 45, ประเภทห้อง: "บรรยาย" });
    }
  }
  return { groups, subjects, teacherList, teaching, buildings };
}

const sheet = (header: string[], rows: Record<string, unknown>[]) =>
  XLSX.utils.json_to_sheet(rows, { header }) as XLSX.WorkSheet;

function withWidths(ws: XLSX.WorkSheet, header: string[]) {
  ws["!cols"] = header.map((h) => ({ wch: Math.max(14, h.length + 4) }));
  return ws;
}

/** Build one template file. Returns bytes + suggested file name + content type. */
export function buildTemplate(type: TemplateType, size: TemplateSize, format: TemplateFormat) {
  const d = sampleData(size);
  const fileName = `แม่แบบ-${TYPE_FILE_NAMES[type]}-${SIZE_LABELS[size]}.${format}`;

  // logical tables for this file type
  const tables: { name: string; header: string[]; rows: Record<string, unknown>[] }[] =
    type === "class_groups" ? [{ name: "กลุ่มเรียน", header: HEADERS.groups, rows: d.groups }]
    : type === "subjects" ? [{ name: "กลุ่มวิชา", header: HEADERS.subjects, rows: d.subjects }]
    : type === "buildings" ? [{ name: "อาคารเรียน", header: HEADERS.buildings, rows: d.buildings }]
    : format === "xlsx"
      ? [
        { name: "อาจารย์", header: HEADERS.teacherList, rows: d.teacherList },
        { name: "วิชาและอาจารย์ผู้สอน", header: HEADERS.teaching, rows: d.teaching },
      ]
      // CSV / JSON: one combined table (the importer splits it into teacher list + teaching rows)
      : [{
        name: "อาจารย์ผู้สอน", header: HEADERS.teachersCombined,
        rows: d.teaching.map((r) => {
          const t = d.teacherList.find((x) => x.teacher_name === r.ชื่ออาจารย์)!;
          return { ...r, ตำแหน่ง: t.rank, แผนก: t.department };
        }),
      }];

  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    for (const t of tables) XLSX.utils.book_append_sheet(wb, withWidths(sheet(t.header, t.rows), t.header), t.name);
    const bytes = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return { bytes: new Uint8Array(bytes), fileName, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }
  const t = tables[0]!;
  if (format === "csv") {
    // UTF-8 BOM so Excel opens Thai correctly
    const csv = "﻿" + XLSX.utils.sheet_to_csv(sheet(t.header, t.rows), { RS: "\r\n" });
    return { bytes: new TextEncoder().encode(csv), fileName, contentType: "text/csv; charset=utf-8" };
  }
  // JSON: array of rows (blank template → one example row with empty values so the keys are visible)
  const rows = t.rows.length ? t.rows : [Object.fromEntries(t.header.map((h) => [h, ""]))];
  return { bytes: new TextEncoder().encode(JSON.stringify(rows, null, 2)), fileName, contentType: "application/json; charset=utf-8" };
}

export function templateInfo() {
  return TEMPLATE_SIZES.map((size) => {
    const d = sampleData(size);
    return {
      size, label: SIZE_LABELS[size],
      groups: d.groups.length, registrations: d.subjects.length,
      hours: d.subjects.reduce((n, s) => n + Number(s.คาบเรียนต่อสัปดาห์), 0),
      teachers: d.teacherList.length, rooms: d.buildings.length,
    };
  });
}

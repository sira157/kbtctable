import { Elysia, t } from "elysia";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { pool } from "../db/client";
import { ROOM_TYPES, TEACHER_ROLES } from "../db/schema";
import { code as normCode, text as normText } from "../import/normalize";

// ---------- entity definitions (single source for validation, SQL and the frontend form) ----------

type Kind = "code" | "text" | "int" | "enum" | "ref" | "bool";
interface Field {
  key: string;
  label: string;
  kind: Kind;
  required?: boolean;
  min?: number;
  max?: number;
  options?: readonly string[];
  ref?: EntityKey;
  help?: string;
  /** value stored when left blank (default null) */
  emptyValue?: string;
}
interface Entity {
  label: string;
  table: string;
  pk: string;
  autoId: boolean;
  fields: Field[];
  /** SELECT … FROM <table> m … (main table aliased m) */
  list: string;
  search: string[];
  order: string;
  /** what gets deleted along with a row (shown in the confirm dialog) */
  cascade?: string;
  /** label for <select> options */
  optionLabel: string;
}

type EntityKey = "class_groups" | "subjects" | "group_subjects" | "teachers" | "teacher_subjects" | "buildings" | "rooms";

export const ENTITIES: Record<EntityKey, Entity> = {
  class_groups: {
    label: "กลุ่มเรียน", table: "class_groups", pk: "code", autoId: false,
    fields: [
      { key: "code", label: "รหัสกลุ่มเรียน", kind: "code", required: true, help: "เลข 9 หลัก ปี-ระดับ-ประเภท-สาขา-ห้อง เช่น 662010101" },
      { key: "name", label: "ชื่อกลุ่มเรียน", kind: "text", required: true },
      { key: "major", label: "สาขาวิชา", kind: "text" },
      { key: "students", label: "จำนวนนักศึกษา", kind: "int", min: 1, max: 300, help: "ว่าง = 30 คน" },
      { key: "registered", label: "อยู่ในทะเบียนกลุ่มเรียน", kind: "bool", help: "ไม่ติ๊ก = รายวิชาของกลุ่มนี้มีสถานะ \"ไม่มีการลงทะเบียน\" และไม่ถูกจัดตาราง" },
    ],
    list: "SELECT m.code, m.name, m.major, m.students, m.registered, IF(m.registered = 1, '✓ อยู่ในทะเบียน', '— ไม่อยู่') AS registered_label, (SELECT COUNT(*) FROM group_subjects g WHERE g.group_code = m.code) AS subject_count, (SELECT COALESCE(SUM(g.periods_per_week),0) FROM group_subjects g WHERE g.group_code = m.code) AS hours FROM class_groups m",
    search: ["m.code", "m.name", "m.major"], order: "m.code",
    cascade: "รายวิชาของกลุ่มนี้ทั้งหมด", optionLabel: "CONCAT(m.code, ' ', m.name)",
  },
  subjects: {
    label: "รายวิชา", table: "subjects", pk: "code", autoId: false,
    fields: [
      { key: "code", label: "รหัสวิชา", kind: "code", required: true, help: "เช่น 20101-2001 (วิชาสามัญ 20000/30000-1xxx เรียนอาคารสามัญศึกษา)" },
      { key: "name", label: "ชื่อวิชา", kind: "text", required: true, help: "ขึ้นต้น \"กิจกรรมองค์การวิชาชีพ\" = จัดคาบสุดท้ายวันพฤหัสบดี" },
      { key: "room_type", label: "ประเภทห้องที่ต้องใช้", kind: "enum", options: ROOM_TYPES, help: "ว่าง = ห้องใดก็ได้" },
    ],
    list: "SELECT m.code, m.name, m.room_type, (SELECT COUNT(*) FROM group_subjects g WHERE g.subject_code = m.code) AS group_count, (SELECT COUNT(*) FROM teacher_subjects x WHERE x.subject_code = m.code) AS teacher_count FROM subjects m",
    search: ["m.code", "m.name"], order: "m.code",
    cascade: "การลงทะเบียนวิชานี้ของทุกกลุ่ม และรายชื่อผู้สอนวิชานี้", optionLabel: "CONCAT(m.code, ' ', m.name)",
  },
  group_subjects: {
    label: "วิชาของกลุ่มเรียน", table: "group_subjects", pk: "id", autoId: true,
    fields: [
      { key: "group_code", label: "กลุ่มเรียน", kind: "ref", ref: "class_groups", required: true },
      { key: "subject_code", label: "รายวิชา", kind: "ref", ref: "subjects", required: true },
      { key: "subject_name", label: "ชื่อวิชา (ตามที่กลุ่มลงทะเบียน)", kind: "text", emptyValue: "", help: "ว่าง = ใช้ชื่อในตารางรายวิชา · ใช้จับคู่ผู้สอนที่สอนรหัส+ชื่อวิชานี้" },
      { key: "periods_per_week", label: "คาบเรียนต่อสัปดาห์", kind: "int", required: true, min: 1, max: 40 },
    ],
    list: "SELECT m.id, m.group_code, cg.name AS group_name, m.subject_code, m.subject_name, COALESCE(NULLIF(m.subject_name, ''), s.name) AS subject_display, m.periods_per_week FROM group_subjects m JOIN class_groups cg ON cg.code = m.group_code JOIN subjects s ON s.code = m.subject_code",
    search: ["m.group_code", "cg.name", "m.subject_code", "m.subject_name", "s.name"], order: "m.group_code, m.subject_code",
    optionLabel: "CONCAT(m.group_code, ' ', m.subject_code)",
  },
  teachers: {
    label: "อาจารย์", table: "teachers", pk: "id", autoId: true,
    fields: [
      { key: "name", label: "ชื่ออาจารย์", kind: "text", required: true },
      { key: "rank", label: "ตำแหน่ง", kind: "text" },
      { key: "department", label: "แผนก", kind: "text" },
    ],
    list: "SELECT m.id, m.name, m.`rank`, m.department, (SELECT COUNT(*) FROM teacher_subjects x WHERE x.teacher_id = m.id) AS subject_count, (SELECT COUNT(*) FROM teacher_unavailability u WHERE u.teacher_id = m.id) AS unavailable_count FROM teachers m",
    search: ["m.name", "m.`rank`", "m.department"], order: "m.name",
    cascade: "รายวิชาที่สอนและช่วงเวลาไม่ว่างของอาจารย์คนนี้", optionLabel: "m.name",
  },
  teacher_subjects: {
    label: "อาจารย์–รายวิชาที่สอน", table: "teacher_subjects", pk: "id", autoId: true,
    fields: [
      { key: "teacher_id", label: "อาจารย์", kind: "ref", ref: "teachers", required: true },
      { key: "subject_code", label: "รายวิชา", kind: "ref", ref: "subjects", required: true },
      { key: "subject_name", label: "ชื่อวิชา (ตามไฟล์อาจารย์)", kind: "text", emptyValue: "", help: "ว่าง = สอนได้ทุกกลุ่มที่ลงรหัสนี้ · ระบุ = สอนเฉพาะกลุ่มที่ลงชื่อวิชานี้" },
      { key: "role", label: "หน้าที่", kind: "enum", options: TEACHER_ROLES, required: true },
    ],
    list: "SELECT m.id, m.teacher_id, t.name AS teacher_name, m.subject_code, m.subject_name, COALESCE(NULLIF(m.subject_name, ''), s.name) AS subject_display, m.role FROM teacher_subjects m JOIN teachers t ON t.id = m.teacher_id JOIN subjects s ON s.code = m.subject_code",
    search: ["t.name", "m.subject_code", "m.subject_name", "s.name", "m.role"], order: "t.name, m.subject_code",
    optionLabel: "CONCAT(m.teacher_id, ' ', m.subject_code)",
  },
  buildings: {
    label: "อาคาร", table: "buildings", pk: "id", autoId: true,
    fields: [
      { key: "name", label: "ชื่ออาคาร", kind: "text", required: true, help: "ระบบใช้ชื่อ: อาคารอุตสาหกรรม / อาคารบริหารธุรกิจ / อาคารเทคโนโลยี / อาคารสามัญศึกษา / อาคารเรียนรวม" },
    ],
    list: "SELECT m.id, m.name, (SELECT COUNT(*) FROM rooms r WHERE r.building_id = m.id) AS room_count FROM buildings m",
    search: ["m.name"], order: "m.name",
    cascade: "ห้องทั้งหมดในอาคารนี้", optionLabel: "m.name",
  },
  rooms: {
    label: "ห้องเรียน", table: "rooms", pk: "id", autoId: true,
    fields: [
      { key: "building_id", label: "อาคาร", kind: "ref", ref: "buildings", required: true },
      { key: "room_code", label: "รหัส/ชื่อห้อง", kind: "text", required: true },
      { key: "capacity", label: "ความจุ (คน)", kind: "int", min: 1, max: 1000, help: "ว่าง = ไม่จำกัด" },
      { key: "room_type", label: "ประเภทห้อง", kind: "enum", options: ROOM_TYPES, help: "ว่าง = ใช้ได้ทุกวิชา" },
    ],
    list: "SELECT m.id, m.building_id, b.name AS building_name, m.room_code, m.capacity, m.room_type FROM rooms m JOIN buildings b ON b.id = m.building_id",
    search: ["b.name", "m.room_code", "m.room_type"], order: "b.name, m.room_code",
    optionLabel: "m.room_code",
  },
};

export class ValidationError extends Error {
  constructor(message: string, public fieldErrors: Record<string, string> = {}) { super(message); }
}

const isKey = (k: string): k is EntityKey => k in ENTITIES;
const q = (id: string) => "`" + id.replace(/`/g, "") + "`";
const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

function getEntity(key: string): Entity {
  if (!isKey(key)) throw new ValidationError(`ไม่รู้จักข้อมูล "${key}"`);
  return ENTITIES[key];
}

/** normalise + validate a payload; partial=false requires all required fields */
async function clean(conn: PoolConnection, ent: Entity, body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const errs: Record<string, string> = {};
  for (const f of ent.fields) {
    const raw = body[f.key];
    let v: unknown;
    switch (f.kind) {
      case "code": v = normCode(raw); break;
      case "text": v = normText(raw); break;
      case "enum": v = normText(raw); break;
      case "bool": v = [true, 1, "1", "true", "on"].includes(raw as never) ? 1 : 0; break;
      case "int": {
        const s = normText(raw);
        if (s === "") { v = ""; break; }
        const n = Number(s);
        if (!Number.isInteger(n)) { errs[f.key] = "ต้องเป็นจำนวนเต็ม"; continue; }
        if (f.min != null && n < f.min) { errs[f.key] = `ต้องไม่น้อยกว่า ${f.min}`; continue; }
        if (f.max != null && n > f.max) { errs[f.key] = `ต้องไม่เกิน ${f.max}`; continue; }
        v = n;
        break;
      }
      case "ref": {
        const target = ENTITIES[f.ref!];
        const s = target.autoId ? normText(raw) : normCode(raw);
        v = s === "" ? "" : target.autoId ? Number(s) : s;
        if (v !== "") {
          const [rows] = await conn.query<RowDataPacket[]>(`SELECT 1 FROM ${q(target.table)} WHERE ${q(target.pk)} = ? LIMIT 1`, [v]);
          if (!rows.length) { errs[f.key] = `ไม่พบ${target.label}นี้`; continue; }
        }
        break;
      }
    }
    if (v === "") {
      if (f.required) { errs[f.key] = "ต้องกรอก"; continue; }
      out[f.key] = f.emptyValue ?? null;
      continue;
    }
    if (f.kind === "code" && /\s/.test(String(v))) { errs[f.key] = "ห้ามมีช่องว่าง"; continue; }
    if ((f.kind === "text" || f.kind === "code") && String(v).length > 255) { errs[f.key] = "ยาวเกิน 255 ตัวอักษร"; continue; }
    if (f.kind === "enum" && !f.options!.includes(String(v))) { errs[f.key] = `ต้องเป็น ${f.options!.join(" / ")}`; continue; }
    out[f.key] = v;
  }
  if (Object.keys(errs).length) throw new ValidationError("ข้อมูลไม่ถูกต้อง", errs);
  return out;
}

/** rules that involve other rows (same checks the import and the scheduler rely on) */
async function crossChecks(conn: PoolConnection, key: EntityKey, row: Record<string, unknown>, id: string | null) {
  if (key === "group_subjects") {
    const [r] = await conn.query<RowDataPacket[]>(
      "SELECT COALESCE(SUM(periods_per_week),0) AS h FROM group_subjects WHERE group_code = ? AND (? IS NULL OR id <> ?)",
      [row.group_code, id, id],
    );
    const total = Number(r[0]!.h) + Number(row.periods_per_week);
    // with ≤4 consecutive periods + a break, a day holds at most 8 periods → 40 per week
    if (total > 40) {
      throw new ValidationError(`กลุ่มนี้จะมี ${total} คาบ/สัปดาห์ เกิน 40 คาบที่จัดได้ (เรียนติดกันได้ไม่เกิน 4 คาบแล้วต้องพัก)`, { periods_per_week: "รวมเกิน 40 คาบ" });
    }
  }
}

function friendlyDbError(e: unknown): never {
  const c = (e as { code?: string })?.code;
  if (c === "ER_DUP_ENTRY") throw new ValidationError("ข้อมูลซ้ำ — มีรายการนี้อยู่แล้ว");
  if (c === "ER_NO_REFERENCED_ROW_2") throw new ValidationError("อ้างถึงข้อมูลที่ไม่มีอยู่");
  throw e;
}

async function withConn<T>(fn: (c: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try { return await fn(conn); } finally { conn.release(); }
}

// ---------- routes ----------

export const manageRoutes = new Elysia({ prefix: "/manage" })
  .get("/meta", () =>
    Object.fromEntries(Object.entries(ENTITIES).map(([k, e]) => [k, {
      label: e.label, pk: e.pk, autoId: e.autoId, fields: e.fields, cascade: e.cascade ?? null,
    }])),
  )
  .get("/:entity", async ({ params, query }) => {
    const ent = getEntity(params.entity);
    const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 500);
    const page = Math.max(Number(query.page ?? 1), 1);
    const search = (query.search ?? "").trim();
    const where = search ? `WHERE (${ent.search.map((c) => `${c} LIKE ?`).join(" OR ")})` : "";
    const args = search ? ent.search.map(() => `%${search}%`) : [];
    const [cnt] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM (${ent.list} ${where}) x`, args);
    const [rows] = await pool.query(`${ent.list} ${where} ORDER BY ${ent.order} LIMIT ? OFFSET ?`, [...args, limit, (page - 1) * limit]);
    return { rows, total: Number(cnt[0]!.n), page, limit };
  }, {
    query: t.Object({ search: t.Optional(t.String()), page: t.Optional(t.String()), limit: t.Optional(t.String()) }),
  })
  .get("/:entity/options", async ({ params }) => {
    const ent = getEntity(params.entity);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT m.${q(ent.pk)} AS value, ${ent.optionLabel} AS label FROM ${q(ent.table)} m ORDER BY label LIMIT 5000`,
    );
    return rows.map((r) => ({ value: String(r.value), label: String(r.label) }));
  })
  .post("/:entity", async ({ params, body }) => {
    const ent = getEntity(params.entity);
    return withConn(async (conn) => {
      const row = await clean(conn, ent, body as Record<string, unknown>);
      await crossChecks(conn, params.entity as EntityKey, row, null);
      const cols = Object.keys(row);
      try {
        const [res] = await conn.query<ResultSetHeader>(
          `INSERT INTO ${q(ent.table)} (${cols.map(q).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
          cols.map((c) => row[c]),
        );
        return { ok: true, id: ent.autoId ? res.insertId : row[ent.pk] };
      } catch (e) { friendlyDbError(e); }
    });
  }, { body: t.Record(t.String(), t.Any()) })
  .put("/:entity/:id", async ({ params, body }) => {
    const ent = getEntity(params.entity);
    const id = decode(params.id);
    return withConn(async (conn) => {
      const row = await clean(conn, ent, body as Record<string, unknown>);
      await crossChecks(conn, params.entity as EntityKey, row, ent.autoId ? id : null);
      const cols = Object.keys(row);
      try {
        const [res] = await conn.query<ResultSetHeader>(
          `UPDATE ${q(ent.table)} SET ${cols.map((c) => `${q(c)} = ?`).join(", ")} WHERE ${q(ent.pk)} = ?`,
          [...cols.map((c) => row[c]), ent.autoId ? Number(id) : id],
        );
        if (!res.affectedRows) throw new ValidationError("ไม่พบรายการที่จะแก้ไข");
        return { ok: true, id: ent.autoId ? Number(id) : row[ent.pk] };
      } catch (e) {
        if (e instanceof ValidationError) throw e;
        friendlyDbError(e);
      }
    });
  }, { body: t.Record(t.String(), t.Any()) })
  .delete("/:entity/:id", async ({ params }) => {
    const ent = getEntity(params.entity);
    const id = decode(params.id);
    const [res] = await pool.query<ResultSetHeader>(
      `DELETE FROM ${q(ent.table)} WHERE ${q(ent.pk)} = ?`, [ent.autoId ? Number(id) : id],
    );
    if (!res.affectedRows) throw new ValidationError("ไม่พบรายการที่จะลบ");
    return { ok: true };
  })
  // ---- teacher unavailability ----
  .get("/teachers/:id/unavailable", async ({ params }) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT day, period FROM teacher_unavailability WHERE teacher_id = ? ORDER BY day, period", [Number(params.id)],
    );
    return rows.map((r) => `${r.day}:${r.period}`);
  })
  .put("/teachers/:id/unavailable", async ({ params, body }) => {
    const teacherId = Number(params.id);
    const slots = [...new Set(body.slots)].map((s) => s.split(":").map(Number) as [number, number]);
    if (slots.some(([d, p]) => !(d >= 0 && d <= 4 && p >= 0 && p <= 9))) throw new ValidationError("ช่วงเวลาไม่ถูกต้อง");
    return withConn(async (conn) => {
      const [t] = await conn.query<RowDataPacket[]>("SELECT 1 FROM teachers WHERE id = ?", [teacherId]);
      if (!t.length) throw new ValidationError("ไม่พบอาจารย์");
      await conn.beginTransaction();
      try {
        await conn.query("DELETE FROM teacher_unavailability WHERE teacher_id = ?", [teacherId]);
        if (slots.length) {
          await conn.query("INSERT INTO teacher_unavailability (teacher_id, day, period) VALUES ?",
            [slots.map(([d, p]) => [teacherId, d, p])]);
        }
        await conn.commit();
      } catch (e) { await conn.rollback(); throw e; }
      return { ok: true, count: slots.length };
    });
  }, { body: t.Object({ slots: t.Array(t.String()) }) });

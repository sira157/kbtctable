import { Elysia, t } from "elysia";
import { pool } from "../db/client";

interface TableDef {
  label: string;
  /** SELECT ... FROM ... (no WHERE / ORDER / LIMIT) */
  from: string;
  columns: { key: string; label: string }[];
  search: string[];
  order: string;
}

// Whitelisted tables — never build SQL from user-supplied identifiers.
export const TABLES: Record<string, TableDef> = {
  class_groups: {
    label: "กลุ่มเรียน",
    from: "SELECT cg.code, cg.name, cg.major, COUNT(gs.id) AS subject_count FROM class_groups cg LEFT JOIN group_subjects gs ON gs.group_code = cg.code",
    columns: [
      { key: "code", label: "รหัสกลุ่มเรียน" }, { key: "name", label: "ชื่อกลุ่มเรียน" },
      { key: "major", label: "สาขาวิชา" }, { key: "subject_count", label: "จำนวนวิชา" },
    ],
    search: ["cg.code", "cg.name", "cg.major"],
    order: "cg.code",
  },
  teachers: {
    label: "อาจารย์",
    from: "SELECT t.id, t.name, t.rank, t.department, COUNT(ts.id) AS subject_count FROM teachers t LEFT JOIN teacher_subjects ts ON ts.teacher_id = t.id",
    columns: [
      { key: "id", label: "#" }, { key: "name", label: "ชื่ออาจารย์" }, { key: "rank", label: "ตำแหน่ง" },
      { key: "department", label: "แผนก" }, { key: "subject_count", label: "จำนวนวิชาที่สอน" },
    ],
    search: ["t.name", "t.rank", "t.department"],
    order: "t.name",
  },
  subjects: {
    label: "รายวิชา",
    from: "SELECT s.code, s.name FROM subjects s",
    columns: [{ key: "code", label: "รหัสวิชา" }, { key: "name", label: "ชื่อวิชา" }],
    search: ["s.code", "s.name"],
    order: "s.code",
  },
  group_subjects: {
    label: "วิชาของกลุ่มเรียน",
    from: "SELECT gs.group_code, cg.name AS group_name, gs.subject_code, s.name AS subject_name, gs.periods_per_week FROM group_subjects gs JOIN class_groups cg ON cg.code = gs.group_code JOIN subjects s ON s.code = gs.subject_code",
    columns: [
      { key: "group_code", label: "รหัสกลุ่ม" }, { key: "group_name", label: "ชื่อกลุ่มเรียน" },
      { key: "subject_code", label: "รหัสวิชา" }, { key: "subject_name", label: "ชื่อวิชา" },
      { key: "periods_per_week", label: "คาบ/สัปดาห์" },
    ],
    search: ["gs.group_code", "cg.name", "gs.subject_code", "s.name"],
    order: "gs.group_code, gs.subject_code",
  },
  teacher_subjects: {
    label: "อาจารย์–รายวิชาที่สอน",
    from: "SELECT t.name AS teacher_name, ts.subject_code, s.name AS subject_name, ts.role FROM teacher_subjects ts JOIN teachers t ON t.id = ts.teacher_id JOIN subjects s ON s.code = ts.subject_code",
    columns: [
      { key: "teacher_name", label: "ชื่ออาจารย์" }, { key: "subject_code", label: "รหัสวิชา" },
      { key: "subject_name", label: "ชื่อวิชา" }, { key: "role", label: "หน้าที่" },
    ],
    search: ["t.name", "ts.subject_code", "s.name", "ts.role"],
    order: "t.name, ts.subject_code",
  },
  buildings: {
    label: "อาคารเรียน",
    from: "SELECT b.id, b.name, COUNT(r.id) AS room_count FROM buildings b LEFT JOIN rooms r ON r.building_id = b.id",
    columns: [{ key: "id", label: "#" }, { key: "name", label: "ชื่ออาคาร" }, { key: "room_count", label: "จำนวนห้อง" }],
    search: ["b.name"],
    order: "b.name",
  },
  rooms: {
    label: "ห้องเรียน",
    from: "SELECT r.id, b.name AS building_name, r.room_code FROM rooms r JOIN buildings b ON b.id = r.building_id",
    columns: [{ key: "id", label: "#" }, { key: "building_name", label: "อาคาร" }, { key: "room_code", label: "ห้อง" }],
    search: ["b.name", "r.room_code"],
    order: "b.name, r.room_code",
  },
};

const GROUPED = new Set(["class_groups", "teachers", "buildings"]);
const GROUP_BY: Record<string, string> = { class_groups: "cg.code", teachers: "t.id", buildings: "b.id" };

export const dataRoutes = new Elysia({ prefix: "/data" })
  .get("/", () =>
    Object.entries(TABLES).map(([key, d]) => ({ key, label: d.label })),
  )
  .get("/stats", async () => {
    const out: Record<string, number> = {};
    for (const table of Object.keys(TABLES)) {
      const [rows] = await pool.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
      out[table] = Number((rows as { n: number }[])[0]?.n ?? 0);
    }
    return out;
  })
  .get(
    "/:table",
    async ({ params, query, set }) => {
      const def = TABLES[params.table];
      if (!def) {
        set.status = 404;
        return { message: "ไม่พบตาราง" };
      }
      const limit = Math.min(Math.max(Number(query.limit ?? 50), 1), 500);
      const page = Math.max(Number(query.page ?? 1), 1);
      const search = (query.search ?? "").trim();

      const where = search ? `WHERE (${def.search.map((c) => `${c} LIKE ?`).join(" OR ")})` : "";
      const args = search ? def.search.map(() => `%${search}%`) : [];
      const groupBy = GROUPED.has(params.table) ? `GROUP BY ${GROUP_BY[params.table]}` : "";

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS n FROM (${def.from} ${where} ${groupBy}) x`,
        args,
      );
      const [rows] = await pool.query(
        `${def.from} ${where} ${groupBy} ORDER BY ${def.order} LIMIT ? OFFSET ?`,
        [...args, limit, (page - 1) * limit],
      );
      const total = Number((countRows as { n: number }[])[0]?.n ?? 0);
      return { table: params.table, label: def.label, columns: def.columns, rows, total, page, limit };
    },
    {
      query: t.Object({
        search: t.Optional(t.String()),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    },
  );

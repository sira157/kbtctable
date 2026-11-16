// Creates the database (utf8mb4) and any missing tables. Safe to re-run: never drops or alters existing data.
// Plain SQL instead of `drizzle-kit push`, which crashes on MariaDB (XAMPP) JSON check constraints.
// Keep in sync with ./schema.ts.
import mysql from "mysql2/promise";

const name = process.env.DB_NAME ?? "myapp";
if (!/^\w+$/.test(name)) throw new Error(`Invalid DB_NAME: ${name}`);

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  charset: "utf8mb4",
  multipleStatements: true,
});
await conn.query(
  `CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
);
await conn.query(`USE \`${name}\``);

const T = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
const ddl = `
CREATE TABLE IF NOT EXISTS class_groups (
  code VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  major VARCHAR(255) NULL
) ${T};
CREATE TABLE IF NOT EXISTS teachers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  \`rank\` VARCHAR(100) NULL,
  department VARCHAR(255) NULL,
  UNIQUE KEY teachers_name_unique (name)
) ${T};
CREATE TABLE IF NOT EXISTS subjects (
  code VARCHAR(32) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
) ${T};
CREATE TABLE IF NOT EXISTS group_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_code VARCHAR(32) NOT NULL,
  subject_code VARCHAR(32) NOT NULL,
  periods_per_week INT NOT NULL,
  UNIQUE KEY uq_group_subject (group_code, subject_code),
  CONSTRAINT fk_gs_group FOREIGN KEY (group_code) REFERENCES class_groups(code) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_gs_subject FOREIGN KEY (subject_code) REFERENCES subjects(code) ON DELETE CASCADE ON UPDATE CASCADE
) ${T};
CREATE TABLE IF NOT EXISTS teacher_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  subject_code VARCHAR(32) NOT NULL,
  role ENUM('ผู้สอนหลัก','ผู้สอนร่วม') NOT NULL,
  UNIQUE KEY uq_teacher_subject (teacher_id, subject_code),
  CONSTRAINT fk_ts_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_ts_subject FOREIGN KEY (subject_code) REFERENCES subjects(code) ON DELETE CASCADE ON UPDATE CASCADE
) ${T};
CREATE TABLE IF NOT EXISTS buildings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  UNIQUE KEY buildings_name_unique (name)
) ${T};
CREATE TABLE IF NOT EXISTS rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  building_id INT NOT NULL,
  room_code VARCHAR(64) NOT NULL,
  UNIQUE KEY uq_building_room (building_id, room_code),
  CONSTRAINT fk_rooms_building FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
) ${T};
CREATE TABLE IF NOT EXISTS import_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(32) NOT NULL,
  inserted INT NOT NULL DEFAULT 0,
  updated INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  details JSON NULL,
  errors JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ${T};
CREATE TABLE IF NOT EXISTS schedule_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  options JSON NULL,
  summary JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ${T};
CREATE TABLE IF NOT EXISTS schedule_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_id INT NOT NULL,
  group_code VARCHAR(32) NOT NULL,
  subject_code VARCHAR(32) NOT NULL,
  teacher_id INT NULL,
  building VARCHAR(255) NOT NULL,
  day INT NOT NULL,
  period INT NOT NULL,
  block_id INT NOT NULL,
  split INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_run_group_slot (run_id, group_code, day, period),
  UNIQUE KEY uq_run_teacher_slot (run_id, teacher_id, day, period),
  KEY ix_run_building (run_id, building),
  CONSTRAINT fk_se_run FOREIGN KEY (run_id) REFERENCES schedule_runs(id) ON DELETE CASCADE
) ${T};
`;
await conn.query(ddl);

// ---- additive migrations (portable: MySQL 8 has no ADD COLUMN IF NOT EXISTS) ----
async function hasColumn(table: string, column: string) {
  const [r] = await conn.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [name, table, column],
  );
  return (r as unknown[]).length > 0;
}
async function hasIndex(table: string, index: string) {
  const [r] = await conn.query(
    "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?",
    [name, table, index],
  );
  return (r as unknown[]).length > 0;
}
async function addColumn(table: string, column: string, def: string) {
  if (!(await hasColumn(table, column))) {
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`);
    console.log(`+ ${table}.${column}`);
  }
}
async function addIndex(table: string, index: string, def: string) {
  if (!(await hasIndex(table, index))) {
    await conn.query(`ALTER TABLE \`${table}\` ADD ${def}`);
    console.log(`+ index ${table}.${index}`);
  }
}

async function dropIndex(table: string, index: string) {
  if (await hasIndex(table, index)) {
    await conn.query(`ALTER TABLE \`${table}\` DROP INDEX \`${index}\``);
    console.log(`- index ${table}.${index}`);
  }
}

// subject name exactly as written per group (registration file) and per teaching row (teacher file):
// one code can carry different names in different groups → teachers are matched on code + name
await addColumn("group_subjects", "subject_name", "VARCHAR(255) NOT NULL DEFAULT ''");
await addColumn("teacher_subjects", "subject_name", "VARCHAR(255) NOT NULL DEFAULT ''");
await addIndex("teacher_subjects", "uq_teacher_subject_name",
  "UNIQUE KEY uq_teacher_subject_name (teacher_id, subject_code, subject_name)");
await dropIndex("teacher_subjects", "uq_teacher_subject");

await addColumn("class_groups", "students", "INT NULL");
await addColumn("subjects", "room_type", "VARCHAR(20) NULL");
await addColumn("rooms", "capacity", "INT NULL");
await addColumn("rooms", "room_type", "VARCHAR(20) NULL");
await addColumn("schedule_entries", "room_id", "INT NULL");
await addIndex("schedule_entries", "uq_run_room_slot", "UNIQUE KEY uq_run_room_slot (run_id, room_id, day, period)");
await conn.query(`
CREATE TABLE IF NOT EXISTS teacher_unavailability (
  teacher_id INT NOT NULL,
  day INT NOT NULL,
  period INT NOT NULL,
  PRIMARY KEY (teacher_id, day, period),
  CONSTRAINT fk_tu_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
) ${T}`);

const [rows] = await conn.query("SHOW TABLES");
console.log(`Database "${name}" ready — ${(rows as unknown[]).length} tables`);
await conn.end();

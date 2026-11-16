import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema";

export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME ?? "myapp",
  charset: "utf8mb4",
  connectionLimit: 10,
});

export const db = drizzle(pool, { schema, mode: "default" });

/**
 * MariaDB (XAMPP) stores JSON as LONGTEXT, so json() columns come back as strings;
 * MySQL 8 returns parsed objects. Normalise both to objects.
 */
export function asJson<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    try { return JSON.parse(v) as T; } catch { return null; }
  }
  return v as T;
}
export type DB = typeof db;

import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { dbConfig } from "./config";
import * as schema from "./schema";

export const pool = mysql.createPool({
  ...dbConfig(),
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

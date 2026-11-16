import { afterEach, expect, test } from "bun:test";
import { dbConfig } from "../src/db/config";

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

test("Aiven DATABASE_URL with ssl-mode=REQUIRED", () => {
  process.env.DATABASE_URL = "mysql://avnadmin:p%40ss@mysql-x.aivencloud.com:23456/defaultdb?ssl-mode=REQUIRED";
  delete process.env.DB_SSL_CA;
  expect(dbConfig()).toEqual({
    host: "mysql-x.aivencloud.com", port: 23456, user: "avnadmin", password: "p@ss", database: "defaultdb",
    ssl: { rejectUnauthorized: false },
  });
});

test("CA certificate turns on verification (\\n in env is unescaped)", () => {
  process.env.DATABASE_URL = "mysql://u:p@h:3306/db";
  process.env.DB_SSL_CA = "-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----";
  expect(dbConfig().ssl).toEqual({ ca: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----", rejectUnauthorized: true });
});

test("local settings without DATABASE_URL → no SSL", () => {
  delete process.env.DATABASE_URL;
  delete process.env.DB_SSL_CA;
  delete process.env.DB_SSL;
  process.env.DB_USER = "root";
  process.env.DB_NAME = "myapp";
  const c = dbConfig();
  expect(c.ssl).toBeUndefined();
  expect(c.database).toBe("myapp");
});

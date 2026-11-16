import { defineConfig } from "drizzle-kit";

// URL form so an empty password (XAMPP default) is accepted.
const user = encodeURIComponent(process.env.DB_USER ?? "root");
const pass = process.env.DB_PASSWORD ? `:${encodeURIComponent(process.env.DB_PASSWORD)}` : "";
const host = process.env.DB_HOST ?? "127.0.0.1";
const port = process.env.DB_PORT ?? "3306";
const name = process.env.DB_NAME ?? "myapp";

export default defineConfig({
  schema: "./src/db/schema.ts",
  dialect: "mysql",
  dbCredentials: { url: `mysql://${user}${pass}@${host}:${port}/${name}` },
});

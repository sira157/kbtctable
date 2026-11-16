import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { ImportError } from "./import/service";
import { dataRoutes } from "./routes/data";
import { importRoutes } from "./routes/import";
import { manageRoutes, ValidationError } from "./routes/manage";
import { scheduleRoutes } from "./routes/schedule";
import { ScheduleError } from "./schedule/service";

const port = Number(process.env.PORT ?? 3001);

const app = new Elysia()
  .use(cors({
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000")
      .split(",").map((s) => s.trim()),
  }))
  .onError(({ error, code, set }) => {
    if (error instanceof ImportError || error instanceof ScheduleError) {
      set.status = 400;
      return { message: error.message };
    }
    if (error instanceof ValidationError) {
      set.status = 400;
      return { message: error.message, fieldErrors: error.fieldErrors };
    }
    if (code === "VALIDATION") {
      set.status = 400;
      return { message: "ข้อมูลที่ส่งมาไม่ถูกต้อง" };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { message: "Not found" };
    }
    console.error(error);
    set.status = 500;
    const errCode = (error as { code?: string })?.code;
    if (errCode === "ECONNREFUSED" || errCode === "ER_ACCESS_DENIED_ERROR" || errCode === "ER_BAD_DB_ERROR") {
      return { message: `เชื่อมต่อ MySQL ไม่ได้ (${errCode}) — ตรวจสอบว่าเปิด MySQL แล้ว และค่าใน backend/.env ถูกต้อง` };
    }
    if (errCode === "ER_NO_SUCH_TABLE") {
      return { message: "ยังไม่ได้สร้างตาราง — รัน `bun run db:setup` ในโฟลเดอร์ backend" };
    }
    const msg = error instanceof Error ? error.message : String(error);
    return { message: `เกิดข้อผิดพลาดที่เซิร์ฟเวอร์: ${msg}` };
  })
  .get("/", () => ({ ok: true, name: "myapp-backend" }))
  .group("/api", (api) => api.use(importRoutes).use(dataRoutes).use(scheduleRoutes).use(manageRoutes))
  .listen(port);

console.log(`🦊 Elysia API running at http://localhost:${app.server?.port}`);

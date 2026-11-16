import { Elysia, t } from "elysia";
import {
  allEntries, deleteRun, generate, getRun, latestRunId, listRuns, viewGrid, viewKeys, type ViewBy,
} from "../schedule/service";
import { DAYS } from "../schedule/types";

const By = t.Union([t.Literal("group"), t.Literal("teacher"), t.Literal("building"), t.Literal("room")]);

async function resolveRun(id: string) {
  return id === "latest" ? latestRunId() : Number(id);
}

export const scheduleRoutes = new Elysia({ prefix: "/schedule" })
  .post("/generate", ({ body }) => generate({ activityMode: body?.activityMode ?? "period10" }), {
    body: t.Optional(t.Object({ activityMode: t.Optional(t.Union([t.Literal("period10"), t.Literal("groupLast")])) })),
  })
  .get("/runs", () => listRuns())
  .get("/runs/:id", async ({ params, set }) => {
    const id = await resolveRun(params.id);
    const run = id ? await getRun(id) : null;
    if (run) return run;
    set.status = 404;
    return { message: "ยังไม่มีตารางสอน — กด \"จัดตารางอัตโนมัติ\"" };
  })
  .delete("/runs/:id", async ({ params }) => {
    await deleteRun(Number(params.id));
    return { ok: true };
  })
  .get("/runs/:id/keys", async ({ params, query }) => viewKeys(Number(params.id), query.by as ViewBy), {
    query: t.Object({ by: By }),
  })
  .get("/runs/:id/grid", async ({ params, query }) => viewGrid(Number(params.id), query.by as ViewBy, query.key), {
    query: t.Object({ by: By, key: t.String() }),
  })
  .get("/runs/:id/export.csv", async ({ params, set }) => {
    const rows = await allEntries(Number(params.id));
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["รหัสกลุ่ม", "ชื่อกลุ่ม", "วัน", "คาบ", "รหัสวิชา", "ชื่อวิชา", "อาจารย์", "อาคาร", "ห้อง"];
    const lines = rows.map((r) => [
      r.groupCode, r.groupName, DAYS[r.day], r.period + 1, r.subjectCode, r.subjectName,
      r.teacherName ?? "รอจัดสรรอาจารย์", r.building, r.roomCode ?? "",
    ].map(esc).join(","));
    set.headers["content-type"] = "text/csv; charset=utf-8";
    set.headers["content-disposition"] = `attachment; filename="timetable-${params.id}.csv"`;
    return "﻿" + [header.map(esc).join(","), ...lines].join("\r\n");
  });

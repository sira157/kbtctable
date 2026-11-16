import { Elysia, t } from "elysia";
import { exportPages, VIEW_LABELS } from "../export/data";
import { buildExcel } from "../export/excel";
import { buildPdf } from "../export/pdf";
import type { ViewBy } from "../schedule/service";
import { attachment } from "./templates";

const By = t.Optional(t.Union([t.Literal("group"), t.Literal("teacher"), t.Literal("building"), t.Literal("room")]));
const query = t.Object({ by: By, key: t.Optional(t.String()) });

function fileName(runId: number, by: ViewBy, label: string | undefined, ext: string) {
  const what = label ? label.replace(/[\\/:*?"<>|]/g, " ").trim() : `ทุก${VIEW_LABELS[by]}`;
  return `ตารางสอน-${what}-ครั้งที่${runId}.${ext}`;
}

/** Excel / PDF export of a run, per group / teacher / building / room (all, or one key) */
export const exportRoutes = new Elysia({ prefix: "/schedule/runs/:id" })
  .get("/export.xlsx", async ({ params, query: q, set }) => {
    const by = (q.by ?? "group") as ViewBy;
    const data = await exportPages(Number(params.id), by, q.key);
    if (!data) { set.status = 404; return { message: "ไม่พบผลการจัดตาราง" }; }
    const bytes = buildExcel(data.pages, q.key ? data.pages.flatMap((p) => p.entries) : data.all, by, data.run.id);
    const ct = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return new Response(bytes, { headers: { "content-type": ct, "content-disposition": attachment(fileName(data.run.id, by, q.key ? data.pages[0]?.label : undefined, "xlsx")) } });
  }, { query })
  .get("/export.pdf", async ({ params, query: q, set }) => {
    const by = (q.by ?? "group") as ViewBy;
    const data = await exportPages(Number(params.id), by, q.key);
    if (!data) { set.status = 404; return { message: "ไม่พบผลการจัดตาราง" }; }
    const bytes = await buildPdf(data.pages, by, data.run.id, data.run.createdAt);
    return new Response(bytes as unknown as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": attachment(fileName(data.run.id, by, q.key ? data.pages[0]?.label : undefined, "pdf")) } });
  }, { query });

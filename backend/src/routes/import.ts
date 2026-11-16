import { Elysia, t } from "elysia";
import { commit, getImport, listImports, preview } from "../import/service";

const fileBody = { body: t.Object({ file: t.File() }) };

export const importRoutes = new Elysia()
  .post("/import/preview", ({ body }) => preview(body.file), fileBody)
  .post("/import/commit", ({ body }) => commit(body.file), fileBody)
  .get("/imports", () => listImports())
  .get("/imports/:id", async ({ params, set }) => {
    const row = await getImport(Number(params.id));
    if (row) return row;
    set.status = 404;
    return { message: "ไม่พบประวัติการนำเข้า" };
  });

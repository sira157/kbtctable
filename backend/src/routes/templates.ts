import { Elysia, t } from "elysia";
import {
  buildTemplate, TEMPLATE_FORMATS, TEMPLATE_SIZES, TEMPLATE_TYPES, templateInfo,
  type TemplateFormat, type TemplateSize, type TemplateType,
} from "../templates/generate";

/** RFC 5987 header so Thai file names survive the download */
export const attachment = (fileName: string) =>
  `attachment; filename="${fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

export const templateRoutes = new Elysia({ prefix: "/templates" })
  .get("/", () => ({ sizes: templateInfo(), types: TEMPLATE_TYPES, formats: TEMPLATE_FORMATS }))
  .get("/:type", ({ params, query, set }) => {
    const type = params.type as TemplateType;
    const size = (query.size ?? "small") as TemplateSize;
    const format = (query.format ?? "xlsx") as TemplateFormat;
    if (!TEMPLATE_TYPES.includes(type) || !TEMPLATE_SIZES.includes(size) || !TEMPLATE_FORMATS.includes(format)) {
      set.status = 400;
      return { message: "ประเภท/ขนาด/รูปแบบแม่แบบไม่ถูกต้อง" };
    }
    const f = buildTemplate(type, size, format);
    set.headers["content-type"] = f.contentType;
    set.headers["content-disposition"] = attachment(f.fileName);
    return new Response(f.bytes, { headers: { "content-type": f.contentType, "content-disposition": attachment(f.fileName) } });
  }, { query: t.Object({ size: t.Optional(t.String()), format: t.Optional(t.String()) }) });

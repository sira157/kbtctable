import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { ViewBy } from "../schedule/service";
import { cellLines, DAYS, PERIODS, VIEW_LABELS, type ExportEntry, type ExportPage } from "./data";

const FONT_DIR = join(import.meta.dir, "..", "..", "assets", "fonts");
const REGULAR = join(FONT_DIR, "Sarabun-Regular.ttf");
const BOLD = join(FONT_DIR, "Sarabun-Bold.ttf");

const words = new Intl.Segmenter("th", { granularity: "word" });
const graphemes = new Intl.Segmenter("th", { granularity: "grapheme" });

type Doc = PDFKit.PDFDocument;

/** Wrap Thai text at word boundaries (Thai has no spaces); cut with "…" when it does not fit in maxLines. */
function wrap(doc: Doc, text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  const fits = (s: string) => doc.widthOfString(s) <= width;
  for (const { segment } of words.segment(text)) {
    if (fits(cur + segment)) { cur += segment; continue; }
    if (cur.trim()) lines.push(cur.trimEnd());
    cur = segment.trimStart();
    // a single word wider than the cell → break by grapheme (never splits a vowel/tone mark from its consonant)
    while (!fits(cur)) {
      let part = "";
      for (const { segment: g } of graphemes.segment(cur)) {
        if (!fits(part + g)) break;
        part += g;
      }
      if (!part) break;
      lines.push(part);
      cur = cur.slice(part.length);
    }
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  let last = out[maxLines - 1]!;
  while (last && !fits(last + "…")) last = [...graphemes.segment(last)].slice(0, -1).map((s) => s.segment).join("");
  out[maxLines - 1] = last + "…";
  return out;
}

/** A4 landscape, one page per group / teacher / building / room */
export function buildPdf(pages: ExportPage[], by: ViewBy, runId: number, createdAt: Date): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28, autoFirstPage: false, info: { Title: `ตารางสอน (${VIEW_LABELS[by]})` } });
  doc.registerFont("th", REGULAR);
  doc.registerFont("th-bold", BOLD);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Uint8Array>((resolve) => doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks)))));

  const printed = new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  const runDate = createdAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  const list = pages.length ? pages : [{ key: "", label: "ไม่มีข้อมูล", hours: 0, entries: [] }];

  list.forEach((p, idx) => {
    doc.addPage();
    const left = doc.page.margins.left;
    const top = doc.page.margins.top;
    const W = doc.page.width - left - doc.page.margins.right;
    const H = doc.page.height - top - doc.page.margins.bottom;

    // title
    doc.font("th-bold").fontSize(16).fillColor("#1e1b4b").text(`ตารางสอน${VIEW_LABELS[by]}: ${p.label}`, left, top, { width: W, lineBreak: false });
    doc.font("th").fontSize(9).fillColor("#475569")
      .text(`${p.hours} คาบ/สัปดาห์ · จันทร์–ศุกร์ วันละ 10 คาบ · ผลการจัดครั้งที่ ${runId} (${runDate})`, left, top + 22, { width: W, lineBreak: false });

    // grid
    const gridTop = top + 40;
    const headH = 18;
    const dayW = 56;
    const colW = (W - dayW) / PERIODS;
    const rowH = (H - 40 - headH - 16) / DAYS.length;
    doc.lineWidth(0.5).strokeColor("#94a3b8");

    doc.rect(left, gridTop, W, headH).fillAndStroke("#e2e8f0", "#94a3b8");
    doc.fillColor("#334155").font("th-bold").fontSize(9).text("วัน / คาบ", left + 4, gridTop + 4, { width: dayW - 8, lineBreak: false });
    for (let i = 0; i < PERIODS; i++) {
      doc.text(`${i + 1}`, left + dayW + i * colW, gridTop + 4, { width: colW, align: "center", lineBreak: false });
    }

    const cell = new Map<string, ExportEntry[]>();
    for (const e of p.entries) {
      const k = `${e.day}|${e.period}`;
      (cell.get(k) ?? cell.set(k, []).get(k)!).push(e);
    }

    DAYS.forEach((day, d) => {
      const y = gridTop + headH + d * rowH;
      doc.rect(left, y, dayW, rowH).fillAndStroke("#f8fafc", "#94a3b8");
      doc.fillColor("#334155").font("th-bold").fontSize(10).text(day, left + 4, y + rowH / 2 - 7, { width: dayW - 8, lineBreak: false });

      for (let pi = 0; pi < PERIODS; pi++) {
        const items = cell.get(`${d}|${pi}`) ?? [];
        let span = 1;
        // merge consecutive periods of the same block (same group, subject, teacher, room)
        if (items.length === 1) {
          const e = items[0]!;
          while (pi + span < PERIODS) {
            const n = cell.get(`${d}|${pi + span}`);
            if (n?.length === 1 && n[0]!.groupCode === e.groupCode && n[0]!.subjectCode === e.subjectCode
              && n[0]!.teacherName === e.teacherName && n[0]!.roomCode === e.roomCode) span++;
            else break;
          }
        }
        const x = left + dayW + pi * colW;
        const w = colW * span;
        const pending = items.length === 1 && items[0]!.teacherId === null;
        const activity = items.length === 1 && (items[0]!.subjectName ?? "").startsWith("กิจกรรมองค์การวิชาชีพ");
        const fill = !items.length ? "#ffffff" : items.length > 1 ? "#e0f2fe" : activity ? "#ede9fe" : pending ? "#fef3c7" : "#e0e7ff";
        doc.rect(x, y, w, rowH).fillAndStroke(fill, "#94a3b8");

        if (items.length) {
          const pad = 3;
          const tw = w - pad * 2;
          const maxLines = Math.max(1, Math.floor((rowH - pad * 2) / 9.5));
          const lines: { text: string; bold: boolean; color: string }[] = [];
          if (items.length === 1) {
            cellLines(items[0]!, by).forEach((t, i) => lines.push({ text: t, bold: i === 0, color: i === 0 ? "#0f172a" : t === "รอจัดสรรอาจารย์" ? "#b45309" : "#334155" }));
          } else {
            lines.push({ text: `${items.length} กลุ่ม`, bold: true, color: "#0f172a" });
            for (const it of items) lines.push({ text: `${it.groupCode} ${it.subjectCode}`, bold: false, color: "#334155" });
          }
          let ty = y + pad;
          let used = 0;
          for (const l of lines) {
            if (used >= maxLines) break;
            doc.font(l.bold ? "th-bold" : "th").fontSize(7.5).fillColor(l.color);
            const wrapped = wrap(doc, l.text, tw, Math.min(2, maxLines - used));
            for (const wl of wrapped) {
              doc.text(wl, x + pad, ty, { width: tw, lineBreak: false });
              ty += 9.5;
              used++;
            }
          }
        }
        pi += span - 1;
      }
    });

    // footer — kept inside the content area, otherwise pdfkit starts a new (empty) page
    doc.font("th").fontSize(8).fillColor("#94a3b8").text(
      `ระบบจัดตารางสอน · พิมพ์เมื่อ ${printed} · หน้า ${idx + 1}/${list.length}`,
      left, top + H - 11, { width: W, align: "right", lineBreak: false, height: 11 },
    );
  });

  doc.end();
  return done;
}

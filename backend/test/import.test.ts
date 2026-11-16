import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detectFileType } from "../src/import/detect";
import { code, positiveInt, text } from "../src/import/normalize";
import { parsers } from "../src/import/parsers";
import type { ImportData } from "../src/import/types";
import { readWorkbook } from "../src/import/workbook";

const ROOT = join(import.meta.dir, "..", "..");
const fixture = (prefix: string) => {
  const name = readdirSync(ROOT).find((f) => f.startsWith(prefix) && f.endsWith(".xlsx"));
  if (!name) throw new Error(`fixture not found: ${prefix}`);
  return readWorkbook(readFileSync(join(ROOT, name)));
};

describe("normalize", () => {
  test("code converts float / scientific codes to integer strings", () => {
    expect(code(662010101)).toBe("662010101");
    expect(code(6.62010101e8)).toBe("662010101");
    expect(code("6.62010101E8")).toBe("662010101");
    expect(code("662010101.0")).toBe("662010101");
    expect(code(" 662010101\n")).toBe("662010101");
    expect(code("20101-2108")).toBe("20101-2108");
  });
  test("text trims and collapses whitespace", () => {
    expect(text("  ปวช.66\n ช่างยนต์  1 ")).toBe("ปวช.66 ช่างยนต์ 1");
    expect(text(null)).toBe("");
  });
  test("positiveInt", () => {
    expect(positiveInt(4)).toBe(4);
    expect(positiveInt("3.0")).toBe(3);
    expect(positiveInt(0)).toBeNull();
    expect(positiveInt("abc")).toBeNull();
    expect(positiveInt(2.5)).toBeNull();
  });
});

describe("real files", () => {
  const cases = [
    ["กลุ่มเรียน", "class_groups"],
    ["รหัสและชื่อวิชา", "subjects"],
    ["ชื่ออาจารย์", "teachers"],
    ["อาคารเรียน", "buildings"],
  ] as const;

  for (const [prefix, type] of cases) {
    test(`detects ${type}`, () => {
      expect(detectFileType(fixture(prefix))).toBe(type);
    });
  }

  const parse = (prefix: string, type: keyof typeof parsers) => parsers[type](fixture(prefix));

  test("class groups: 45 groups with integer codes", () => {
    const { data, issues } = parse("กลุ่มเรียน", "class_groups");
    const d = data as Extract<ImportData, { type: "class_groups" }>;
    expect(d.groups.length).toBe(45);
    expect(d.groups[0]).toEqual({ code: "662010101", name: "ปวช.66 ช่างยนต์ 1", major: "ช่างยนต์", students: null });
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  test("teachers: deduplicated to 20 and every assignment has a valid role", () => {
    const { data } = parse("ชื่ออาจารย์", "teachers");
    const d = data as Extract<ImportData, { type: "teachers" }>;
    expect(d.teachers.length).toBe(20);
    expect(d.assignments.length).toBeGreaterThan(0);
    expect(d.assignments.every((a) => a.role === "ผู้สอนหลัก" || a.role === "ผู้สอนร่วม")).toBe(true);
    expect(d.subjects.every((s) => s.code && !/\s/.test(s.code))).toBe(true);
  });

  test("subjects: group codes are clean and periods positive", () => {
    const { data } = parse("รหัสและชื่อวิชา", "subjects");
    const d = data as Extract<ImportData, { type: "subjects" }>;
    expect(d.groupSubjects.length).toBeGreaterThan(1000);
    // codes are trimmed (no stray newlines) and periods are positive integers
    expect(d.groupSubjects.every((g) => g.groupCode && !/\s/.test(g.groupCode) && g.periodsPerWeek > 0)).toBe(true);
    expect(d.groupSubjects.some((g) => g.groupCode === "662010101")).toBe(true);
  });

  test("buildings: 5 distinct, blank rows skipped", () => {
    const { data } = parse("อาคารเรียน", "buildings");
    const d = data as Extract<ImportData, { type: "buildings" }>;
    expect(d.buildings.length).toBe(5);
  });
});

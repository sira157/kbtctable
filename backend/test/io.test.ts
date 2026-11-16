import { describe, expect, test } from "bun:test";
import { detectFileType } from "../src/import/detect";
import { parsers } from "../src/import/parsers";
import type { ImportData } from "../src/import/types";
import { readInput } from "../src/import/workbook";
import { buildInput } from "../src/schedule/input";
import { solve } from "../src/schedule/solver";
import { validate } from "../src/schedule/validate";
import { buildTemplate, sampleData, TEMPLATE_FORMATS, TEMPLATE_TYPES } from "../src/templates/generate";

const enc = (s: string) => new TextEncoder().encode(s);

describe("CSV / JSON input", () => {
  test("CSV keeps codes as text, strips BOM, reads Thai", () => {
    const sheets = readInput("groups.csv", enc("﻿รหัสกลุ่มเรียน,ชื่อกลุ่มเรียน,สาขาวิชา\n662010101,ปวช.66 ช่างยนต์ 1,ช่างยนต์\n"));
    expect(detectFileType(sheets)).toBe("class_groups");
    const d = parsers.class_groups(sheets).data as Extract<ImportData, { type: "class_groups" }>;
    expect(d.groups[0]).toMatchObject({ code: "662010101", name: "ปวช.66 ช่างยนต์ 1" });
  });

  test("JSON array of rows", () => {
    const sheets = readInput("subjects.json", enc(JSON.stringify([
      { รหัสวิชาเรียน: "20101-2001", ชื่อวิชา: "งานยนต์", รหัสกลุ่มเรียน: 662010101, คาบเรียนต่อสัปดาห์: 4 },
    ])));
    expect(detectFileType(sheets)).toBe("subjects");
    const d = parsers.subjects(sheets).data as Extract<ImportData, { type: "subjects" }>;
    expect(d.groupSubjects[0]).toMatchObject({ groupCode: "662010101", subjectCode: "20101-2001", periodsPerWeek: 4 });
  });

  test("JSON object of sheets (teacher list + teaching rows)", () => {
    const sheets = readInput("t.json", enc(JSON.stringify({
      อาจารย์: [{ teacher_name: "ครูเอ", rank: "อาจารย์", department: "อุตสาหกรรม" }],
      วิชาและอาจารย์ผู้สอน: [{ รหัสวิชา: "20101-2001", ชื่อวิชา: "งานยนต์", ชื่ออาจารย์: "ครูเอ", หน้าที่: "ผู้สอนหลัก" }],
    })));
    const d = parsers.teachers(sheets).data as Extract<ImportData, { type: "teachers" }>;
    expect(d.teachers).toEqual([{ name: "ครูเอ", rank: "อาจารย์", department: "อุตสาหกรรม" }]);
    expect(d.assignments).toHaveLength(1);
  });

  test("combined teacher CSV (one table) is split into list + teaching rows", () => {
    const sheets = readInput("t.csv", enc("รหัสวิชา,ชื่อวิชา,ชื่ออาจารย์,หน้าที่,ตำแหน่ง,แผนก\n20101-2001,งานยนต์,ครูเอ,ผู้สอนหลัก,อาจารย์,อุตสาหกรรม\n20101-2002,ไฟฟ้า,ครูเอ,ผู้สอนร่วม,,\n"));
    expect(detectFileType(sheets)).toBe("teachers");
    const d = parsers.teachers(sheets).data as Extract<ImportData, { type: "teachers" }>;
    expect(d.teachers).toEqual([{ name: "ครูเอ", rank: "อาจารย์", department: "อุตสาหกรรม" }]); // blank 2nd row keeps rank
    expect(d.assignments.map((a) => a.role)).toEqual(["ผู้สอนหลัก", "ผู้สอนร่วม"]);
  });

  test("bad JSON / unsupported extension give a clear error", () => {
    expect(() => readInput("x.json", enc("{oops"))).toThrow("JSON");
    expect(() => readInput("x.txt", enc("a"))).toThrow(".xlsx");
  });
});

describe("templates", () => {
  for (const size of ["small", "medium", "large"] as const) {
    for (const format of TEMPLATE_FORMATS) {
      test(`${size} ${format}: every file re-imports with the right type and no errors`, () => {
        for (const type of TEMPLATE_TYPES) {
          const f = buildTemplate(type, size, format);
          const sheets = readInput(f.fileName, f.bytes);
          expect(detectFileType(sheets)).toBe(type);
          const parsed = parsers[type](sheets);
          expect(parsed.issues.filter((i) => i.level === "error")).toEqual([]);
        }
      });
    }

    test(`${size}: the sample set schedules with 0 violations, all placed, every period has a teacher`, () => {
      const d = sampleData(size);
      const teachers = d.teacherList.map((t, i) => ({ id: i + 1, name: String(t.teacher_name), department: String(t.department) }));
      const tid = new Map(teachers.map((t) => [t.name, t.id]));
      const bNames = [...new Set(d.buildings.map((b) => String(b.building_name)))];
      const { input } = buildInput({
        groups: d.groups.map((g) => ({ code: String(g.รหัสกลุ่มเรียน), name: String(g.ชื่อกลุ่มเรียน), major: String(g.สาขาวิชา), students: Number(g.จำนวนนักศึกษา) })),
        subjects: [...new Map(d.subjects.map((s) => [String(s.รหัสวิชาเรียน), { code: String(s.รหัสวิชาเรียน), name: String(s.ชื่อวิชา) }])).values()],
        groupSubjects: d.subjects.map((s) => ({ groupCode: String(s.รหัสกลุ่มเรียน), subjectCode: String(s.รหัสวิชาเรียน), subjectName: String(s.ชื่อวิชา), periodsPerWeek: Number(s.คาบเรียนต่อสัปดาห์) })),
        teachers,
        teacherSubjects: d.teaching.map((t) => ({ teacherId: tid.get(String(t.ชื่ออาจารย์))!, subjectCode: String(t.รหัสวิชา), subjectName: String(t.ชื่อวิชา), role: String(t.หน้าที่) })),
        buildings: [...bNames, "อาคารเรียนรวม"].filter((v, i, a) => a.indexOf(v) === i),
        rooms: d.buildings.map((b, i) => ({ id: i + 1, building: String(b.building_name), roomCode: String(b.ห้องเรียน), capacity: Number(b.ความจุ), roomType: String(b.ประเภทห้อง) })),
      });
      const r = solve(input);
      expect(validate(input, r.entries).totalViolations).toBe(0);
      expect(r.unplaced).toEqual([]);
      expect(r.entries.filter((e) => e.teacherId === null)).toEqual([]);
    });
  }

  test("blank templates contain only the header row", () => {
    for (const type of TEMPLATE_TYPES) {
      const f = buildTemplate(type, "blank", "xlsx");
      const sheets = readInput(f.fileName, f.bytes);
      expect(sheets.every((s) => s.rows.length === 1)).toBe(true);
      expect(detectFileType(sheets)).toBe(type);
    }
  });
});
